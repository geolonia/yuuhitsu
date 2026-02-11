import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExecutionLogger } from "../../../src/logger.js";
import { readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ExecutionLogger", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `ai-provider-logger-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    logPath = join(tempDir, "ai-provider.log");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create a log entry with correct fields", () => {
    const logger = new ExecutionLogger(logPath);
    logger.log({
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      taskType: "translate",
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 1500,
      success: true,
    });

    const content = readFileSync(logPath, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.provider).toBe("claude");
    expect(entry.model).toBe("claude-sonnet-4-5-20250929");
    expect(entry.taskType).toBe("translate");
    expect(entry.inputTokens).toBe(100);
    expect(entry.outputTokens).toBe(200);
    expect(entry.latencyMs).toBe(1500);
    expect(entry.success).toBe(true);
    expect(entry.timestamp).toBeDefined();
  });

  it("should append multiple entries as JSON lines", () => {
    const logger = new ExecutionLogger(logPath);
    logger.log({
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      taskType: "translate",
      inputTokens: 100,
      outputTokens: 200,
      latencyMs: 1500,
      success: true,
    });
    logger.log({
      provider: "gemini",
      model: "gemini-2.0-flash",
      taskType: "generate-docs",
      inputTokens: 50,
      outputTokens: 300,
      latencyMs: 2000,
      success: true,
    });

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).provider).toBe("claude");
    expect(JSON.parse(lines[1]).provider).toBe("gemini");
  });

  it("should log error entries", () => {
    const logger = new ExecutionLogger(logPath);
    logger.log({
      provider: "claude",
      model: "claude-sonnet-4-5-20250929",
      taskType: "translate",
      inputTokens: 100,
      outputTokens: 0,
      latencyMs: 500,
      success: false,
      error: "Rate limit exceeded",
    });

    const content = readFileSync(logPath, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.success).toBe(false);
    expect(entry.error).toBe("Rate limit exceeded");
  });

  it("should include ISO timestamp", () => {
    const logger = new ExecutionLogger(logPath);
    logger.log({
      provider: "ollama",
      model: "llama3.2",
      taskType: "research",
      inputTokens: 50,
      outputTokens: 100,
      latencyMs: 800,
      success: true,
    });

    const content = readFileSync(logPath, "utf-8").trim();
    const entry = JSON.parse(content);
    // ISO 8601 format check
    expect(() => new Date(entry.timestamp)).not.toThrow();
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });
});
