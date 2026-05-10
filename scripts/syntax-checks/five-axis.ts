import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { CheckResult } from "../types.js";

export function checkFiveAxis(fixtureRepo: string): CheckResult {
  const pkgPath = path.join(fixtureRepo, "package.json");
  const docsJaPath = path.join(fixtureRepo, "docs/ja");

  if (!fs.existsSync(pkgPath) || !fs.existsSync(docsJaPath)) {
    return {
      name: "five-axis",
      passed: true,
      violations: [],
      skipped: true,
      skipReason: "Not a full docs repo (missing package.json or docs/ja/)",
    };
  }

  try {
    const helpOutput = execSync("pnpm yuuhitsu --help", {
      cwd: fixtureRepo,
      stdio: "pipe",
      timeout: 30_000,
    }).toString();
    if (!helpOutput.includes("check")) {
      return {
        name: "five-axis",
        passed: true,
        violations: [],
        skipped: true,
        skipReason: "yuuhitsu check command not available in this version",
      };
    }
    execSync("pnpm yuuhitsu check docs/ja/", {
      cwd: fixtureRepo,
      stdio: "pipe",
      timeout: 120_000,
    });
    return { name: "five-axis", passed: true, violations: [] };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const stdout = e.stdout?.toString() ?? "";
    const stderr = e.stderr?.toString() ?? "";
    const output = (stdout + stderr).slice(0, 3000);
    if (output.includes("unknown command")) {
      return {
        name: "five-axis",
        passed: true,
        violations: [],
        skipped: true,
        skipReason: "yuuhitsu check command not available in this version",
      };
    }
    return {
      name: "five-axis",
      passed: false,
      violations: [{ file: fixtureRepo, line: 0, content: output }],
    };
  }
}
