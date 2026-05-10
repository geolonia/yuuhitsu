import fs from "fs";
import type { CheckResult } from "../types.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s　-鿿＀-￯一-鿿-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function checkAnchorValidity(jaFiles: string[]): CheckResult {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const filePath of jaFiles) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");

    const headingSlugs = new Set<string>();
    let inFence = false;

    for (const line of lines) {
      if (/^(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const hm = line.match(/^#{1,6}\s+(.*)/);
      if (hm) {
        const raw = hm[1].replace(/`[^`]*`/g, "").trim();
        headingSlugs.add(slugify(raw));
      }
    }

    inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const linkRe = /\[([^\]]*)\]\(#([^)]+)\)/g;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(line)) !== null) {
        const anchor = m[2].toLowerCase();
        if (!headingSlugs.has(anchor)) {
          violations.push({
            file: filePath,
            line: i + 1,
            content: `Broken anchor: #${m[2]} in "${line.slice(0, 100)}"`,
          });
        }
      }
    }
  }

  return {
    name: "anchor-validity",
    passed: violations.length === 0,
    violations,
  };
}
