import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";
import { translateCommand } from "../../../src/cli/commands/translate.js";

describe("Batch Translate CLI Integration", () => {
  let tempDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-batch-test-${Date.now()}`);
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
    const program = new Command();
    program
      .option("--config <path>", "Config file path", "./yuuhitsu.config.yaml")
      .option("--dry-run", "Show what would be done without making API calls")
      .option("--verbose", "Enable verbose output");
    program.addCommand(translateCommand);

    try {
      await program.parseAsync(["node", "yuuhitsu", ...args]);
      const out = getOutput();
      return { ...out, exitCode: 0 };
    } catch {
      const out = getOutput();
      return { ...out, exitCode: 1 };
    }
  }

  describe("Glob pattern detection", () => {
    it("should detect simple glob pattern (*.md)", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "a.md"), "# A\n");
      writeFileSync(join(tempDir, "docs", "b.md"), "# B\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("docs/a.md");
      expect(result.stdout).toContain("docs/b.md");
    });

    it("should detect recursive glob pattern (**/*.md)", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs", "en", "guide"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "en", "intro.md"), "# Intro\n");
      writeFileSync(join(tempDir, "docs", "en", "guide", "setup.md"), "# Setup\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/**/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("docs/en/intro.md");
      expect(result.stdout).toContain("docs/en/guide/setup.md");
    });

    it("should handle no matches gracefully", async () => {
      createConfig(tempDir);

      const result = await runCommand([
        "translate",
        "--input", "nonexistent/**/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("No files matched");
    });
  });

  describe("--output-dir option", () => {
    it("should preserve directory structure with --output-dir", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs", "en", "guide"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "en", "intro.md"), "# Intro\n");
      writeFileSync(join(tempDir, "docs", "en", "guide", "setup.md"), "# Setup\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/en/**/*.md",
        "--lang", "ja",
        "--output-dir", "docs/ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("docs/ja/intro.md");
      expect(result.stdout).toContain("docs/ja/guide/setup.md");
    });

    it("should use language suffix without --output-dir", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "intro.md"), "# Intro\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("docs/intro.ja.md");
    });
  });

  describe("Progress display", () => {
    it("should show progress counter ([1/N] format)", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "a.md"), "# A\n");
      writeFileSync(join(tempDir, "docs", "b.md"), "# B\n");
      writeFileSync(join(tempDir, "docs", "c.md"), "# C\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      // Should show [1/3], [2/3], [3/3]
      expect(result.stdout).toMatch(/\[1\/3\]/);
      expect(result.stdout).toMatch(/\[2\/3\]/);
      expect(result.stdout).toMatch(/\[3\/3\]/);
    });
  });

  describe("Error handling", () => {
    it("should show summary with success/failure counts", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "a.md"), "# A\n");
      writeFileSync(join(tempDir, "docs", "b.md"), "# B\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      // Should show summary at the end
      expect(result.stdout).toContain("Summary");
    });
  });

  describe("Dry-run mode", () => {
    it("should list all matched files without translating", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "a.md"), "# A\n");
      writeFileSync(join(tempDir, "docs", "b.md"), "# B\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("[dry-run]");
      expect(result.stdout).toContain("docs/a.md");
      expect(result.stdout).toContain("docs/b.md");
    });

    it("should show output paths in dry-run", async () => {
      createConfig(tempDir);

      mkdirSync(join(tempDir, "docs"), { recursive: true });
      writeFileSync(join(tempDir, "docs", "test.md"), "# Test\n");

      const result = await runCommand([
        "translate",
        "--input", "docs/*.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("docs/test.md");
      expect(result.stdout).toContain("docs/test.ja.md");
    });
  });

  describe("Single file backward compatibility", () => {
    it("should still work with single file path (no glob)", async () => {
      createConfig(tempDir);

      writeFileSync(join(tempDir, "test.md"), "# Test\n");

      const result = await runCommand([
        "translate",
        "--input", "test.md",
        "--lang", "ja",
        "--dry-run"
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("test.md");
      expect(result.stdout).toContain("test.ja.md");
    });
  });
});
