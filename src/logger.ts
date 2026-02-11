import { appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface LogEntry {
  provider: string;
  model: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export class ExecutionLogger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    mkdirSync(dirname(logPath), { recursive: true });
  }

  log(entry: LogEntry): void {
    const record = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    appendFileSync(this.logPath, JSON.stringify(record) + "\n", "utf-8");
  }
}
