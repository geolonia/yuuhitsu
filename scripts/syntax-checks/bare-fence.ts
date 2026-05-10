import fs from "fs";
import type { CheckResult } from "../types.js";

export function checkBareFence(jaFiles: string[]): CheckResult {
  const violations: Array<{ file: string; line: number; content: string }> = [];

  for (const filePath of jaFiles) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf-8").split("\n");
    let inFence = false;
    let fenceMarker = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^(`{3,}|~{3,})(.*)/);
      if (!m) continue;

      const marker = m[1][0];
      const lang = m[2].trim();

      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        if (lang === "") {
          violations.push({ file: filePath, line: i + 1, content: line });
        }
      } else if (marker === fenceMarker && lang === "") {
        inFence = false;
        fenceMarker = "";
      }
    }
  }

  return {
    name: "bare-fence",
    passed: violations.length === 0,
    violations,
  };
}
