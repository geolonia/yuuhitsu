import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  translateFile,
  separateFrontmatter,
  protectCodeBlocks,
  splitIntoChunks,
} from "../../../src/tasks/translate.js";
import type { AIProvider } from "../../../src/provider/interface.js";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Create a JSON-returning mock provider. textMap maps source text → translated text. */
function createJsonMockProvider(textMap: Record<string, string> = {}): AIProvider {
  return {
    chat: vi.fn().mockImplementation(async (request: any) => {
      const userMsg = request.messages.find((m: any) => m.role === "user");
      let segments: Array<{ id: number; text: string }> = [];
      try {
        segments = JSON.parse(userMsg.content).segments ?? [];
      } catch {
        // no segments
      }
      const translations = segments.map((s: { id: number; text: string }) => ({
        id: s.id,
        text: textMap[s.text] ?? s.text,
      }));
      return {
        content: JSON.stringify({ translations }),
        model: "mock",
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        finishReason: "end_turn",
      };
    }),
    chatStream: vi.fn() as any,
  };
}

describe("Code block preservation (AST-based)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-codeblock-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("should preserve a TypeScript code block exactly in the output", async () => {
    const codeBlock = '```typescript\nconst x: string = "hello";\nconsole.log(x);\n```';
    const inputContent = `# Title\n\nSome text.\n\n${codeBlock}\n\nMore text.`;

    const provider = createJsonMockProvider({
      Title: "タイトル",
      "Some text.": "何かのテキスト。",
      "More text.": "もっとテキスト。",
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");

    // Code block content must be preserved
    expect(output).toContain('const x: string = "hello";');
    expect(output).toContain("```typescript");

    // Code content must NOT have been sent to LLM
    const callArg = (provider.chat as any).mock.calls[0][0];
    const userMsg = callArg.messages.find((m: any) => m.role === "user");
    const segments = JSON.parse(userMsg.content).segments ?? [];
    const texts = segments.map((s: any) => s.text);
    expect(texts.join(" ")).not.toContain("const x:");
    expect(texts.join(" ")).not.toContain("```typescript");
  });

  it("should preserve multiple code blocks with different languages", async () => {
    const jsBlock = "```javascript\nconsole.log('hello');\n```";
    const pyBlock = "```python\nprint('hello')\n```";
    const bashBlock = "```bash\necho 'hello'\n```";

    const inputContent = `# Multi\n\n${jsBlock}\n\n${pyBlock}\n\n${bashBlock}`;

    const provider = createJsonMockProvider({ Multi: "マルチ" });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain("console.log('hello');");
    expect(output).toContain("print('hello')");
    expect(output).toContain("echo 'hello'");
  });

  it("should preserve inline code in the output (paragraph-level: whole sentence as one segment)", async () => {
    const inputContent = "Use `const x = 1` and `let y = 2` in TypeScript.";

    // 0.3.0 paragraph-level: the whole paragraph is ONE segment, not fragmented.
    // Mock maps the whole markdown paragraph to a translated version.
    const provider = createJsonMockProvider({
      "Use `const x = 1` and `let y = 2` in TypeScript.":
        "TypeScriptでは `const x = 1` と `let y = 2` を使います。",
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");

    // Inline code must be preserved in output
    expect(output).toContain("`const x = 1`");
    expect(output).toContain("`let y = 2`");

    // 0.3.0: the whole paragraph is sent as ONE segment (no fragmentation)
    const callArg = (provider.chat as any).mock.calls[0][0];
    const segments = JSON.parse(callArg.messages.find((m: any) => m.role === "user").content).segments ?? [];
    expect(segments).toHaveLength(1);
    // The segment contains the full markdown paragraph including inline code with backticks
    expect(segments[0].text).toBe("Use `const x = 1` and `let y = 2` in TypeScript.");
  });

  it("should preserve Japanese comments inside code blocks unchanged", async () => {
    const codeBlock = "```typescript\n// これはJapaneseコメント\nconst x = 1; // 初期化\n```";
    const inputContent = `# 説明\n\n${codeBlock}\n\n続きのテキスト。`;

    const provider = createJsonMockProvider({
      "説明": "Description",
      "続きのテキスト。": "Continued text.",
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "en" });

    const output = readFileSync(outputPath, "utf-8");

    // Japanese comments in code must NOT change
    expect(output).toContain("// これはJapaneseコメント");
    expect(output).toContain("// 初期化");
  });

  it("should translate text when there are no code blocks", async () => {
    const inputContent = "# Hello\n\nThis is regular text without code blocks.";

    const provider = createJsonMockProvider({
      Hello: "こんにちは",
      "This is regular text without code blocks.": "コードブロックのない普通のテキストです。",
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain("こんにちは");
    expect(output).toContain("コードブロックのない普通のテキストです。");
  });

  it("should handle nested code blocks", async () => {
    const inputContent =
      "````markdown\nHere is some `inline code` and:\n```typescript\nconst x = 1;\n```\n````\n\nSome text.";

    const provider = createJsonMockProvider({ "Some text.": "いくつかのテキスト。" });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");

    // The outer block must be preserved
    expect(output).toContain("const x = 1;");
  });
});

describe("Code-block protection utility (protectCodeBlocks)", () => {
  it("should represent each code block as a single placeholder line (no padding)", () => {
    const codeBlock = "```text\n" + Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n") + "\n```";
    const content = `## Command Tree\n\nSome intro.\n\n${codeBlock}\n\nAfter text.`;

    const { text, map } = protectCodeBlocks(content);
    const lines = text.split("\n");

    const placeholderLines = lines.filter((l) => l.startsWith("__CODE_BLOCK_"));
    expect(placeholderLines).toHaveLength(1);

    const originalLineCount = content.split("\n").length;
    expect(lines.length).toBeLessThan(originalLineCount - 100);

    expect(text).not.toContain("```text");
    expect(text).not.toContain("line 0");
    expect(map.size).toBe(1);
  });

  it("should keep 120-line code block in single chunk when maxChunkLines=100", () => {
    const codeBlock = "```text\n" + Array.from({ length: 118 }, (_, i) => `tree line ${i}`).join("\n") + "\n```";
    const content = `## Command Tree\n\nIntroduction text.\n\n${codeBlock}`;

    const { text: protectedBody } = protectCodeBlocks(content);
    const chunks = splitIntoChunks(protectedBody, 100);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("__CODE_BLOCK_0__");
    expect(chunks[0]).toContain("## Command Tree");
  });

  it("should never split chunk boundary inside code block placeholder region", () => {
    for (const codeBlockLines of [10, 50, 120, 300]) {
      const codeBlock =
        "```typescript\n" +
        Array.from({ length: codeBlockLines }, (_, i) => `const x${i} = ${i};`).join("\n") +
        "\n```";

      const sections = Array.from(
        { length: 3 },
        (_, i) => `## Section ${i}\n\nSome text here.\n\n${codeBlock}\n\nMore text.`
      ).join("\n\n");

      const { text: protectedBody } = protectCodeBlocks(sections);
      const chunks = splitIntoChunks(protectedBody, 100);

      for (const chunk of chunks) {
        const chunkLines = chunk.split("\n");
        for (let i = 0; i < chunkLines.length; i++) {
          if (chunkLines[i].startsWith("__CODE_BLOCK_")) {
            const nextNonEmpty = chunkLines.slice(i + 1).find((l) => l.trim() !== "");
            if (nextNonEmpty !== undefined) {
              expect(nextNonEmpty).not.toMatch(/^__CODE_BLOCK_/);
            }
          }
        }
      }

      const allChunkText = chunks.join("\n");
      const protectedLines = protectedBody.split("\n").filter((l) => l.startsWith("__CODE_BLOCK_"));
      for (const ph of protectedLines) {
        expect(allChunkText).toContain(ph);
      }
    }
  });
});

describe("protectCodeBlocks robustness", () => {
  it("should handle many code blocks without stack overflow (ngsild.md pattern)", () => {
    const blocks: string[] = ["# NGSI-LD API\n"];
    for (let i = 0; i < 50; i++) {
      blocks.push(`## Section ${i}\n`);
      blocks.push("```http\nGET /api/v1/entities\n```\n");
      blocks.push("| Param | Type |\n|---|---|\n| id | string |\n");
      blocks.push(`\`\`\`json\n{"id": "urn:entity:${i}"}\n\`\`\`\n`);
      blocks.push(`Use \`param${i}\` for filtering.\n`);
    }
    const content = blocks.join("\n");

    const result = protectCodeBlocks(content);
    expect(result.map.size).toBeGreaterThanOrEqual(100);
    expect(result.text).toContain("__INLINE_CODE_");
    expect(result.text).not.toMatch(/```http\n/);
    expect(result.text).not.toMatch(/```json\n/);
  });

  it("should handle unclosed code fence gracefully", () => {
    const content = "# Title\n\n```json\n{\"unclosed\": true}\n\nSome text after.";
    const result = protectCodeBlocks(content);

    expect(result.text).toContain("```json");
    expect(result.text).toContain('"unclosed"');
  });
});

describe("Real ngsild.md regression", () => {
  const fixturesDir = resolve(__dirname, "../../../tests/fixtures");
  const ngsildPath = join(fixturesDir, "ngsild-large.md");

  it("should process actual ngsild.md without stack overflow", () => {
    const content = readFileSync(ngsildPath, "utf-8");
    expect(content.split("\n").length).toBeGreaterThan(1500);

    const { text, map } = protectCodeBlocks(content);
    expect(map.size).toBeGreaterThan(80);

    const chunks = splitIntoChunks(text, 300);
    expect(chunks.length).toBeGreaterThan(1);

    const rejoined = chunks.join("\n");
    expect(rejoined).toContain("NGSI-LD");
  });

  it("should complete full translateFile pipeline on ngsild.md with mock provider", async () => {
    const raw = readFileSync(ngsildPath, "utf-8");
    const withFrontmatter = "---\ntitle: \"NGSI-LD API\"\n---\n" + raw;

    const tempDir2 = join(tmpdir(), `yuuhitsu-ngsild-test-${Date.now()}`);
    mkdirSync(tempDir2, { recursive: true });
    const inputPath = join(tempDir2, "ngsild.md");
    const outputPath = join(tempDir2, "ngsild.ja.md");
    writeFileSync(inputPath, withFrontmatter, "utf-8");

    // Mock that echoes all text segments back unchanged (simulates identity translation)
    const mockChat = vi.fn().mockImplementation(async (request: any) => {
      const userMsg = request.messages.find((m: any) => m.role === "user");
      let segments: Array<{ id: number; text: string }> = [];
      try {
        segments = JSON.parse(userMsg.content).segments ?? [];
      } catch { /* no segments */ }
      return {
        content: JSON.stringify({ translations: segments.map((s) => ({ id: s.id, text: s.text })) }),
        model: "mock",
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        finishReason: "end_turn",
      };
    });

    try {
      const result = await translateFile({
        provider: { chat: mockChat, chatStream: vi.fn() as any },
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(result.chunks).toBeGreaterThan(1);
      expect(existsSync(outputPath)).toBe(true);
      const output = readFileSync(outputPath, "utf-8");
      expect(output).toContain("NGSI-LD");
    } finally {
      rmSync(tempDir2, { recursive: true, force: true });
    }
  });
});

describe("Frontmatter edge cases", () => {
  let tempDir: string;
  let provider: AIProvider;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-frontmatter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    provider = createJsonMockProvider();
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  it("should parse frontmatter with CRLF line endings", () => {
    const content = "---\r\ntitle: Test\r\ndescription: A test\r\n---\r\n\r\n# Body\r\n";
    const { frontmatter, body } = separateFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("title: Test");
    expect(body).toContain("# Body");
    expect(body).not.toContain("title:");
  });

  it("should parse frontmatter without trailing newline after closing ---", () => {
    const content = "---\ntitle: Test\n---";
    const { frontmatter, body } = separateFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("title: Test");
    expect(body).toBe("");
  });

  it("should parse frontmatter with trailing spaces after closing ---", () => {
    const content = "---\ntitle: Test\n---  \n\n# Body";
    const { frontmatter, body } = separateFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter).toContain("title: Test");
    expect(body).toContain("# Body");
  });

  it("should handle empty frontmatter (--- then ---)", () => {
    const content = "---\n---\n\n# Body";
    const { frontmatter, body } = separateFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(body).toContain("# Body");
  });

  it("should preserve frontmatter title during translation and not send it to LLM", async () => {
    const inputContent = "---\r\ntitle: Release Notes\r\n---\r\n\r\n# Content\r\n\r\nSome text.";

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");

    // Frontmatter must be preserved unchanged
    expect(output).toContain("title: Release Notes");

    // Frontmatter must NOT be sent to LLM
    const callArg = (provider.chat as any).mock.calls[0][0];
    const userMsg = callArg.messages.find((m: any) => m.role === "user");
    const segments = JSON.parse(userMsg.content).segments ?? [];
    const texts = segments.map((s: any) => s.text).join(" ");
    expect(texts).not.toContain("title: Release Notes");
  });
});
