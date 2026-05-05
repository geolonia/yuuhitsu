import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, basename, extname, join } from "path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Text, Root } from "mdast";
import type { AIProvider, ChatMessage } from "../provider/interface.js";
import type { GlossaryConfig } from "./glossary.js";
import { buildGlossaryPrompt } from "./glossary.js";

export const DEFAULT_MAX_CHUNK_LINES = 300;
const MIN_CHUNK_LINES = 50;

// P-A1: minimum ratio of output characters to input characters (truncation check)
const MIN_OUTPUT_RATIO = 0.3;

interface FrontmatterSeparation {
  frontmatter: string | null;
  body: string;
}

/**
 * Separate frontmatter from Markdown content.
 * Handles: LF, CRLF, no trailing newline after closing ---, trailing spaces, empty frontmatter
 */
export function separateFrontmatter(content: string): FrontmatterSeparation {
  const normalized = content.replace(/\r\n/g, "\n");
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

// ─── Chunking utilities (kept for splitIntoChunks export) ───────────────────

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
    if (/^(`{3,}|~{3,})/.test(line)) inCodeBlock = !inCodeBlock;
    if (inCodeBlock) continue;
    if (line.startsWith("|")) continue;
    if (line.startsWith(prefix)) positions.push(i);
  }
  return positions;
}

/**
 * Split lines at the given positions into chunks. Segments exceeding maxChunkLines
 * are further split using ### headings or safeSplitLines.
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
    const isFence = /^(`{3,}|~{3,})/.test(line);
    const isTableLine = line.startsWith("|");

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
 * Merge chunks smaller than MIN_CHUNK_LINES into the previous chunk.
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

// ─── AST-based translation ───────────────────────────────────────────────────

// ─── Legacy code-block protection (used by glossary-fix.ts) ────────────────

interface CodeProtection {
  text: string;
  map: Map<string, string>;
}

/**
 * Replace fenced code blocks and inline code with placeholders.
 * Used by glossary-fix.ts to protect code blocks before text replacement.
 */
export function protectCodeBlocks(content: string): CodeProtection {
  const map = new Map<string, string>();
  let blockIndex = 0;
  let inlineIndex = 0;

  const lines = content.split("\n");
  const resultLines: string[] = [];
  let fenceOpen: string | null = null;
  let blockLines: string[] = [];

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,})/);

    if (fenceOpen === null) {
      if (fenceMatch) {
        fenceOpen = fenceMatch[1];
        blockLines = [line];
      } else {
        resultLines.push(line);
      }
    } else {
      blockLines.push(line);
      if (fenceMatch && fenceMatch[1].length >= fenceOpen.length && line.trim() === fenceMatch[1]) {
        const original = blockLines.join("\n") + "\n";
        const placeholder = `__CODE_BLOCK_${blockIndex++}__`;
        map.set(placeholder, original);
        resultLines.push(placeholder);
        fenceOpen = null;
        blockLines = [];
      }
    }
  }

  if (fenceOpen !== null) {
    resultLines.push(...blockLines);
  }

  let result = resultLines.join("\n");

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
  for (const [placeholder, original] of map.entries()) {
    if (original.endsWith("\n")) {
      result = result.split(placeholder + "\n").join(original);
      result = result.split(placeholder).join(original);
    } else {
      result = result.split(placeholder + "\n").join(original + "\n");
      result = result.split(placeholder).join(original);
    }
  }
  return result;
}

// ─── AST-based translation ───────────────────────────────────────────────────

interface TextNodeRef {
  node: Text;
  id: number;
}

/**
 * Extract all translatable text nodes from an mdast AST.
 * remark AST guarantees text nodes cannot be inside code/inlineCode nodes,
 * so we only skip empty/whitespace-only nodes.
 */
function extractTextNodes(ast: Root): TextNodeRef[] {
  const nodes: TextNodeRef[] = [];

  visit(ast, "text", (node: Text) => {
    if (!node.value.trim()) return;
    nodes.push({ node, id: nodes.length });
  });

  return nodes;
}

/**
 * Build system prompt for text-mode batch translation (Gemini / Ollama fallback).
 * Includes JSON format instructions since we're relying on the LLM to output JSON.
 */
function buildBatchSystemPrompt(
  targetLang: string,
  templateContent?: string,
  glossaryConfig?: GlossaryConfig
): string {
  const basePrompt = templateContent
    ? templateContent.replace(/\{\{targetLanguage\}\}/g, targetLang)
    : `You are a professional translator. Translate text segments to ${targetLang}.

Rules:
- Translate only the text content; do not add or remove punctuation structure
- Preserve proper nouns, code identifiers, URLs, and file paths unchanged
- Produce natural, fluent text in the target language
- For Japanese: use full-width punctuation (。、？！), add half-width spaces around English words/numbers
- Keep product names, abbreviations, and technical terms unchanged (e.g., NGSI-LD, MCP, GeoJSON)`;

  let prompt = basePrompt;

  if (glossaryConfig) {
    const glossarySection = buildGlossaryPrompt(glossaryConfig, targetLang);
    if (glossarySection) prompt += glossarySection;
  }

  prompt += `

## Translation format

You will receive a JSON object with a "segments" array.
Each segment has an "id" (integer) and "text" (string to translate).

Return ONLY a valid JSON object with a "translations" array.
Each translation must have the same "id" and the translated "text".
Do not include any explanation, markdown, or text outside the JSON object.

Example input:
{"segments": [{"id": 0, "text": "Hello world"}, {"id": 1, "text": "This is a test."}]}

Example output:
{"translations": [{"id": 0, "text": "こんにちは世界"}, {"id": 1, "text": "これはテストです。"}]}`;

  return prompt;
}

/**
 * Build system prompt for structured output translation (Claude tool_use path).
 * No JSON format instructions needed — the tool schema enforces the response shape.
 */
function buildStructuredSystemPrompt(
  targetLang: string,
  templateContent?: string,
  glossaryConfig?: GlossaryConfig
): string {
  const basePrompt = templateContent
    ? templateContent.replace(/\{\{targetLanguage\}\}/g, targetLang)
    : `You are a professional translator. Translate each text segment to ${targetLang}.

Rules:
- Translate only the text content; do not alter structure or punctuation outside the text
- Preserve proper nouns, code identifiers, URLs, and file paths unchanged
- Produce natural, fluent text in the target language
- For Japanese: use full-width punctuation (。、？！), add half-width spaces around English words/numbers
- Keep product names, abbreviations, and technical terms unchanged (e.g., NGSI-LD, MCP, GeoJSON)
- Each segment is independent; translate it on its own`;

  let prompt = basePrompt;
  if (glossaryConfig) {
    const glossarySection = buildGlossaryPrompt(glossaryConfig, targetLang);
    if (glossarySection) prompt += glossarySection;
  }
  return prompt;
}

interface Segment {
  id: number;
  text: string;
}

interface TranslationResponse {
  translations: Segment[];
}

/**
 * Parse translation JSON response from LLM (text mode fallback).
 * Handles both clean JSON and JSON embedded in prose (extracts first {...} block).
 */
function parseTranslationResponse(raw: string): TranslationResponse {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as TranslationResponse;
  } catch {
    // Extract first JSON object if LLM added prose around it
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as TranslationResponse;
    }
    throw new Error(`Failed to parse translation response: ${trimmed.slice(0, 200)}`);
  }
}

/**
 * Translate a batch of text segments using the provider.
 *
 * - If the provider implements `translateStructured` (Claude): uses tool_use to
 *   enforce the JSON schema at the API level, guaranteeing 1:1 ID mapping.
 * - Otherwise: falls back to text-mode JSON prompt (Gemini / Ollama).
 *
 * In both paths the 1:1 ID mapping is validated and an error is thrown on mismatch.
 */
async function translateBatch(
  provider: AIProvider,
  nodes: TextNodeRef[],
  targetLang: string,
  templateContent?: string,
  glossaryConfig?: GlossaryConfig
): Promise<{ usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  if (nodes.length === 0) {
    return { usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }

  const segments: Segment[] = nodes.map(({ node, id }) => ({ id, text: node.value }));

  // P-A1: track total input character count for truncation detection
  const totalInputChars = segments.reduce((sum, s) => sum + s.text.length, 0);

  let translations: Segment[];
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number };

  if (provider.translateStructured) {
    // Structured output path: provider (Claude) enforces JSON schema via tool_use
    const systemPrompt = buildStructuredSystemPrompt(targetLang, templateContent, glossaryConfig);
    const result = await provider.translateStructured({ segments, systemPrompt });
    translations = result.translations;
    usage = result.usage;

    // P-A1: warn on truncation (compare translated chars to input chars)
    const totalOutputChars = translations.reduce((sum, t) => sum + t.text.length, 0);
    if (totalInputChars > 0 && totalOutputChars < totalInputChars * MIN_OUTPUT_RATIO) {
      console.warn(
        `[yuuhitsu] translateBatch: output may be truncated ` +
          `(input chars: ${totalInputChars}, output chars: ${totalOutputChars})`
      );
    }
  } else {
    // Text mode fallback: Gemini / Ollama
    const systemPrompt = buildBatchSystemPrompt(targetLang, templateContent, glossaryConfig);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ segments }) },
    ];
    const response = await provider.chat({ model: "", messages });

    // P-A1: warn if output is suspiciously short (truncation check)
    const totalOutputChars = response.content.length;
    if (totalInputChars > 0 && totalOutputChars < totalInputChars * MIN_OUTPUT_RATIO) {
      console.warn(
        `[yuuhitsu] translateBatch: output may be truncated ` +
          `(input chars: ${totalInputChars}, output chars: ${totalOutputChars})`
      );
    }

    const parsed = parseTranslationResponse(response.content);
    translations = parsed.translations;
    usage = response.usage;
  }

  // Validate 1:1 ID mapping (both paths — structured path enforced by schema + this check)
  const translationMap = new Map(translations.map((t) => [t.id, t.text]));
  const missingIds = nodes.filter(({ id }) => !translationMap.has(id)).map(({ id }) => id);
  if (missingIds.length > 0) {
    throw new Error(
      `[yuuhitsu] translateBatch: partial translation — ${missingIds.length} node(s) missing` +
        ` from response (IDs: ${missingIds.join(", ")})`
    );
  }

  // Apply translations back to AST nodes
  for (const { node, id } of nodes) {
    const translated = translationMap.get(id);
    if (translated !== undefined && translated.trim()) {
      node.value = translated;
    }
  }

  return { usage };
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
 * Translate a Markdown file using AST-based approach.
 *
 * Architecture (0.2.0):
 *   1. Separate frontmatter (preserved verbatim)
 *   2. Split body into chunks by heading boundaries
 *   3. For each chunk: parse to AST → extract text nodes → translate via LLM → write back
 *   4. Serialize AST → markdown → concatenate → write output
 *
 * Key properties:
 *   - Code blocks (fenced and inline) are never sent to LLM (AST handles them deterministically)
 *   - Markdown structure (headings, lists, tables, HR) is preserved by AST round-trip
 *   - No sentinel injection or removal needed
 */
export async function translateFile(
  options: TranslateOptions
): Promise<TranslateResult> {
  const {
    provider,
    inputPath,
    targetLang,
    templateContent,
    glossaryConfig,
    maxChunkLines,
  } = options;

  let content: string;
  try {
    content = readFileSync(inputPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Input file not found: ${inputPath}`);
    }
    throw err;
  }

  if (content.trim().length === 0) {
    throw new Error(`Input file is empty: ${inputPath}`);
  }

  const resolvedOutput = resolveOutputPath(inputPath, targetLang, options.outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });

  const { frontmatter, body } = separateFrontmatter(content);

  // Split body into text chunks (heading-based, same as before)
  const chunks = splitIntoChunks(body, maxChunkLines ?? DEFAULT_MAX_CHUNK_LINES);

  const translatedChunks: string[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (const chunk of chunks) {
    // Parse chunk to AST (code blocks, inline code become typed nodes → never reach LLM)
    const processor = remark().use(remarkGfm);
    const ast = processor.parse(chunk) as Root;

    // Extract translatable text nodes
    const textNodes = extractTextNodes(ast);

    if (textNodes.length > 0) {
      const { usage } = await translateBatch(
        provider,
        textNodes,
        targetLang,
        templateContent,
        glossaryConfig
      );
      totalUsage.promptTokens += usage.promptTokens;
      totalUsage.completionTokens += usage.completionTokens;
      totalUsage.totalTokens += usage.totalTokens;
    }

    // Serialize AST back to markdown
    const translatedChunk = processor.stringify(ast);
    translatedChunks.push(translatedChunk);
  }

  // Join chunks: normalize each chunk to exactly one trailing newline
  // (preserves trailing spaces for Markdown hard line breaks), then join
  // with a single "\n" so chunk boundaries produce exactly one blank line.
  const translatedBody = translatedChunks
    .map((c) => c.replace(/\n+$/, "\n"))
    .join("\n");

  const translatedContent = frontmatter
    ? frontmatter + translatedBody
    : translatedBody;

  writeFileSync(resolvedOutput, translatedContent, "utf-8");

  return {
    outputPath: resolvedOutput,
    usage: totalUsage,
    chunks: chunks.length,
  };
}
