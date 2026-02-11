import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Config Loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `ai-provider-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should load a valid config with claude provider", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    writeFileSync(
      configPath,
      `provider: claude\nmodel: claude-sonnet-4-5-20250929\n`
    );
    const config = await loadConfig(configPath);
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-sonnet-4-5-20250929");
  });

  it("should load a valid config with gemini provider", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    writeFileSync(
      configPath,
      `provider: gemini\nmodel: gemini-2.0-flash\n`
    );
    const config = await loadConfig(configPath);
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-2.0-flash");
  });

  it("should load a valid config with ollama provider", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    writeFileSync(
      configPath,
      `provider: ollama\nmodel: llama3.2\n`
    );
    const config = await loadConfig(configPath);
    expect(config.provider).toBe("ollama");
    expect(config.model).toBe("llama3.2");
  });

  it("should throw error when config file is missing", async () => {
    const configPath = join(tempDir, "nonexistent.yaml");
    await expect(loadConfig(configPath)).rejects.toThrow(/not found|ENOENT/i);
  });

  it("should throw error for invalid provider", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    writeFileSync(configPath, `provider: openrouter\nmodel: some-model\n`);
    await expect(loadConfig(configPath)).rejects.toThrow(/unsupported provider/i);
  });

  it("should throw error when model is missing", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    writeFileSync(configPath, `provider: claude\n`);
    await expect(loadConfig(configPath)).rejects.toThrow(/model/i);
  });

  it("should load optional log configuration", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    writeFileSync(
      configPath,
      `provider: claude\nmodel: claude-sonnet-4-5-20250929\nlog:\n  enabled: true\n  path: ./ai-provider.log\n`
    );
    const config = await loadConfig(configPath);
    expect(config.log?.enabled).toBe(true);
    expect(config.log?.path).toBe("./ai-provider.log");
  });

  it("should load .env variables via dotenv", async () => {
    const configPath = join(tempDir, "ai-provider.config.yaml");
    const envPath = join(tempDir, ".env");
    writeFileSync(configPath, `provider: claude\nmodel: claude-sonnet-4-5-20250929\n`);
    writeFileSync(envPath, `ANTHROPIC_API_KEY=test-key-123\n`);

    const config = await loadConfig(configPath, tempDir);
    // dotenv should have loaded the env variable
    expect(process.env.ANTHROPIC_API_KEY).toBe("test-key-123");
    // Clean up
    delete process.env.ANTHROPIC_API_KEY;
  });
});
