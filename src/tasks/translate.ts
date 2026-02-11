import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, basename, extname, join } from "path";
import type { AIProvider, ChatMessage } from "../provider/interface.js";

const CHUNK_SIZE = 50 * 1024; // 50KB

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

Additional rules for Japanese translation:
- Use full-width punctuation: 。、？！ (not .,?!)
- Add half-width spaces around English words and numbers (e.g., "Vela とは", "NGSIv2 は", "3 つの")
- Use natural Japanese terms for technical words where appropriate (e.g., "registration" → "登録", "subscription" → "サブスクリプション")
- Keep product names, proper nouns, and abbreviations unchanged (e.g., Vela, FIWARE, NGSIv2, NGSI-LD, MCP)`;

function buildPrompt(
  content: string,
  targetLang: string,
  templateContent?: string
): ChatMessage[] {
  const template = templateContent || DEFAULT_TEMPLATE;
  const systemPrompt = template
    .replace(/\{\{targetLanguage\}\}/g, targetLang)
    .replace(/\{\{content\}\}/g, "");

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

  // Split into chunks if needed
  const chunks = splitIntoChunks(content);
  const translatedParts: string[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (const chunk of chunks) {
    const messages = buildPrompt(chunk, targetLang, templateContent);
    const response = await provider.chat({
      model: "",
      messages,
    });

    translatedParts.push(response.content);
    totalUsage.promptTokens += response.usage.promptTokens;
    totalUsage.completionTokens += response.usage.completionTokens;
    totalUsage.totalTokens += response.usage.totalTokens;
  }

  const translatedContent = translatedParts.join("");

  // Write output
  writeFileSync(resolvedOutput, translatedContent, "utf-8");

  return {
    outputPath: resolvedOutput,
    usage: totalUsage,
    chunks: chunks.length,
  };
}
