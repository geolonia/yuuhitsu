import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";

// We test the CLI by importing the init command directly
import { initCommand } from "../../../src/cli/commands/init.js";

describe("Init CLI Integration", () => {
  let tempDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-init-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  function getOutput(): { stdout: string; stderr: string } {
    const stdout = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
    const stderr = stderrSpy.mock.calls.map(c => String(c[0])).join("");
    return { stdout, stderr };
  }

  async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Build a fresh parent program to provide global options
    const program = new Command();
    program
      .option("--config <path>", "Config file path", "./yuuhitsu.config.yaml")
      .option("--dry-run", "Show what would be done without making API calls")
      .option("--verbose", "Enable verbose output");
    program.addCommand(initCommand);

    try {
      await program.parseAsync(["node", "yuuhitsu", ...args]);
      const out = getOutput();
      return { ...out, exitCode: 0 };
    } catch {
      const out = getOutput();
      return { ...out, exitCode: 1 };
    }
  }

  describe("File generation", () => {
    it("should create yuuhitsu.config.yaml in current directory", async () => {
      const result = await runCommand(["init"]);

      const configPath = join(tempDir, "yuuhitsu.config.yaml");
      expect(existsSync(configPath)).toBe(true);
      expect(result.exitCode).toBe(0);

      const content = readFileSync(configPath, "utf-8");
      // Should contain commented examples for all providers
      expect(content).toMatch(/provider:/);
      expect(content).toMatch(/model:/);
      expect(content).toMatch(/claude/i);
      expect(content).toMatch(/gemini/i);
      expect(content).toMatch(/ollama/i);
    });

    it("should output success message", async () => {
      const result = await runCommand(["init"]);

      expect(result.stdout).toMatch(/created|generated|initialized/i);
      expect(result.stdout).toMatch(/yuuhitsu\.config\.yaml/);
    });
  });

  describe("Existing file detection", () => {
    it("should show error when config file already exists", async () => {
      // Create existing config
      const configPath = join(tempDir, "yuuhitsu.config.yaml");
      writeFileSync(configPath, "provider: claude\nmodel: test\n");

      const result = await runCommand(["init"]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/already exists|overwrite/i);
    });

    it("should suggest --force flag when file exists", async () => {
      // Create existing config
      const configPath = join(tempDir, "yuuhitsu.config.yaml");
      writeFileSync(configPath, "provider: claude\nmodel: test\n");

      const result = await runCommand(["init"]);

      expect(result.stderr).toMatch(/--force/);
    });
  });

  describe("--force flag", () => {
    it("should overwrite existing file when --force is used", async () => {
      // Create existing config with custom content
      const configPath = join(tempDir, "yuuhitsu.config.yaml");
      const originalContent = "provider: claude\nmodel: old-model\n";
      writeFileSync(configPath, originalContent);

      const result = await runCommand(["init", "--force"]);

      expect(result.exitCode).toBe(0);
      expect(existsSync(configPath)).toBe(true);

      const newContent = readFileSync(configPath, "utf-8");
      // Should be replaced with template content
      expect(newContent).not.toBe(originalContent);
      expect(newContent).toMatch(/claude/i);
      expect(newContent).toMatch(/gemini/i);
      expect(newContent).toMatch(/ollama/i);
    });
  });
});
