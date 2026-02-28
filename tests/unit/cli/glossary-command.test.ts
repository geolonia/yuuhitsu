import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock tasks to avoid file system side effects in CLI tests
vi.mock("../../../src/tasks/glossary.js", () => ({
  initGlossary: vi.fn(),
  checkGlossary: vi.fn().mockReturnValue([]),
  syncGlossary: vi.fn().mockReturnValue({
    totalTerms: 2,
    termsByLanguage: { ja: [], en: [] },
    missingTranslations: [],
  }),
  reviewGlossary: vi.fn().mockReturnValue({
    terms: [],
    summary: { totalTerms: 0, languages: [] },
    toMarkdown: vi.fn().mockReturnValue("# Glossary Review\n"),
  }),
  loadGlossary: vi.fn().mockReturnValue(null),
}));

import { glossaryCommand } from "../../../src/cli/commands/glossary.js";
import { initGlossary, checkGlossary, syncGlossary, reviewGlossary } from "../../../src/tasks/glossary.js";

describe("Glossary CLI Command", () => {
  let tempDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-glossary-cli-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe("glossary command structure", () => {
    it("should have 'glossary' as command name", () => {
      expect(glossaryCommand.name()).toBe("glossary");
    });

    it("should have init subcommand", () => {
      const subcommands = glossaryCommand.commands.map((c) => c.name());
      expect(subcommands).toContain("init");
    });

    it("should have check subcommand", () => {
      const subcommands = glossaryCommand.commands.map((c) => c.name());
      expect(subcommands).toContain("check");
    });

    it("should have sync subcommand", () => {
      const subcommands = glossaryCommand.commands.map((c) => c.name());
      expect(subcommands).toContain("sync");
    });

    it("should have review subcommand", () => {
      const subcommands = glossaryCommand.commands.map((c) => c.name());
      expect(subcommands).toContain("review");
    });
  });

  describe("glossary init subcommand", () => {
    it("should call initGlossary with default path", async () => {
      const initCmd = glossaryCommand.commands.find((c) => c.name() === "init")!;
      await initCmd.parseAsync([], { from: "user" });
      expect(initGlossary).toHaveBeenCalledWith(
        expect.stringContaining("glossary.yaml"),
        undefined
      );
    });

    it("should call initGlossary with --output path", async () => {
      const outputPath = join(tempDir, "custom-glossary.yaml");
      const initCmd = glossaryCommand.commands.find((c) => c.name() === "init")!;
      await initCmd.parseAsync(["--output", outputPath], { from: "user" });
      expect(initGlossary).toHaveBeenCalledWith(outputPath, undefined);
    });

    it("should pass force flag when --force is specified", async () => {
      const initCmd = glossaryCommand.commands.find((c) => c.name() === "init")!;
      await initCmd.parseAsync(["--force"], { from: "user" });
      expect(initGlossary).toHaveBeenCalledWith(
        expect.stringContaining("glossary.yaml"),
        true
      );
    });

    it("should print success message on init", async () => {
      const initCmd = glossaryCommand.commands.find((c) => c.name() === "init")!;
      await initCmd.parseAsync([], { from: "user" });
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("glossary.yaml");
    });
  });

  describe("glossary check subcommand", () => {
    it("should require --input option", async () => {
      const checkCmd = glossaryCommand.commands.find((c) => c.name() === "check")!;
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      await expect(
        checkCmd.parseAsync([], { from: "user" })
      ).rejects.toThrow();

      exitSpy.mockRestore();
    });

    it("should call checkGlossary with correct arguments", async () => {
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "# Test\n");
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja, en]\nterms: []\n");

      const checkCmd = glossaryCommand.commands.find((c) => c.name() === "check")!;
      await checkCmd.parseAsync(
        ["--input", docPath, "--glossary", glossaryPath, "--lang", "en"],
        { from: "user" }
      );
      expect(checkGlossary).toHaveBeenCalledWith(docPath, glossaryPath, "en");
    });

    it("should print 'no issues' when check returns empty array", async () => {
      vi.mocked(checkGlossary).mockReturnValue([]);
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "# Test\n");
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const checkCmd = glossaryCommand.commands.find((c) => c.name() === "check")!;
      await checkCmd.parseAsync(
        ["--input", docPath, "--glossary", glossaryPath, "--lang", "ja"],
        { from: "user" }
      );
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toMatch(/no issues|✓/i);
    });

    it("should print issues when found", async () => {
      vi.mocked(checkGlossary).mockReturnValue([
        { forbidden: "ＡＰＩ", canonical: "API", line: 3 },
      ]);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit(1)");
      });
      const docPath = join(tempDir, "doc.md");
      writeFileSync(docPath, "# Test\n");
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const checkCmd = glossaryCommand.commands.find((c) => c.name() === "check")!;
      await expect(
        checkCmd.parseAsync(
          ["--input", docPath, "--glossary", glossaryPath, "--lang", "ja"],
          { from: "user" }
        )
      ).rejects.toThrow("process.exit(1)");
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("ＡＰＩ");
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe("glossary sync subcommand", () => {
    it("should call syncGlossary with glossary path", async () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const syncCmd = glossaryCommand.commands.find((c) => c.name() === "sync")!;
      await syncCmd.parseAsync(["--glossary", glossaryPath], { from: "user" });
      expect(syncGlossary).toHaveBeenCalledWith(glossaryPath);
    });

    it("should print sync result", async () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const syncCmd = glossaryCommand.commands.find((c) => c.name() === "sync")!;
      await syncCmd.parseAsync(["--glossary", glossaryPath], { from: "user" });
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toMatch(/term|sync/i);
    });
  });

  describe("glossary review subcommand", () => {
    it("should call reviewGlossary with glossary path", async () => {
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const reviewCmd = glossaryCommand.commands.find((c) => c.name() === "review")!;
      await reviewCmd.parseAsync(["--glossary", glossaryPath], { from: "user" });
      expect(reviewGlossary).toHaveBeenCalledWith(glossaryPath);
    });

    it("should print Markdown report", async () => {
      vi.mocked(reviewGlossary).mockReturnValue({
        terms: [],
        summary: { totalTerms: 0, languages: [] },
        toMarkdown: vi.fn().mockReturnValue("# Glossary Review\n\n0 terms.\n"),
      });
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const reviewCmd = glossaryCommand.commands.find((c) => c.name() === "review")!;
      await reviewCmd.parseAsync(["--glossary", glossaryPath], { from: "user" });
      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Glossary Review");
    });

    it("should save report to --output file when specified", async () => {
      const outputPath = join(tempDir, "report.md");
      vi.mocked(reviewGlossary).mockReturnValue({
        terms: [],
        summary: { totalTerms: 0, languages: [] },
        toMarkdown: vi.fn().mockReturnValue("# Glossary Review\n"),
      });
      const glossaryPath = join(tempDir, "glossary.yaml");
      writeFileSync(glossaryPath, "version: 1\nlanguages: [ja]\nterms: []\n");

      const reviewCmd = glossaryCommand.commands.find((c) => c.name() === "review")!;
      await reviewCmd.parseAsync(
        ["--glossary", glossaryPath, "--output", outputPath],
        { from: "user" }
      );

      const { existsSync, readFileSync } = await import("fs");
      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, "utf-8");
      expect(content).toContain("Glossary Review");
    });
  });
});
