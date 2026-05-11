#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { checkBareFence } from "./syntax-checks/bare-fence.js";
import { checkFiveAxis } from "./syntax-checks/five-axis.js";
import { checkMarkdownlint } from "./syntax-checks/markdownlint.js";
import { checkVitepressBuild } from "./syntax-checks/vitepress-build.js";
import { checkEnJaMix } from "./semantic-checks/en-ja-mix.js";
import { checkDuplicatePhrase } from "./semantic-checks/duplicate-phrase.js";
import { checkHeadingIntegrity } from "./semantic-checks/heading-integrity.js";
import { checkAnchorValidity } from "./semantic-checks/anchor-validity.js";
import { runClaudeJudge } from "./llm-judge/claude-judge.js";
import type { CheckResult, FixtureFile, QcReport } from "./types.js";

const FIXTURE_REPO = process.env.LOCAL_QC_FIXTURE_REPO ?? "/home/hal/workspace/geonicdb-docs";

const FULL_DOCS_EN_FILES = [
  "docs/en/ai-integration/overview.md",
  "docs/en/ai-integration/tools-json.md",
  "docs/en/api-reference/ngsiv2.md",
  "docs/en/api-reference/endpoints.md",
  "docs/en/core-concepts/ngsiv2-vs-ngsild.md",
  "docs/en/features/subscriptions.md",
  "docs/en/changelog.md",
];

function buildFixtures(repo: string): FixtureFile[] {
  const isFullDocs = fs.existsSync(path.join(repo, "docs/en/ai-integration/overview.md"));

  if (isFullDocs) {
    return FULL_DOCS_EN_FILES.map((enRel) => {
      const jaRel = enRel.replace("docs/en/", "docs/ja/");
      return {
        enPath: path.join(repo, enRel),
        jaPath: path.join(repo, jaRel),
        label: enRel.replace("docs/en/", ""),
      };
    });
  }

  const enDir = path.join(repo, "en");
  if (fs.existsSync(enDir)) {
    const files = fs
      .readdirSync(enDir, { recursive: true })
      .filter((f): f is string => typeof f === "string" && f.endsWith(".md"));
    return files.map((f) => ({
      enPath: path.join(enDir, f),
      jaPath: path.join(repo, "ja", f),
      label: f,
    }));
  }

  return [];
}

function printResult(result: CheckResult): void {
  const icon = result.skipped ? "⏭" : result.passed ? "✓" : result.warnOnly ? "⚠" : "✗";
  const status = result.skipped
    ? `SKIP (${result.skipReason})`
    : result.passed
      ? "PASS"
      : result.warnOnly
        ? `WARN (${result.violations.length} violations — non-blocking)`
        : `FAIL (${result.violations.length} violations)`;
  console.log(`  [${icon}] ${result.name}: ${status}`);
  if (!result.passed && !result.skipped) {
    result.violations.slice(0, 5).forEach((v) => {
      console.log(`      ${v.file}:${v.line}: ${v.content.slice(0, 100)}`);
    });
    if (result.violations.length > 5) {
      console.log(`      ... and ${result.violations.length - 5} more`);
    }
  }
}

async function runLocalQC(): Promise<void> {
  console.log("=== yuuhitsu Local QC ===");
  console.log(`Fixture repo: ${FIXTURE_REPO}`);

  const fixtures = buildFixtures(FIXTURE_REPO);
  if (fixtures.length === 0) {
    console.error(`No fixtures found in ${FIXTURE_REPO}`);
    process.exit(1);
  }
  console.log(`Fixtures: ${fixtures.length} files`);

  const jaFiles = fixtures.map((f) => f.jaPath);

  console.log("\n--- Syntax Checks ---");
  const syntaxResults: CheckResult[] = [
    checkBareFence(jaFiles),
    checkFiveAxis(FIXTURE_REPO),
    checkMarkdownlint(jaFiles, FIXTURE_REPO),
    checkVitepressBuild(FIXTURE_REPO),
  ];
  syntaxResults.forEach(printResult);
  const syntaxPassed = syntaxResults.every((r) => r.passed || r.skipped === true || r.warnOnly === true);

  console.log("\n--- Semantic Checks ---");
  const semanticResults: CheckResult[] = [
    checkEnJaMix(jaFiles),
    checkDuplicatePhrase(jaFiles),
    checkHeadingIntegrity(jaFiles),
    checkAnchorValidity(jaFiles),
  ];
  semanticResults.forEach(printResult);
  const semanticPassed = semanticResults.every((r) => r.passed || r.skipped === true || r.warnOnly === true);

  console.log("\n--- LLM Judge (claude-sonnet-4-6) ---");
  const judgeRun = await runClaudeJudge(fixtures);
  if (judgeRun.skipped) {
    console.log(`  ⏭ ${judgeRun.skipReason}`);
  } else {
    console.log(`  Overall avg: ${judgeRun.overallAvg.toFixed(2)} (threshold: 4.0)`);
    console.log(`  Min per-fixture avg: ${judgeRun.minAvg.toFixed(2)} (threshold: 3.5)`);
    console.log(`  Judge result: ${judgeRun.passed ? "PASS" : "FAIL"}`);
  }

  const passed = syntaxPassed && semanticPassed && judgeRun.passed;

  const syntaxFails = syntaxResults.filter((r) => !r.passed && !r.skipped);
  const semanticFails = semanticResults.filter((r) => !r.passed && !r.skipped);
  const summary = passed
    ? "All checks passed"
    : `FAILED: syntax=${syntaxFails.map((r) => r.name).join(",") || "ok"} semantic=${semanticFails.map((r) => r.name).join(",") || "ok"} judge=${judgeRun.passed ? "ok" : "fail"}`;

  console.log(`\n=== Result: ${passed ? "✓ PASS" : "✗ FAIL"} ===`);
  if (!passed) console.log(`  ${summary}`);

  const report: QcReport = {
    timestamp: new Date().toISOString(),
    fixtureRepo: FIXTURE_REPO,
    fixtures,
    syntaxResults,
    semanticResults,
    judgeResults: judgeRun.results,
    judgeAvg: judgeRun.overallAvg,
    judgeMin: judgeRun.minAvg,
    judgePassed: judgeRun.passed,
    syntaxPassed,
    semanticPassed,
    passed,
    summary,
  };

  const reportDir = process.env.LOCAL_QC_REPORT_DIR ?? path.join(process.cwd(), "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `local-qc-${ts}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${reportPath}`);

  process.exit(passed ? 0 : 1);
}

runLocalQC().catch((err) => {
  console.error("Local QC fatal error:", err);
  process.exit(1);
});
