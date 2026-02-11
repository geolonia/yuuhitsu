import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";

// We test the CLI by importing the translate command directly and
// executing it programmatically (avoiding subprocess spawning issues with tsx on Node 18).
import { translateCommand } from "../../../src/cli/commands/translate.js";

describe("Translate CLI Integration", () => {
  let tempDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-cli-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  function createConfig(dir: string, provider = "claude", model = "claude-sonnet-4-5-20250929") {
    const configPath = join(dir, "yuuhitsu.config.yaml");
    writeFileSync(configPath, `provider: ${provider}\nmodel: ${model}\n`);
    return configPath;
  }

  function getOutput(): { stdout: string; stderr: string } {
    const stdout = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
    const stderr = stderrSpy.mock.calls.map(c => String(c[0])).join("");
    return { stdout, stderr };
  }

  async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Build a fresh parent program to provide global options
    const parent = new Command();
    parent
      .option("--config <path>", "Config file path", "./yuuhitsu.config.yaml")
      .option("--dry-run", "Show what would be done without making API calls")
      .option("--verbose", "Enable verbose output");

    // Clone the translate command to avoid commander state leakage
    const cmd = new Command("translate")
      .description("Translate a Markdown document to another language")
      .requiredOption("--input <file>", "Input Markdown file")
      .requiredOption("--lang <code>", "Target language code");
    cmd.option("--output <file>", "Output file path");

    parent.addCommand(cmd);

    // Copy the action from translateCommand
    // We import and invoke translateCommand's action via parent.parseAsync
    const program2 = new Command();
    program2
      .option("--config <path>", "Config file path", "./yuuhitsu.config.yaml")
      .option("--dry-run", "Show what would be done without making API calls")
      .option("--verbose", "Enable verbose output");
    program2.addCommand(translateCommand);

    try {
      await program2.parseAsync(["node", "yuuhitsu", ...args]);
      const out = getOutput();
      return { ...out, exitCode: 0 };
    } catch {
      const out = getOutput();
      return { ...out, exitCode: 1 };
    }
  }

  describe("--dry-run mode", () => {
    it("should show what would be done without making API calls", async () => {
      const configPath = createConfig(tempDir);
      const inputPath = join(tempDir, "input.md");
      writeFileSync(inputPath, "# Hello World\n\nThis is a test.\n");

      const result = await runCommand([
        "translate", "--input", inputPath, "--lang", "ja", "--dry-run", "--config", configPath,
      ]);

      expect(result.stdout).toMatch(/dry.run|would/i);
      const expectedOutput = join(tempDir, "input.ja.md");
      expect(existsSync(expectedOutput)).toBe(false);
    });
  });

  describe("Error cases", () => {
    it("should show error when --input is missing", async () => {
      const configPath = createConfig(tempDir);
      const result = await runCommand([
        "translate", "--lang", "ja", "--config", configPath,
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/input|required/i);
    });

    it("should show error when --lang is missing", async () => {
      const configPath = createConfig(tempDir);
      const inputPath = join(tempDir, "input.md");
      writeFileSync(inputPath, "# Test\n");

      const result = await runCommand([
        "translate", "--input", inputPath, "--config", configPath,
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/lang|required/i);
    });

    it("should show error when input file does not exist", async () => {
      const configPath = createConfig(tempDir);
      const result = await runCommand([
        "translate", "--input", join(tempDir, "nonexistent.md"), "--lang", "ja", "--config", configPath,
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/not found/i);
    });

    it("should show error when API key is missing for claude provider", async () => {
      const configPath = createConfig(tempDir, "claude");
      const inputPath = join(tempDir, "input.md");
      writeFileSync(inputPath, "# Test\n");

      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      try {
        const result = await runCommand([
          "translate", "--input", inputPath, "--lang", "ja", "--config", configPath,
        ]);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toMatch(/ANTHROPIC_API_KEY/i);
      } finally {
        if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });
  });

  describe("CLI option parsing", () => {
    it("should accept --output option for custom output path in dry-run", async () => {
      const configPath = createConfig(tempDir);
      const inputPath = join(tempDir, "input.md");
      writeFileSync(inputPath, "# Test\n");
      const customOutput = join(tempDir, "custom-output.md");

      const result = await runCommand([
        "translate", "--input", inputPath, "--lang", "ja", "--output", customOutput,
        "--dry-run", "--config", configPath,
      ]);

      expect(result.stdout).toMatch(/dry.run|would/i);
      expect(result.stdout).toContain("custom-output.md");
    });
  });
});
