import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, basename, extname, join } from "path";
import type { AIProvider, ChatMessage } from "../provider/interface.js";
import type { GlossaryConfig } from "./glossary.js";
import { buildGlossaryPrompt } from "./glossary.js";

export const DEFAULT_MAX_CHUNK_LINES = 300;
const MIN_CHUNK_LINES = 50;

interface FrontmatterSeparation {
  frontmatter: string | null;
  body: string;
}

/**
 * Separate frontmatter from Markdown content
 * Handles: LF, CRLF, no trailing newline after closing ---, trailing spaces, empty frontmatter
 * @param content - Full Markdown content
 * @returns Object with separated frontmatter and body
 */
export function separateFrontmatter(content: string): FrontmatterSeparation {
  // Normalize CRLF to LF for regex matching
  const normalized = content.replace(/\r\n/g, "\n");

  // Match frontmatter (two alternations to keep closing --- on its own line):
  //   Case 1: non-empty body:  ^---\n ... \n---[ \t]*(\n|$)
  //   Case 2: empty body:      ^---\n---[ \t]*(\n|$)
  // Using alternation avoids the \n? ambiguity that allows --- to match mid-line.
  const frontmatterRegex = /^---\n([\s\S]*?)\n---[ \t]*(\n|$)|^---\n---[ \t]*(\n|$)/;
  const match = normalized.match(frontmatterRegex);

  if (match) {
    const matchedLength = match[0].length;
    const frontmatter = normalized.slice(0, matchedLength);
    const body = normalized.slice(matchedLength);
    return { frontmatter, body };
  }

  return { frontmatter: null, body: normalized };
}

interface CodeProtection {
  text: string;
  map: Map<string, string>;
}

/**
 * Replace fenced code blocks and inline code with placeholders.
 * Uses a line-by-line parser instead of regex to avoid V8 stack overflow
 * on files with many code blocks (backreference + [\s\S]*? causes recursive backtracking).
 */
export function protectCodeBlocks(content: string): CodeProtection {
  const map = new Map<string, string>();
  let blockIndex = 0;
  let inlineIndex = 0;

  // Step 1: Replace fenced code blocks using line-by-line parsing
  const lines = content.split("\n");
  const resultLines: string[] = [];
  let fenceOpen: string | null = null; // the backtick sequence that opened the current block
  let blockLines: string[] = [];

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,})/);

    if (fenceOpen === null) {
      // Not inside a code block
      if (fenceMatch) {
        // Opening fence found
        fenceOpen = fenceMatch[1];
        blockLines = [line];
      } else {
        resultLines.push(line);
      }
    } else {
      // Inside a code block — look for closing fence with same or more backticks
      blockLines.push(line);
      if (fenceMatch && fenceMatch[1].length >= fenceOpen.length && line.trim() === fenceMatch[1]) {
        // Closing fence found — store as single-line placeholder (no padding).
        // Padding was previously used to preserve line count, but it caused chunk
        // boundaries to fall inside the placeholder's whitespace region, leading to
        // non-deterministic LLM output when the code block exceeded --max-chunk-lines.
        const original = blockLines.join("\n") + "\n";
        const placeholder = `__CODE_BLOCK_${blockIndex++}__`;
        map.set(placeholder, original);
        resultLines.push(placeholder);
        fenceOpen = null;
        blockLines = [];
      }
    }
  }

  // If we ended inside an unclosed fence, emit lines as-is
  if (fenceOpen !== null) {
    resultLines.push(...blockLines);
  }

  let result = resultLines.join("\n");

  // Step 2: Replace inline code (single backtick, not within code blocks)
  result = result.replace(/`([^`\n]+)`/g, (match) => {
    const placeholder = `__INLINE_CODE_${inlineIndex++}__`;
    map.set(placeholder, match);
    return placeholder;
  });

  return { text: result, map };
}

/**
 * Restore placeholders back to original code blocks/inline code.
 */
export function restoreCodeBlocks(content: string, map: Map<string, string>): string {
  let result = content;
  // Restore fenced code blocks (may have trailing newline added by protect)
  for (const [placeholder, original] of map.entries()) {
    // The placeholder may appear with or without trailing newline
    result = result.split(placeholder + "\n").join(original);
    result = result.split(placeholder).join(original);
  }
  return result;
}

export const BLOCK_BOUNDARY_SENTINEL = "<!--BB-->";
// Temporary escape for pre-existing <!--BB--> literals in user content.
// Uses a character sequence unlikely to appear in markdown documents.
const ESCAPED_SENTINEL = "\x01BB\x01";
// Fallback regex: catches LLM-deformed variants (e.g. <!-- BB -->, <!--BB__-->, <!--BBx-->)
const SENTINEL_FALLBACK = /<!--\s*BB[a-zA-Z0-9_-]*\s*-->/g;
// Broad check: detects severely-deformed residuals not caught by SENTINEL_FALLBACK
const SENTINEL_RESIDUAL_CHECK = /<!--[\s\S]*?BB[\s\S]*?-->/g;

/**
 * Insert block boundary sentinels before structural Markdown elements
 * (list items, headings, horizontal rules, code fences, code block placeholders).
 * P-A4: prevents newline collapse around structural boundaries during LLM translation.
 * When called after protectCodeBlocks, fenced blocks appear as __CODE_BLOCK_N__ placeholders;
 * the function treats those placeholders as structural to protect fence-adjacent newlines.
 */
export function protectBlockBoundaries(content: string): string {
  // Escape any pre-existing <!--BB--> so they are not confused with control sentinels
  const escaped = content.includes(BLOCK_BOUNDARY_SENTINEL)
    ? content.split(BLOCK_BOUNDARY_SENTINEL).join(ESCAPED_SENTINEL)
    : content;

  const lines = escaped.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const isStructural =
      /^\s*[-*+]\s/.test(line) ||              // unordered list
      /^\s*\d+\.\s/.test(line) ||               // ordered list
      /^ {0,3}#{1,6}\s/.test(line) ||           // heading (CommonMark: 0-3 leading spaces)
      /^ {0,3}-{3,}\s*$/.test(line) ||          // hr (dash, 0-3 leading spaces)
      /^ {0,3}\*{3,}\s*$/.test(line) ||         // hr (asterisk, 0-3 leading spaces)
      /^ {0,3}_{3,}\s*$/.test(line) ||           // hr (underscore, 0-3 leading spaces)
      /^\s*`{3,}/.test(line) ||                 // fenced code (backtick)
      /^\s*~{3,}/.test(line) ||                 // fenced code (tilde)
      /^__CODE_BLOCK_\d+__$/.test(line.trim()); // code block placeholder (after protectCodeBlocks)

    if (isStructural) {
      result.push(BLOCK_BOUNDARY_SENTINEL);
    }
    result.push(line);
  }

  return result.join("\n");
}

/**
 * Remove block boundary sentinels and restore newlines lost during LLM translation.
 * Uses a 3-pass strategy:
 *   Pass 1: normalize LLM-deformed variants (e.g. <!-- BB -->) to exact sentinel form
 *   Pass 2: split + restore newlines (handles both clean and collapsed sentinel cases)
 *   Pass 3: post-restore warning for residual sentinel-like patterns (silent failure prevention)
 */
export function restoreBlockBoundaries(content: string): string {
  // Pass 1: normalize variant sentinels introduced by LLM deformation (cmd_389 Root Cause A/B)
  const normalized = content.replace(SENTINEL_FALLBACK, BLOCK_BOUNDARY_SENTINEL);

  // Pass 2: split + restore newlines
  if (!normalized.includes(BLOCK_BOUNDARY_SENTINEL)) {
    // Still unescape any escaped sentinels from original content
    return normalized.includes(ESCAPED_SENTINEL)
      ? normalized.split(ESCAPED_SENTINEL).join(BLOCK_BOUNDARY_SENTINEL)
      : normalized;
  }

  const parts = normalized.split(BLOCK_BOUNDARY_SENTINEL);
  let restored = parts[0];
  for (let i = 1; i < parts.length; i++) {
    // Strip a leading newline from next part (present when LLM preserved sentinel on its own line)
    const stripped = parts[i].replace(/^\n/, "");
    if (restored.length === 0) {
      // Sentinel was at the very start of content — no preceding text to separate from
      restored = stripped;
    } else {
      // Ensure restored ends with exactly one newline before appending next part
      restored = restored.replace(/\n?$/, "\n") + stripped;
    }
  }

  // Pass 3: post-restore warning for patterns not caught by SENTINEL_FALLBACK
  // Check before unescaping to avoid false positives from user-content <!--BB-->
  const residuals = restored.match(SENTINEL_RESIDUAL_CHECK);
  if (residuals && residuals.length > 0) {
    console.warn(
      `[yuuhitsu] restoreBlockBoundaries: ${residuals.length} residual sentinel-like pattern(s) detected after restore:`,
      residuals.slice(0, 5)
    );
  }

  // Unescape any pre-existing <!--BB--> that were escaped before protection
  if (restored.includes(ESCAPED_SENTINEL)) {
    restored = restored.split(ESCAPED_SENTINEL).join(BLOCK_BOUNDARY_SENTINEL);
  }

  return restored;
}

export interface TranslateOptions {
  provider: AIProvider;
  inputPath: string;
  outputPath?: string;
  targetLang: string;
  templateContent?: string;
  glossaryConfig?: GlossaryConfig;
  maxChunkLines?: number;
}

export interface TranslateResult {
  outputPath: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  chunks: number;
}

const DEFAULT_TEMPLATE = `You are a professional translator. Translate the following Markdown document to {{targetLanguage}}.

Rules:
- Preserve all Markdown formatting (headings, links, code blocks, tables, lists)
- Do not translate code blocks, URLs, or file paths
- Do not translate frontmatter keys (only translate values where appropriate)
- Maintain the same document structure
- Produce natural, fluent text in the target language
- Every opening \`\`\` you write MUST be followed by a language identifier on the same line (e.g., \`\`\`json, \`\`\`bash, \`\`\`typescript)
- If the language is unknown, use \`\`\`text — never emit a bare opening \`\`\`

CRITICAL - Link and URL preservation:
- NEVER modify any URLs or link paths. Keep all href/src values exactly as-is.
- NEVER change internal link paths (e.g., /ja/..., /en/..., ./relative-path). Preserve them verbatim.
- NEVER convert external URLs to different language versions.
- If the source has [text](/ja/changelog), the output must keep the same path, only translate the link text if needed.
- Example: [紹介](/ja/intro) → translate "紹介" but keep "/ja/intro" unchanged
- Example: [MDN](https://developer.mozilla.org/ja/) → keep the /ja/ in URL, translate "MDN" if needed

Additional rules for Japanese translation:
- Use full-width punctuation: 。、？！ (not .,?!)
- Add half-width spaces around English words and numbers (e.g., "Vela とは", "NGSIv2 は", "3 つの")
- Use natural Japanese terms for technical words where appropriate (e.g., "registration" → "登録", "subscription" → "サブスクリプション")
- Keep product names, proper nouns, and abbreviations unchanged (e.g., Vela, FIWARE, NGSIv2, NGSI-LD, MCP)

Example — code fence with language identifier:
  Bad:  \`\`\` echo hello \`\`\`
  Good: \`\`\`bash echo hello \`\`\``;

function buildPrompt(
  content: string,
  targetLang: string,
  hasPlaceholders: boolean,
  hasSentinels: boolean,
  templateContent?: string,
  glossaryConfig?: GlossaryConfig
): ChatMessage[] {
  const template = templateContent || DEFAULT_TEMPLATE;
  let systemPrompt = template
    .replace(/\{\{targetLanguage\}\}/g, targetLang)
    .replace(/\{\{content\}\}/g, "");

  if (glossaryConfig) {
    const glossarySection = buildGlossaryPrompt(glossaryConfig, targetLang);
    if (glossarySection) {
      systemPrompt += glossarySection;
    }
  }

  if (hasSentinels) {
    systemPrompt +=
      "\n\n## Block boundary markers (P-A4 v2)\n\n" +
      "Lines containing the marker `<!--BB-->` are **block boundary markers** inserted\n" +
      "by the translation pipeline to preserve newlines around structural elements.\n\n" +
      "Rules for `<!--BB-->` markers (HTML comment form):\n" +
      "- Output every `<!--BB-->` marker **verbatim and unchanged** in your translation.\n" +
      "- Each marker must remain on its own line, in the same position relative to\n" +
      "  surrounding content.\n" +
      "- Do not translate, remove, paraphrase, modify, normalize whitespace inside, or\n" +
      "  rename these markers.\n" +
      "- Do not add new `<!--BB-->` markers; only preserve existing ones.\n\n" +
      "Good example (correct preservation):\n" +
      "  Input:\n" +
      "    <!--BB-->\n" +
      "    - List item one\n" +
      "    <!--BB-->\n" +
      "    - List item two\n" +
      "    <!--BB-->\n" +
      "    ## Section heading\n" +
      "  Output:\n" +
      "    <!--BB-->\n" +
      "    - リスト項目その一\n" +
      "    <!--BB-->\n" +
      "    - リスト項目その二\n" +
      "    <!--BB-->\n" +
      "    ## セクション見出し\n\n" +
      "Bad examples (DO NOT do these):\n" +
      "  - <!--BB-->  ❌ → <!--BB__-->     (added suffix — FORBIDDEN)\n" +
      "  - <!--BB-->  ❌ → <!-- BB -->     (added internal whitespace — FORBIDDEN)\n" +
      "  - <!--BB-->  ❌ → <!--bb-->       (case change — FORBIDDEN)\n" +
      "  - <!--BB-->  ❌ → (omitted)       (deleted — FORBIDDEN)\n" +
      "  - <!--BB-->  ❌ → <!--BB-x-->     (added suffix — FORBIDDEN)\n\n" +
      "Preserve the marker exactly: 9 characters, opening `<!--`, content `BB`,\n" +
      "closing `-->`, no whitespace, no case changes, no suffixes.";
  }

  if (hasPlaceholders) {
    systemPrompt +=
      "\n\nIMPORTANT - Placeholder preservation:\n" +
      "- Tokens matching __CODE_BLOCK_N__ or __INLINE_CODE_N__ are placeholders for code blocks/inline code.\n" +
      "- Output them VERBATIM and UNCHANGED. Do NOT translate, modify, or remove them.\n" +
      "- Example: if input has __CODE_BLOCK_0__, output must contain __CODE_BLOCK_0__ exactly.";
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ];
}

function resolveOutputPath(
  inputPath: string,
  targetLang: string,
  outputPath?: string
): string {
  if (outputPath) return outputPath;
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const base = basename(inputPath, ext);
  return join(dir, `${base}.${targetLang}${ext}`);
}

/**
 * Find positions (line indices) of Markdown headings at the given level,
 * excluding lines inside fenced code blocks or table rows.
 */
export function findHeadingPositions(lines: string[], level: number): number[] {
  const positions: number[] = [];
  let inCodeBlock = false;
  const prefix = "#".repeat(level) + " ";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^`{3,}/.test(line)) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) continue;
    if (line.startsWith("|")) continue;
    if (line.startsWith(prefix)) positions.push(i);
  }
  return positions;
}

/**
 * Split lines at the given positions into chunks (each position starts a new chunk).
 * Segments exceeding maxChunkLines are further split using ### headings or safeSplitLines.
 */
export function splitAtPositions(
  lines: string[],
  positions: number[],
  maxChunkLines: number
): string[] {
  const result: string[] = [];
  const splitPoints = [0, ...positions, lines.length];

  for (let i = 0; i < splitPoints.length - 1; i++) {
    const start = splitPoints[i];
    const end = splitPoints[i + 1];
    if (start >= end) continue;

    const segmentLines = lines.slice(start, end);
    if (segmentLines.join("").trim().length === 0) continue;

    if (segmentLines.length > maxChunkLines) {
      const subPositions = findHeadingPositions(segmentLines, 3);
      // Filter out position 0: splitting at the start doesn't reduce segment size
      // and causes infinite recursion when the only heading is at position 0.
      const effectivePositions = subPositions.filter((p) => p > 0);
      if (effectivePositions.length > 0) {
        result.push(...splitAtPositions(segmentLines, effectivePositions, maxChunkLines));
      } else {
        result.push(...safeSplitLines(segmentLines, maxChunkLines));
      }
    } else {
      result.push(segmentLines.join("\n"));
    }
  }
  return result;
}

/**
 * Hard-split lines at maxChunkLines boundaries, avoiding breaks inside
 * fenced code blocks or consecutive table rows.
 */
export function safeSplitLines(lines: string[], maxChunkLines: number): string[] {
  const chunks: string[] = [];
  let currentStart = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = /^`{3,}/.test(line);
    const isTableLine = line.startsWith("|");

    // Check split eligibility BEFORE toggling fence state:
    // - never split inside a code block
    // - never split ON a fence line (would separate opening/closing ``` from their block)
    // - never split ON a table row
    const canSplitHere = !inCodeBlock && !isFence && !isTableLine;

    if (isFence) inCodeBlock = !inCodeBlock;

    if (i - currentStart >= maxChunkLines && canSplitHere) {
      chunks.push(lines.slice(currentStart, i).join("\n"));
      currentStart = i;
    }
  }

  if (currentStart < lines.length) {
    chunks.push(lines.slice(currentStart).join("\n"));
  }

  return chunks.filter((c) => c.trim().length > 0);
}

/**
 * Merge chunks smaller than MIN_CHUNK_LINES into the previous chunk,
 * as long as the merged result does not exceed maxLines.
 */
export function mergeSmallChunks(chunks: string[], maxLines: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const current = chunks[i];
    const currentLineCount = current.split("\n").length;
    const prev = result[result.length - 1];
    const prevLineCount = prev.split("\n").length;

    if (currentLineCount < MIN_CHUNK_LINES && prevLineCount + currentLineCount <= maxLines) {
      result[result.length - 1] = prev + "\n" + current;
    } else {
      result.push(current);
    }
  }
  return result;
}

/**
 * Split content into translation chunks using Markdown ## heading boundaries.
 * Falls back to safe line-count splitting when no headings are present.
 */
export function splitIntoChunks(
  content: string,
  maxChunkLines = DEFAULT_MAX_CHUNK_LINES
): string[] {
  const lines = content.split("\n");

  if (lines.length <= maxChunkLines) {
    return [content];
  }

  const headingPositions = findHeadingPositions(lines, 2);
  if (headingPositions.length > 0) {
    const rawChunks = splitAtPositions(lines, headingPositions, maxChunkLines);
    return mergeSmallChunks(rawChunks, maxChunkLines);
  }

  return safeSplitLines(lines, maxChunkLines);
}

export async function translateFile(
  options: TranslateOptions
): Promise<TranslateResult> {
  const { provider, inputPath, targetLang, templateContent, glossaryConfig, maxChunkLines } = options;

  // Read input file
  let content: string;
  try {
    content = readFileSync(inputPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as any).code === "ENOENT") {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    throw err;
  }

  // Check for empty file
  if (content.trim().length === 0) {
    throw new Error(`Input file is empty: ${inputPath}`);
  }

  const resolvedOutput = resolveOutputPath(inputPath, targetLang, options.outputPath);

  // Ensure output directory exists
  mkdirSync(dirname(resolvedOutput), { recursive: true });

  // Separate frontmatter from body
  const { frontmatter, body } = separateFrontmatter(content);

  // Protect code blocks: replace with placeholders before sending to LLM
  const { text: protectedBody, map: codeMap } = protectCodeBlocks(body);
  const hasPlaceholders = codeMap.size > 0;

  // Protect block boundaries: insert %%BB%% sentinels before structural elements (P-A4)
  const bodyWithSentinels = protectBlockBoundaries(protectedBody);
  const hasSentinels = bodyWithSentinels.includes(BLOCK_BOUNDARY_SENTINEL);

  // Split body into chunks if needed (frontmatter is never sent to LLM)
  const chunks = splitIntoChunks(bodyWithSentinels, maxChunkLines);
  const translatedParts: string[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (const chunk of chunks) {
    const messages = buildPrompt(chunk, targetLang, hasPlaceholders, hasSentinels, templateContent, glossaryConfig);
    const response = await provider.chat({
      model: "",
      messages,
    });

    translatedParts.push(response.content);
    totalUsage.promptTokens += response.usage.promptTokens;
    totalUsage.completionTokens += response.usage.completionTokens;
    totalUsage.totalTokens += response.usage.totalTokens;
  }

  // Restore block boundaries (sentinels → newlines) then restore code block placeholders.
  // join("\n") ensures chunk boundaries always have a separator even if LLM drops trailing newlines.
  const translatedBodyWithSentinels = translatedParts.join("\n");
  const translatedBodyWithPlaceholders = restoreBlockBoundaries(translatedBodyWithSentinels);
  const translatedBody = restoreCodeBlocks(translatedBodyWithPlaceholders, codeMap);

  // Recombine frontmatter with translated body
  const translatedContent = frontmatter
    ? frontmatter + translatedBody
    : translatedBody;

  // Write output
  writeFileSync(resolvedOutput, translatedContent, "utf-8");

  return {
    outputPath: resolvedOutput,
    usage: totalUsage,
    chunks: chunks.length,
  };
}
