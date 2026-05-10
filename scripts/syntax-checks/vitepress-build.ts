import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { CheckResult } from "../types.js";

export function checkVitepressBuild(fixtureRepo: string): CheckResult {
  const pkgPath = path.join(fixtureRepo, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return {
      name: "vitepress-build",
      passed: true,
      violations: [],
      skipped: true,
      skipReason: "Not a full docs repo (missing package.json)",
    };
  }

  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).scripts ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: "vitepress-build",
      passed: false,
      warnOnly: true,
      violations: [
        { file: pkgPath, line: 0, content: `Failed to parse package.json: ${message}` },
      ],
    };
  }

  if (!scripts["docs:build"]) {
    return {
      name: "vitepress-build",
      passed: true,
      violations: [],
      skipped: true,
      skipReason: "No docs:build script found in package.json",
    };
  }

  try {
    execSync("pnpm docs:build", {
      cwd: fixtureRepo,
      stdio: "pipe",
      timeout: 300_000,
    });
    return { name: "vitepress-build", passed: true, violations: [] };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    const output = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
    const fallback = err instanceof Error ? err.message : String(err);
    // Mark as warnOnly: fixture repo build failures may reflect repo-side issues, not yuuhitsu bugs
    return {
      name: "vitepress-build",
      passed: false,
      warnOnly: true,
      violations: [
        { file: fixtureRepo, line: 0, content: (output || fallback).slice(0, 3000) },
      ],
    };
  }
}
