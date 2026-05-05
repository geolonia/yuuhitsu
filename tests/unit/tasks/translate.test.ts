import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { translateFile, splitIntoChunks } from "../../../src/tasks/translate.js";

/**
 * Create a mock provider that returns a JSON translations response.
 * textMap: { [inputText]: translatedText } — maps source text to translation.
 * Any text not in the map is returned unchanged.
 */
function createMockProvider(textMap: Record<string, string> = {}) {
  return {
    chat: vi.fn().mockImplementation(async (request: any) => {
      const userMsg = request.messages.find((m: any) => m.role === "user");
      let segments: Array<{ id: number; text: string }> = [];
      try {
        const parsed = JSON.parse(userMsg.content);
        segments = parsed.segments ?? [];
      } catch {
        // If not JSON, no segments
      }

      const translations = segments.map((s: { id: number; text: string }) => ({
        id: s.id,
        text: textMap[s.text] ?? s.text,
      }));

      return {
        content: JSON.stringify({ translations }),
        model: "mock-model",
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        finishReason: "end_turn",
      };
    }),
    chatStream: vi.fn(),
  };
}

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
    it("should send text segments as JSON to the provider", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.md");
      writeFileSync(inputPath, "# Hello World\n\nThis is a test document.\n");

      const mockProvider = createMockProvider({
        "Hello World": "こんにちは世界",
        "This is a test document.": "これはテスト文書です。",
      });

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(mockProvider.chat).toHaveBeenCalledTimes(1);
      const callArgs = mockProvider.chat.mock.calls[0][0];

      // System message should contain translation instructions
      const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toMatch(/translat/i);

      // User message should be JSON with segments
      const userMsg = callArgs.messages.find((m: any) => m.role === "user");
      expect(userMsg).toBeDefined();
      const parsed = JSON.parse(userMsg.content);
      expect(parsed.segments).toBeDefined();
      expect(parsed.segments.length).toBeGreaterThan(0);

      // Segments contain the actual text nodes from the document
      const texts = parsed.segments.map((s: any) => s.text);
      expect(texts).toContain("Hello World");
      expect(texts).toContain("This is a test document.");
    });

    it("should include target language in the system prompt", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.md");
      writeFileSync(inputPath, "# Test\n");

      const mockProvider = createMockProvider();

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const callArgs = mockProvider.chat.mock.calls[0][0];
      const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
      expect(systemMsg.content.toLowerCase()).toMatch(/ja|japanese/i);
    });

    it("should NOT send code block content to the provider", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.md");
      writeFileSync(
        inputPath,
        "# Heading\n\nSome text.\n\n```typescript\nconst x = 'hello';\n```\n\nMore text.\n"
      );

      const mockProvider = createMockProvider();

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const callArgs = mockProvider.chat.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: any) => m.role === "user");
      const parsed = JSON.parse(userMsg.content);
      const texts = parsed.segments.map((s: any) => s.text);

      // Code block content must NOT appear in segments
      expect(texts.join(" ")).not.toContain("const x = 'hello'");
      expect(texts.join(" ")).not.toContain("```typescript");
    });
  });

  describe("Output File Creation", () => {
    it("should write the translated content to the output file", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "output.ja.md");
      writeFileSync(inputPath, "# Hello\n\nWorld\n");

      const mockProvider = createMockProvider({
        Hello: "こんにちは",
        World: "世界",
      });

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(existsSync(outputPath)).toBe(true);
      const result = readFileSync(outputPath, "utf-8");
      expect(result).toContain("こんにちは");
      expect(result).toContain("世界");
    });

    it("should create parent directories if they don't exist", async () => {
      const inputPath = join(tempDir, "input.md");
      const outputPath = join(tempDir, "nested", "deep", "output.ja.md");
      writeFileSync(inputPath, "# Test\n");

      const mockProvider = createMockProvider();

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

      const mockProvider = createMockProvider({ Readme: "読んでください" });

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
    it("should preserve code blocks in the output (AST round-trip)", async () => {
      const codeBlock = "```typescript\nconst x = 'hello';\n```";
      const markdownContent = `# Heading\n\nSome text.\n\n${codeBlock}\n\nMore text.\n`;

      const inputPath = join(tempDir, "complex.md");
      const outputPath = join(tempDir, "complex.ja.md");
      writeFileSync(inputPath, markdownContent);

      const mockProvider = createMockProvider({
        Heading: "見出し",
        "Some text.": "何かのテキスト。",
        "More text.": "もっとテキスト。",
      });

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const output = readFileSync(outputPath, "utf-8");
      // Code block content must be preserved
      expect(output).toContain("const x = 'hello';");
      expect(output).toContain("```typescript");
    });

    it("should preserve links and tables in the output", async () => {
      const markdownContent = [
        "# Heading 1",
        "",
        "Check [this link](https://example.com) for details.",
        "",
        "| Col1 | Col2 |",
        "|------|------|",
        "| A    | B    |",
        "",
      ].join("\n");

      const inputPath = join(tempDir, "links.md");
      const outputPath = join(tempDir, "links.ja.md");
      writeFileSync(inputPath, markdownContent);

      const mockProvider = createMockProvider();

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const output = readFileSync(outputPath, "utf-8");
      // Link URL must be preserved
      expect(output).toContain("https://example.com");
    });
  });

  describe("Large File Chunking (>300 lines)", () => {
    it("should split large files into multiple chunks", async () => {
      const line = "This is a line of text that will be repeated many times.\n";
      const content = line.repeat(350);

      const inputPath = join(tempDir, "large.md");
      const outputPath = join(tempDir, "large.ja.md");
      writeFileSync(inputPath, content);

      const mockProvider = createMockProvider();

      await translateFile({
        provider: mockProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      // Provider should be called multiple times for large files
      expect(mockProvider.chat.mock.calls.length).toBeGreaterThan(1);
      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should throw an error when input file does not exist", async () => {
      const inputPath = join(tempDir, "nonexistent.md");
      const outputPath = join(tempDir, "output.md");
      const mockProvider = createMockProvider();

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
      const mockProvider = createMockProvider();

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

      const mockProvider = createMockProvider({ Hello: "こんにちは" });

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
      const makeSection = (n: number) =>
        [`## Section ${n}`, ...Array.from({ length: 209 }, (_, i) => `Line ${i}`)].join("\n");
      const content = [makeSection(1), makeSection(2), makeSection(3)].join("\n");

      const chunks = splitIntoChunks(content, 300);
      expect(chunks.length).toBeGreaterThan(1);
      const nonFirstChunks = chunks.slice(1);
      for (const chunk of nonFirstChunks) {
        expect(chunk.trimStart()).toMatch(/^## Section/);
      }
    });

    it("should not split in the middle of a table", () => {
      const regularLines = Array.from({ length: 295 }, (_, i) => `Line ${i}`);
      const tableLines = [
        "| Header1 | Header2 |",
        "|---------|---------|",
        ...Array.from({ length: 18 }, (_, i) => `| Row ${i} | Data ${i} |`),
      ];
      const afterTableLines = Array.from({ length: 30 }, (_, i) => `After table line ${i}`);
      const content = [...regularLines, ...tableLines, ...afterTableLines].join("\n");

      const chunks = splitIntoChunks(content, 300);

      expect(chunks.length).toBeGreaterThan(1);

      const chunkWithTableStart = chunks.find((c) => c.includes("| Header1 | Header2 |"));
      const chunkWithTableEnd = chunks.find((c) => c.includes("| Row 17 | Data 17 |"));
      expect(chunkWithTableStart).toBeDefined();
      expect(chunkWithTableEnd).toBeDefined();
      expect(chunkWithTableStart).toBe(chunkWithTableEnd);
    });

    it("should not split inside a fenced code block", () => {
      const regularLines = Array.from({ length: 290 }, (_, i) => `Line ${i}`);
      const codeBlock = [
        "```typescript",
        ...Array.from({ length: 30 }, (_, i) => `const x${i} = ${i};`),
        "```",
      ];
      const afterCode = Array.from({ length: 30 }, (_, i) => `After code ${i}`);
      const content = [...regularLines, ...codeBlock, ...afterCode].join("\n");

      const chunks = splitIntoChunks(content, 300);

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

      expect(splitIntoChunks(content)).toHaveLength(1);

      const chunks = splitIntoChunks(content, 100);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should not infinite-recurse when ### heading is at segment position 0", () => {
      const parts: string[] = [];
      parts.push("## Section A");
      parts.push("### Subsection at position 0");
      for (let i = 0; i < 350; i++) {
        parts.push(`- Item ${i}: description text here`);
      }
      parts.push("## Section B");
      parts.push("Short ending.");
      const content = parts.join("\n");

      const chunks = splitIntoChunks(content, 300);
      expect(chunks.length).toBeGreaterThan(1);
      const rejoined = chunks.join("\n");
      expect(rejoined).toContain("### Subsection at position 0");
      expect(rejoined).toContain("Item 349");
      expect(rejoined).toContain("## Section B");
    });

    it("should handle large files with many headings", () => {
      const parts: string[] = [];
      for (let i = 0; i < 20; i++) {
        parts.push(`## API Section ${i}`);
        for (let j = 0; j < 5; j++) {
          parts.push(`### Endpoint ${i}-${j}`);
          parts.push("```http");
          parts.push(`GET /api/v1/resource-${i}-${j}`);
          parts.push("```");
          parts.push(`Description of endpoint ${i}-${j}.`);
          parts.push(`- Parameter a: value`);
          parts.push(`- Parameter b: value`);
          parts.push("```json");
          parts.push(`{"id": "entity-${i}-${j}"}`);
          parts.push("```");
        }
      }
      const content = parts.join("\n");

      const chunks = splitIntoChunks(content, 300);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.split("\n").length).toBeLessThan(600);
      }
    });
  });
});

// ─── Structured Output (tool_use) path ───────────────────────────────────────

/**
 * Create a mock provider with translateStructured (Claude-like structured output).
 * textMap: { [inputText]: translatedText } — maps source text to translation.
 */
function createStructuredMockProvider(textMap: Record<string, string> = {}) {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    translateStructured: vi.fn().mockImplementation(
      async (request: { segments: Array<{ id: number; text: string }> }) => {
        const translations = request.segments.map((s) => ({
          id: s.id,
          text: textMap[s.text] ?? s.text,
        }));
        return {
          translations,
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        };
      }
    ),
  };
}

describe("Translate Task — Structured Output (tool_use) path", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-structured-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should call translateStructured instead of chat when provider supports it", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Hello\n\nWorld\n");

    const mockProvider = createStructuredMockProvider({
      Hello: "こんにちは",
      World: "世界",
    });

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    expect(mockProvider.translateStructured).toHaveBeenCalled();
    expect(mockProvider.chat).not.toHaveBeenCalled();
  });

  it("should translate text correctly via structured output path", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Hello World\n\nThis is a test document.\n");

    const mockProvider = createStructuredMockProvider({
      "Hello World": "こんにちは世界",
      "This is a test document.": "これはテスト文書です。",
    });

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const result = readFileSync(outputPath, "utf-8");
    expect(result).toContain("こんにちは世界");
    expect(result).toContain("これはテスト文書です。");
  });

  it("should pass systemPrompt (no JSON format section) to translateStructured", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Test\n");

    const mockProvider = createStructuredMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const callArg = mockProvider.translateStructured.mock.calls[0][0];
    expect(callArg.systemPrompt).toBeDefined();
    expect(callArg.systemPrompt).toMatch(/translat/i);
    // Structured prompt must NOT include the JSON format instructions (no need with tool_use)
    expect(callArg.systemPrompt).not.toMatch(/Return ONLY a valid JSON/);
    expect(callArg.systemPrompt).not.toMatch(/## Translation format/);
  });

  it("should pass segments with correct ids to translateStructured", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Title\n\nParagraph one.\n\nParagraph two.\n");

    const mockProvider = createStructuredMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const callArg = mockProvider.translateStructured.mock.calls[0][0];
    const segments: Array<{ id: number; text: string }> = callArg.segments;
    expect(segments.length).toBeGreaterThan(0);
    // IDs should be sequential integers
    const ids = segments.map((s) => s.id);
    expect(ids).toEqual([...Array(ids.length).keys()]);
  });

  it("should throw if translateStructured returns missing IDs (partial response)", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# A\n\nB\n\nC\n");

    const partialProvider = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      translateStructured: vi.fn().mockResolvedValue({
        // Only returns first segment, missing the rest
        translations: [{ id: 0, text: "翻訳A" }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    await expect(
      translateFile({
        provider: partialProvider,
        inputPath,
        outputPath,
        targetLang: "ja",
      })
    ).rejects.toThrow(/partial translation/);
  });

  it("should NOT send code block content via translateStructured", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(
      inputPath,
      "# Heading\n\nSome text.\n\n```typescript\nconst x = 'hello';\n```\n\nMore text.\n"
    );

    const mockProvider = createStructuredMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const callArg = mockProvider.translateStructured.mock.calls[0][0];
    const texts = callArg.segments.map((s: { text: string }) => s.text);
    expect(texts.join(" ")).not.toContain("const x = 'hello'");
    expect(texts.join(" ")).not.toContain("typescript");
  });

  it("should preserve code blocks in output when using structured output path", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    const codeBlock = "```typescript\nconst x = 'hello';\n```";
    writeFileSync(inputPath, `# Title\n\n${codeBlock}\n`);

    const mockProvider = createStructuredMockProvider({ Title: "タイトル" });

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const result = readFileSync(outputPath, "utf-8");
    expect(result).toContain("const x = 'hello'");
    expect(result).toContain("typescript");
    expect(result).toContain("タイトル");
  });

  it("should throw on duplicate IDs in response (structured path)", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# A\n\nB\n");

    const duplicateProvider = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      translateStructured: vi.fn().mockResolvedValue({
        // id 0 appears twice — duplicate
        translations: [
          { id: 0, text: "翻訳A" },
          { id: 0, text: "重複A" },
        ],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    await expect(
      translateFile({ provider: duplicateProvider, inputPath, outputPath, targetLang: "ja" })
    ).rejects.toThrow(/duplicate IDs/);
  });

  it("should throw on unexpected IDs in response (structured path)", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# A\n");

    const unexpectedProvider = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      translateStructured: vi.fn().mockResolvedValue({
        // id 999 was never in the input
        translations: [
          { id: 0, text: "翻訳A" },
          { id: 999, text: "幽霊" },
        ],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    await expect(
      translateFile({ provider: unexpectedProvider, inputPath, outputPath, targetLang: "ja" })
    ).rejects.toThrow(/unexpected IDs/);
  });
});
