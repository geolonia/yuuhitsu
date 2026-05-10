import fs from "fs";
import type { CheckResult } from "../types.js";

// Known duplicate paragraphs from source docs (Issue#88) — not translation quality issues
// Match by file pattern + text snippet to skip entire paragraphs with expected repeated patterns
const KNOWN_DUPLICATE_PARAGRAPHS: Array<{ filePattern: string; textSnippet: string }> = [
  // NGSIv2 + NGSI-LD cache-control endpoint list: "リスト / 単一 / attrs" appears in both API paths
  { filePattern: "api-reference/endpoints.md", textSnippet: "リスト / 単一 / attrs" },
];

function isKnownDuplicateParagraph(filePath: string, text: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return KNOWN_DUPLICATE_PARAGRAPHS.some(
    (e) => normalized.includes(e.filePattern) && text.includes(e.textSnippet)
  );
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  return end === -1 ? content : content.slice(end + 4);
}

function extractParagraphs(content: string): Array<{ text: string; startLine: number }> {
  const lines = content.split("\n");
  const paragraphs: Array<{ text: string; startLine: number }> = [];
  let buf: string[] = [];
  let bufStart = 0;
  let inFence = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      if (buf.length > 0) {
        paragraphs.push({ text: buf.join(" "), startLine: bufStart + 1 });
        buf = [];
      }
      continue;
    }
    if (inFence) continue;

    inBlockquote = line.startsWith(">");
    if (inBlockquote) {
      if (buf.length > 0) {
        paragraphs.push({ text: buf.join(" "), startLine: bufStart + 1 });
        buf = [];
      }
      continue;
    }

    if (/^\s*\|/.test(line)) {
      if (buf.length > 0) {
        paragraphs.push({ text: buf.join(" "), startLine: bufStart + 1 });
        buf = [];
      }
      continue;
    }

    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      if (buf.length > 0) {
        paragraphs.push({ text: buf.join(" "), startLine: bufStart + 1 });
        buf = [];
      }
      paragraphs.push({ text: line.trim(), startLine: i + 1 });
      continue;
    }

    if (line.trim() === "") {
      if (buf.length > 0) {
        paragraphs.push({ text: buf.join(" "), startLine: bufStart + 1 });
        buf = [];
      }
    } else {
      if (buf.length === 0) bufStart = i;
      buf.push(line.trim());
    }
  }
  if (buf.length > 0) {
    paragraphs.push({ text: buf.join(" "), startLine: bufStart + 1 });
  }
  return paragraphs;
}

function buildNgrams(words: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(" ");
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

export function checkDuplicatePhrase(jaFiles: string[]): CheckResult {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const filePath of jaFiles) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf-8");
    const content = stripFrontmatter(raw);
    const paragraphs = extractParagraphs(content);

    for (const { text, startLine } of paragraphs) {
      if (isKnownDuplicateParagraph(filePath, text)) continue;
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length < 4) continue;

      const ngrams = buildNgrams(words, 4);
      for (const [gram, count] of ngrams) {
        if (count >= 2) {
          violations.push({
            file: filePath,
            line: startLine,
            content: `Duplicate 4-gram (×${count}): "${gram}"`,
          });
          break;
        }
      }
    }
  }

  return {
    name: "duplicate-phrase",
    passed: violations.length === 0,
    violations,
  };
}
