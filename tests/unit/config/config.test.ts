import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../../src/config.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Config Loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should load a valid config with claude provider", async () => {
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
    writeFileSync(
      configPath,
      `provider: claude\nmodel: claude-sonnet-4-5-20250929\n`
    );
    const config = await loadConfig(configPath);
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-sonnet-4-5-20250929");
  });

  it("should load a valid config with gemini provider", async () => {
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
    writeFileSync(
      configPath,
      `provider: gemini\nmodel: gemini-2.0-flash\n`
    );
    const config = await loadConfig(configPath);
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-2.0-flash");
  });

  it("should load a valid config with ollama provider", async () => {
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
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
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
    writeFileSync(configPath, `provider: openrouter\nmodel: some-model\n`);
    await expect(loadConfig(configPath)).rejects.toThrow(/unsupported provider/i);
  });

  it("should throw error when model is missing", async () => {
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
    writeFileSync(configPath, `provider: claude\n`);
    await expect(loadConfig(configPath)).rejects.toThrow(/model/i);
  });

  it("should throw when glossary field is not a string", async () => {
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
    writeFileSync(
      configPath,
      `provider: claude\nmodel: claude-sonnet-4-5-20250929\nglossary:\n  path: glossary.yaml\n`
    );
    await expect(loadConfig(configPath)).rejects.toThrow(/glossary.*string/i);
  });

  it("should load optional log configuration", async () => {
    const configPath = join(tempDir, "yuuhitsu.config.yaml");
    writeFileSync(
      configPath,
      `provider: claude\nmodel: claude-sonnet-4-5-20250929\nlog:\n  enabled: true\n  path: ./yuuhitsu.log\n`
    );
    const config = await loadConfig(configPath);
    expect(config.log?.enabled).toBe(true);
    expect(config.log?.path).toBe("./yuuhitsu.log");
  });

  it("should load .env variables via dotenv", async () => {
    // Clean up any existing value first to avoid pollution from other tests
    const originalValue = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      const configPath = join(tempDir, "yuuhitsu.config.yaml");
      const envPath = join(tempDir, ".env");
      writeFileSync(configPath, `provider: claude\nmodel: claude-sonnet-4-5-20250929\n`);
      writeFileSync(envPath, `ANTHROPIC_API_KEY=test-key-123\n`);

      const config = await loadConfig(configPath, tempDir);
      // dotenv should have loaded the env variable
      expect(process.env.ANTHROPIC_API_KEY).toBe("test-key-123");
    } finally {
      // Restore or clean up
      if (originalValue) {
        process.env.ANTHROPIC_API_KEY = originalValue;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  });

  it("should auto-load .env from cwd when envDir is not specified", async () => {
    // Save original cwd and env value
    const originalCwd = process.cwd();
    const originalValue = process.env.TEST_AUTO_LOAD_KEY;
    delete process.env.TEST_AUTO_LOAD_KEY;

    // Change to temp directory
    process.chdir(tempDir);

    try {
      const configPath = join(tempDir, "yuuhitsu.config.yaml");
      const envPath = join(tempDir, ".env");
      writeFileSync(configPath, `provider: claude\nmodel: claude-sonnet-4-5-20250929\n`);
      writeFileSync(envPath, `TEST_AUTO_LOAD_KEY=auto-loaded-value\n`);

      // Call loadConfig WITHOUT envDir parameter
      const config = await loadConfig(configPath);

      // The .env from cwd should be loaded automatically
      expect(process.env.TEST_AUTO_LOAD_KEY).toBe("auto-loaded-value");
    } finally {
      // Restore original cwd and env value
      process.chdir(originalCwd);
      if (originalValue) {
        process.env.TEST_AUTO_LOAD_KEY = originalValue;
      } else {
        delete process.env.TEST_AUTO_LOAD_KEY;
      }
    }
  });
});
