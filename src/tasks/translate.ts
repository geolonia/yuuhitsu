import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, basename, extname, join } from "path";
import type { AIProvider, ChatMessage } from "../provider/interface.js";

const CHUNK_SIZE = 50 * 1024; // 50KB

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
 * Fenced blocks (``` or ````+) take priority over inline code.
 */
export function protectCodeBlocks(content: string): CodeProtection {
  const map = new Map<string, string>();
  let blockIndex = 0;
  let inlineIndex = 0;

  // Step 1: Replace fenced code blocks (4+ backticks before 3-backtick blocks)
  // Matches ````+ ... ```` or ``` ... ``` (non-greedy, multiline)
  let result = content.replace(/(`{3,})[^\n]*\n[\s\S]*?\1[ \t]*(\n|$)/g, (match) => {
    const placeholder = `__CODE_BLOCK_${blockIndex++}__`;
    map.set(placeholder, match);
    return placeholder + "\n";
  });

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

export interface TranslateOptions {
  provider: AIProvider;
  inputPath: string;
  outputPath?: string;
  targetLang: string;
  templateContent?: string;
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
- Keep product names, proper nouns, and abbreviations unchanged (e.g., Vela, FIWARE, NGSIv2, NGSI-LD, MCP)`;

function buildPrompt(
  content: string,
  targetLang: string,
  hasPlaceholders: boolean,
  templateContent?: string
): ChatMessage[] {
  const template = templateContent || DEFAULT_TEMPLATE;
  let systemPrompt = template
    .replace(/\{\{targetLanguage\}\}/g, targetLang)
    .replace(/\{\{content\}\}/g, "");

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

function splitIntoChunks(content: string): string[] {
  if (content.length <= CHUNK_SIZE) {
    return [content];
  }

  const chunks: string[] = [];
  const lines = content.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function translateFile(
  options: TranslateOptions
): Promise<TranslateResult> {
  const { provider, inputPath, targetLang, templateContent } = options;

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

  // Split body into chunks if needed (frontmatter is never sent to LLM)
  const chunks = splitIntoChunks(protectedBody);
  const translatedParts: string[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (const chunk of chunks) {
    const messages = buildPrompt(chunk, targetLang, hasPlaceholders, templateContent);
    const response = await provider.chat({
      model: "",
      messages,
    });

    translatedParts.push(response.content);
    totalUsage.promptTokens += response.usage.promptTokens;
    totalUsage.completionTokens += response.usage.completionTokens;
    totalUsage.totalTokens += response.usage.totalTokens;
  }

  // Restore code blocks from placeholders
  const translatedBodyWithPlaceholders = translatedParts.join("");
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
