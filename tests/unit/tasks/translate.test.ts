import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock provider — will be injected into the translate task
function createMockProvider(responseContent: string) {
  return {
    chat: vi.fn().mockResolvedValue({
      content: responseContent,
      model: "mock-model",
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      finishReason: "end_turn",
    }),
    chatStream: vi.fn(),
  };
}

// Import translate task — will fail until implementation exists
import { translateFile } from "../../../src/tasks/translate.js";

describe("Translate Task", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `ai-provider-translate-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Prompt Construction", () => {
    it("should construct a prompt containing the input content and target language", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.md");
      writeFileSync(inputPath, "# Hello World\n\nThis is a test document.\n");

      const mockProvider = createMockProvider("# こんにちは世界\n\nこれはテスト文書です。\n");

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      // Verify provider.chat was called with correct prompt structure
      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
      const callArgs = mockProvider.chat.mock.calls[0][0];

      // Should have system message with translation instructions
      const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toContain("Markdown");

      // Should have user message with the content
      const userMsg = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMsg).toBeDefined();
      expect(userMsg.content).toContain("# Hello World");
      expect(userMsg.content).toContain("This is a test document.");
    });

    it("should include target language in the prompt", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.md");
      writeFileSync(inputPath, "# Test\n");

      const mockProvider = createMockProvider("# テスト\n");

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const callArgs = mockProvider.chat.mock.calls[0][0];
      // The prompt (system or user message) should reference the target language
      const allContent = callArgs.messages.map((m: any) => m.content).join(" ");
      expect(allContent.toLowerCase()).toMatch(/ja|japanese/i);
    });
  });

  describe("Output File Creation", () => {
    it("should write the translated content to the output file", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.ja.md");
      writeFileSync(inputPath, "# Hello\n\nWorld\n");

      const translatedContent = "# こんにちは\n\n世界\n";
      const mockProvider = createMockProvider(translatedContent);

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(existsSync(outputPath)).toBe(true);
      const result = readFileSync(outputPath, "utf-8");
      expect(result).toBe(translatedContent);
    });

    it("should create parent directories if they don't exist", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "nested", "deep", "output.ja.md");
      writeFileSync(inputPath, "# Test\n");

      const mockProvider = createMockProvider("# テスト\n");

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(existsSync(outputPath)).toBe(true);
    });

    it("should use default output path <input>.<lang>.md when outputPath is not specified", async () => {
      const inputPath = join(tempDir, "readme.md");
      writeFileSync(inputPath, "# Readme\n");

      const mockProvider = createMockProvider("# 読んでください\n");

      const result = await translateFile({
        provider: mockProvider,
        inputPath,
        targetLang: "ja",
      });

      const expectedOutput = join(tempDir, "readme.ja.md");
      expect(existsSync(expectedOutput)).toBe(true);
      expect(result.outputPath).toBe(expectedOutput);
    });
  });

  describe("Markdown Structure Preservation", () => {
    it("should pass Markdown content to provider without alteration", async () => {
      const markdownContent = [
        "# Heading 1",
        "",
        "## Heading 2",
        "",
        "Some text with **bold** and *italic*.",
        "",
        "- List item 1",
        "- List item 2",
        "",
        "```typescript",
        'const x = "hello";',
        "```",
        "",
        "[Link](https://example.com)",
        "",
        "| Col1 | Col2 |",
        "|------|------|",
        "| A    | B    |",
        "",
      ].join("\n");

      const inputPath = join(tempDir, "complex.md");
      const outputPath = join(tempDir, "complex.ja.md");
      writeFileSync(inputPath, markdownContent);

      const translatedContent = "# 見出し1\n\n翻訳済み\n";
      const mockProvider = createMockProvider(translatedContent);

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      // The full original content should be in the prompt sent to provider
      const callArgs = mockProvider.chat.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMsg.content).toContain("# Heading 1");
      expect(userMsg.content).toContain("```typescript");
      expect(userMsg.content).toContain("[Link](https://example.com)");
      expect(userMsg.content).toContain("| Col1 | Col2 |");
    });
  });

  describe("Large File Chunking (>50KB)", () => {
    it("should split files larger than 50KB into chunks", async () => {
      // Create a file larger than 50KB
      const line = "This is a line of text that will be repeated many times to exceed 50KB.\n";
      const content = line.repeat(Math.ceil(52000 / line.length));
      expect(content.length).toBeGreaterThan(50 * 1024);

      const inputPath = join(tempDir, "large.md");
      const outputPath = join(tempDir, "large.ja.md");
      writeFileSync(inputPath, content);

      const mockProvider = createMockProvider("翻訳済みチャンク\n");

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      // Provider should be called multiple times for chunks
      expect(mockProvider.chat.mock.calls.length).toBeGreaterThan(1);

      // Output file should exist and contain combined translated chunks
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should throw an error when input file does not exist", async () => {
      const inputPath = join(tempDir, "nonexistent.md");
      const outputPath = join(tempDir, "output.md");
      const mockProvider = createMockProvider("");

      await expect(
        translateFile({
          provider: mockProvider,
          inputPath,
          outputPath,
          targetLang: "ja",
        })
      ).rejects.toThrow(/not found|ENOENT/i);
    });

    it("should throw an error when input file is empty", async () => {
      const inputPath = join(tempDir, "empty.md");
      const outputPath = join(tempDir, "output.md");
      writeFileSync(inputPath, "");
      const mockProvider = createMockProvider("");

      await expect(
        translateFile({
          provider: mockProvider,
          inputPath,
          outputPath,
          targetLang: "ja",
        })
      ).rejects.toThrow(/empty/i);
    });
  });

  describe("Return Value", () => {
    it("should return translation result with outputPath and usage info", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.ja.md");
      writeFileSync(inputPath, "# Hello\n");

      const mockProvider = createMockProvider("# こんにちは\n");

      const result = await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(result).toHaveProperty("outputPath", outputPath);
      expect(result).toHaveProperty("usage");
      expect(result.usage.totalTokens).toBe(300);
    });
  });
});
