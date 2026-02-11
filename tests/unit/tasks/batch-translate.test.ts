import { describe, it, expect } from "vitest";
import { join } from "path";

// Import functions we'll implement
import {
  isGlobPattern,
  generateOutputPath,
  type BatchTranslateOptions,
  type BatchProgress,
} from "../../../src/tasks/batch-translate.js";

describe("batch-translate task", () => {
  describe("isGlobPattern", () => {
    it("should detect glob patterns with *", () => {
      expect(isGlobPattern("docs/*.md")).toBe(true);
      expect(isGlobPattern("*.md")).toBe(true);
    });

    it("should detect glob patterns with **", () => {
      expect(isGlobPattern("docs/**/*.md")).toBe(true);
      expect(isGlobPattern("**/test.md")).toBe(true);
    });

    it("should detect glob patterns with ?", () => {
      expect(isGlobPattern("file?.md")).toBe(true);
      expect(isGlobPattern("test??.md")).toBe(true);
    });

    it("should detect glob patterns with []", () => {
      expect(isGlobPattern("file[abc].md")).toBe(true);
      expect(isGlobPattern("test[0-9].md")).toBe(true);
    });

    it("should return false for regular file paths", () => {
      expect(isGlobPattern("docs/file.md")).toBe(false);
      expect(isGlobPattern("test.md")).toBe(false);
      expect(isGlobPattern("/absolute/path/file.md")).toBe(false);
    });
  });

  describe("generateOutputPath", () => {
    it("should preserve directory structure with --output-dir", () => {
      const result = generateOutputPath({
        inputPath: "docs/en/intro.md",
        targetLang: "ja",
        outputDir: "docs/ja",
        inputBase: "docs/en",
      });

      expect(result).toBe("docs/ja/intro.md");
    });

    it("should handle nested directories with --output-dir", () => {
      const result = generateOutputPath({
        inputPath: "docs/en/guide/setup.md",
        targetLang: "ja",
        outputDir: "docs/ja",
        inputBase: "docs/en",
      });

      expect(result).toBe("docs/ja/guide/setup.md");
    });

    it("should add language code without --output-dir", () => {
      const result = generateOutputPath({
        inputPath: "docs/intro.md",
        targetLang: "ja",
      });

      expect(result).toBe("docs/intro.ja.md");
    });

    it("should handle file without extension", () => {
      const result = generateOutputPath({
        inputPath: "README",
        targetLang: "ja",
      });

      expect(result).toBe("README.ja");
    });

    it("should respect explicit output path", () => {
      const result = generateOutputPath({
        inputPath: "docs/intro.md",
        targetLang: "ja",
        explicitOutput: "custom/path.md",
      });

      expect(result).toBe("custom/path.md");
    });
  });

  describe("BatchProgress", () => {
    it("should calculate progress correctly", () => {
      const progress: BatchProgress = {
        total: 10,
        current: 3,
        succeeded: 2,
        failed: 0,
        skipped: 0,
      };

      const percentage = (progress.current / progress.total) * 100;
      expect(percentage).toBe(30);
    });

    it("should track errors separately", () => {
      const progress: BatchProgress = {
        total: 10,
        current: 5,
        succeeded: 3,
        failed: 2,
        skipped: 0,
      };

      expect(progress.succeeded + progress.failed).toBe(5);
    });
  });

  describe("BatchTranslateOptions validation", () => {
    it("should accept valid options", () => {
      const opts: BatchTranslateOptions = {
        pattern: "docs/**/*.md",
        targetLang: "ja",
        provider: {} as any, // Mock provider
        dryRun: false,
      };

      expect(opts.pattern).toBe("docs/**/*.md");
      expect(opts.targetLang).toBe("ja");
    });

    it("should accept optional outputDir", () => {
      const opts: BatchTranslateOptions = {
        pattern: "docs/**/*.md",
        targetLang: "ja",
        provider: {} as any,
        outputDir: "translated",
        dryRun: false,
      };

      expect(opts.outputDir).toBe("translated");
    });

    it("should accept progress callback", () => {
      const callback = (_progress: BatchProgress) => {};

      const opts: BatchTranslateOptions = {
        pattern: "docs/**/*.md",
        targetLang: "ja",
        provider: {} as any,
        onProgress: callback,
        dryRun: false,
      };

      expect(opts.onProgress).toBe(callback);
    });
  });
});
