import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { CheckResult } from "../types.js";

const LENIENT_CONFIG = {
  default: false,
  MD013: false,
  MD033: false,
  MD034: false,
  MD041: false,
  MD049: false,
  MD050: false,
};

export function checkMarkdownlint(
  jaFiles: string[],
  fixtureRepo: string
): CheckResult {
  const existing = jaFiles.filter((f) => fs.existsSync(f));
  if (existing.length === 0) {
    return {
      name: "markdownlint",
      passed: true,
      violations: [],
      skipped: true,
      skipReason: "No JA files found",
    };
  }

  const configPath = path.resolve(fixtureRepo, ".markdownlint-qc.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify(LENIENT_CONFIG, null, 2));
    const fileArgs = existing.map((f) => `"${path.resolve(f)}"`).join(" ");
    execSync(
      `npx --yes markdownlint-cli2 --config "${configPath}" ${fileArgs}`,
      { stdio: "pipe", timeout: 60_000 }
    );
    return { name: "markdownlint", passed: true, violations: [] };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    const output = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    const violations = output
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("markdownlint"))
      .slice(0, 50)
      .map((l) => ({ file: l.split(":")[0] ?? "unknown", line: 0, content: l }));
    return { name: "markdownlint", passed: false, violations };
  } finally {
    try {
      fs.unlinkSync(configPath);
    } catch {
      // ignore
    }
  }
}
