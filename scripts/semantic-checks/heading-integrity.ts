import fs from "fs";
import type { CheckResult } from "../types.js";

export function checkHeadingIntegrity(jaFiles: string[]): CheckResult {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const filePath of jaFiles) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^(`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      if (/^#{1,6} /.test(line)) {
        const headingText = line.replace(/^#+\s*/, "").trim();
        if (headingText === "") {
          violations.push({
            file: filePath,
            line: i + 1,
            content: `Empty heading: "${line}"`,
          });
        }
        if (line.includes("\r")) {
          violations.push({
            file: filePath,
            line: i + 1,
            content: `Heading contains CR: "${line.slice(0, 80)}"`,
          });
        }
      }
    }
  }

  return {
    name: "heading-integrity",
    passed: violations.length === 0,
    violations,
  };
}
