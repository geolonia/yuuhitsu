import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import type { FixtureFile, JudgeResult, JudgeScore } from "../types.js";

const MODEL = "claude-sonnet-4-6";
const JUDGE_THRESHOLD_AVG = 4.0;
const JUDGE_THRESHOLD_MIN = 3.5;

const SYSTEM_PROMPT = `あなたは技術文書の翻訳品質審査員です。
英語原文と日本語翻訳を比較し、以下の基準で採点してください。

採点基準 (各項目 1-5):
- translation_fidelity: 原文の意味を忠実に伝えているか
- sentence_integrity: 文の完結性・自然さ・重複や混在がないか

JSON のみを返してください。説明テキストは不要です:
{"translation_fidelity": <1-5>, "sentence_integrity": <1-5>, "issues": ["...", "..."]}`;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + "\n...[truncated]" : text;
}

async function judgeOne(
  client: Anthropic,
  fixture: FixtureFile
): Promise<JudgeResult> {
  if (!fs.existsSync(fixture.enPath) || !fs.existsSync(fixture.jaPath)) {
    return {
      label: fixture.label,
      score: { translation_fidelity: 0, sentence_integrity: 0, issues: ["File not found"] },
      avg: 0,
      passed: false,
    };
  }

  const enText = truncate(fs.readFileSync(fixture.enPath, "utf-8"), 8000);
  const jaText = truncate(fs.readFileSync(fixture.jaPath, "utf-8"), 8000);

  const userMessage = `英語原文:\n${enText}\n\n日本語翻訳:\n${jaText}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0,
  });

  const raw = response.content.find((b) => b.type === "text")?.text ?? "{}";
  let score: JudgeScore;
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Partial<JudgeScore>;
    score = {
      translation_fidelity: Number(parsed.translation_fidelity ?? 0),
      sentence_integrity: Number(parsed.sentence_integrity ?? 0),
      issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]) : [],
    };
  } catch {
    score = { translation_fidelity: 0, sentence_integrity: 0, issues: [`Parse error: ${raw.slice(0, 200)}`] };
  }

  const avg = (score.translation_fidelity + score.sentence_integrity) / 2;
  return { label: fixture.label, score, avg, passed: avg >= JUDGE_THRESHOLD_MIN };
}

export interface JudgeRunResult {
  results: JudgeResult[];
  overallAvg: number;
  minAvg: number;
  passed: boolean;
  skipped?: boolean;
  skipReason?: string;
}

export async function runClaudeJudge(fixtures: FixtureFile[]): Promise<JudgeRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      results: [],
      overallAvg: 0,
      minAvg: 0,
      passed: true,
      skipped: true,
      skipReason: "ANTHROPIC_API_KEY not set — LLM judge skipped",
    };
  }

  const client = new Anthropic({ apiKey });
  const results: JudgeResult[] = [];

  for (const fixture of fixtures) {
    const result = await judgeOne(client, fixture);
    results.push(result);
    const status = result.passed ? "✓" : "✗";
    console.log(`  [judge] ${status} ${fixture.label}: avg=${result.avg.toFixed(2)} (fidelity=${result.score.translation_fidelity}, integrity=${result.score.sentence_integrity})`);
    if (result.score.issues.length > 0) {
      result.score.issues.forEach((issue) => console.log(`    - ${issue}`));
    }
  }

  const overallAvg = results.length > 0
    ? results.reduce((s, r) => s + r.avg, 0) / results.length
    : 0;
  const minAvg = results.length > 0 ? Math.min(...results.map((r) => r.avg)) : 0;
  const passed = overallAvg >= JUDGE_THRESHOLD_AVG && minAvg >= JUDGE_THRESHOLD_MIN;

  return { results, overallAvg, minAvg, passed };
}
