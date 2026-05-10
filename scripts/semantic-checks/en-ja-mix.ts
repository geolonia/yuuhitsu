import fs from "fs";
import type { CheckResult } from "../types.js";

const ALLOWLIST = new Set([
  "NGSI-LD",
  "NGSI-V2",
  "NGSIv2",
  "NGSIV2",
  "AWS",
  "GCP",
  "FIWARE",
  "API",
  "SDK",
  "URL",
  "ID",
  "JSON",
  "YAML",
  "UUID",
  "HTTP",
  "HTTPS",
  "REST",
  "CLI",
  "SQL",
  "GeonicDB",
  "IoT",
  "AI",
  "LLM",
  "MCP",
  "OpenAI",
  "Claude",
  "Gemini",
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OK",
  "CI",
  "CD",
]);

function isAsciiWord(w: string): boolean {
  return /^[A-Za-z][A-Za-z0-9\-_.]*$/.test(w);
}

function stripInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, "");
}

function stripMarkdownLinks(line: string): string {
  return line.replace(/\[([^\]]*)\]\([^)]*\)/g, "");
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  return end === -1 ? content : content.slice(end + 4);
}

export function checkEnJaMix(jaFiles: string[]): CheckResult {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const filePath of jaFiles) {
    if (!fs.existsSync(filePath)) continue;
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const content = stripFrontmatter(rawContent);
    const lines = content.split("\n");
    let inFence = false;
    let fenceMarker = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence) {
        const marker = fence[1][0];
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (marker === fenceMarker) {
          inFence = false;
          fenceMarker = "";
        }
        continue;
      }
      if (inFence) continue;
      if (/^\s*\|/.test(line)) continue;

      const stripped = stripMarkdownLinks(stripInlineCode(line));
      const hasJapanese = /[　-鿿豈-﫿ｦ-ﾟ]/.test(stripped);
      if (!hasJapanese) continue;

      const words = stripped.split(/\s+/).filter(Boolean);
      let maxRun = 0;
      let run = 0;
      for (const w of words) {
        if (isAsciiWord(w) && !ALLOWLIST.has(w)) {
          run++;
          if (run > maxRun) maxRun = run;
        } else {
          run = 0;
        }
      }

      if (maxRun >= 6) {
        violations.push({
          file: filePath,
          line: i + 1,
          content: line.slice(0, 120),
        });
      }
    }
  }

  return {
    name: "en-ja-mix",
    passed: violations.length === 0,
    violations,
  };
}
