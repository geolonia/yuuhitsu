export interface FixtureFile {
  enPath: string;
  jaPath: string;
  label: string;
}

export interface Violation {
  file: string;
  line: number;
  content: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  violations: Violation[];
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export interface JudgeScore {
  translation_fidelity: number;
  sentence_integrity: number;
  issues: string[];
}

export interface JudgeResult {
  label: string;
  score: JudgeScore;
  avg: number;
  passed: boolean;
}

export interface QcReport {
  timestamp: string;
  fixtureRepo: string;
  fixtures: FixtureFile[];
  syntaxResults: CheckResult[];
  semanticResults: CheckResult[];
  judgeResults: JudgeResult[];
  judgeAvg: number;
  judgeMin: number;
  judgePassed: boolean;
  syntaxPassed: boolean;
  semanticPassed: boolean;
  passed: boolean;
  summary: string;
}
