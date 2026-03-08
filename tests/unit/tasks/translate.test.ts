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
import { translateFile, splitIntoChunks } from "../../../src/tasks/translate.js";

describe("Translate Task", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-translate-test-${Date.now()}`);
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
    it("should pass Markdown content to provider with code blocks replaced by placeholders", async () => {
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

      // Headings, links, and tables should be sent to provider
      const callArgs = mockProvider.chat.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMsg.content).toContain("# Heading 1");
      expect(userMsg.content).toContain("[Link](https://example.com)");
      expect(userMsg.content).toContain("| Col1 | Col2 |");
      // Code block should be replaced with placeholder (not sent raw)
      expect(userMsg.content).not.toContain("```typescript");
      expect(userMsg.content).toContain("__CODE_BLOCK_0__");
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

  describe("splitIntoChunks (heading-based chunking)", () => {
    it("should return a single chunk for content under maxChunkLines", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i}`);
      const content = lines.join("\n");
      const chunks = splitIntoChunks(content, 300);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(content);
    });

    it("should split long content at ## heading boundaries", () => {
      // 3 sections of 210 lines each = 630 lines total, each starts with ##
      const makeSection = (n: number) =>
        [`## Section ${n}`, ...Array.from({ length: 209 }, (_, i) => `Line ${i}`)].join("\n");
      const content = [makeSection(1), makeSection(2), makeSection(3)].join("\n");

      const chunks = splitIntoChunks(content, 300);
      // 630 total lines → must be split into multiple chunks
      expect(chunks.length).toBeGreaterThan(1);
      // Every chunk except possibly the first should start with ##
      const nonFirstChunks = chunks.slice(1);
      for (const chunk of nonFirstChunks) {
        expect(chunk.trimStart()).toMatch(/^## Section/);
      }
    });

    it("should not split in the middle of a table", () => {
      // 295 regular lines, then a 20-row table, then 30 after-table lines = 345 total
      const regularLines = Array.from({ length: 295 }, (_, i) => `Line ${i}`);
      const tableLines = [
        "| Header1 | Header2 |",
        "|---------|---------|",
        ...Array.from({ length: 18 }, (_, i) => `| Row ${i} | Data ${i} |`),
      ];
      const afterTableLines = Array.from({ length: 30 }, (_, i) => `After table line ${i}`);
      const content = [...regularLines, ...tableLines, ...afterTableLines].join("\n");

      const chunks = splitIntoChunks(content, 300);

      // Content must be split (total 345 lines > 300)
      expect(chunks.length).toBeGreaterThan(1);

      // All table rows must appear in the same chunk (not split mid-table)
      const chunkWithTableStart = chunks.find((c) => c.includes("| Header1 | Header2 |"));
      const chunkWithTableEnd = chunks.find((c) => c.includes("| Row 17 | Data 17 |"));
      expect(chunkWithTableStart).toBeDefined();
      expect(chunkWithTableEnd).toBeDefined();
      expect(chunkWithTableStart).toBe(chunkWithTableEnd);
    });

    it("should not split inside a fenced code block", () => {
      // 290 regular lines, then a code block of 32 lines, then 30 after-code lines = 352 total
      const regularLines = Array.from({ length: 290 }, (_, i) => `Line ${i}`);
      const codeBlock = [
        "```typescript",
        ...Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`),
        "```",
      ];
      const afterCode = Array.from({ length: 30 }, (_, i) => `After code ${i}`);
      const content = [...regularLines, ...codeBlock, ...afterCode].join("\n");

      const chunks = splitIntoChunks(content, 300);

      // Each chunk must have balanced code fences
      for (const chunk of chunks) {
        const chunkLines = chunk.split("\n");
        let depth = 0;
        for (const line of chunkLines) {
          if (/^`{3,}/.test(line)) depth = depth === 0 ? 1 : 0;
        }
        expect(depth).toBe(0);
      }
    });

    it("should respect the maxChunkLines parameter", () => {
      const lines = Array.from({ length: 250 }, (_, i) => `Line ${i}`);
      const content = lines.join("\n");

      // Default (300 lines): 250 lines fits in one chunk
      expect(splitIntoChunks(content)).toHaveLength(1);

      // maxChunkLines=100: 250 lines must produce multiple chunks
      const chunks = splitIntoChunks(content, 100);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
