import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateFile, separateFrontmatter, protectCodeBlocks, splitIntoChunks } from "../../../src/tasks/translate.js";
import type { AIProvider, ChatCompletionResponse } from "../../../src/provider/interface.js";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Code block protection", () => {
  let mockProvider: AIProvider;
  let tempDir: string;
  let mockChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-codeblock-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    mockChat = vi.fn<any, Promise<ChatCompletionResponse>>();
    mockProvider = {
      name: "mock",
      chat: mockChat,
    };
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve a single TypeScript code block before and after translation", async () => {
    const codeBlock = '```typescript\nconst x: string = "hello";\nconsole.log(x);\n```';
    const inputContent = `# Title\n\nSome text.\n\n${codeBlock}\n\nMore text.`;
    const translatedText = "# タイトル\n\n何かのテキスト。\n\n__CODE_BLOCK_0__\n\nもっとテキスト。";

    mockChat.mockImplementation(async ({ messages }: any) => {
      const userMsg = messages.find((m: any) => m.role === "user");
      // LLM returns placeholder as-is
      return {
        content: translatedText,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const output = readFileSync(outputPath, "utf-8");

    // Code block must be preserved exactly
    expect(output).toContain(codeBlock);

    // LLM must NOT have received raw code block
    const callArg = mockChat.mock.calls[0][0];
    const userMessage = callArg.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).not.toContain('const x: string = "hello";');
    expect(userMessage.content).toContain("__CODE_BLOCK_0__");
  });

  it("should preserve multiple code blocks with different languages", async () => {
    const jsBlock = "```javascript\nconsole.log('hello');\n```";
    const pyBlock = "```python\nprint('hello')\n```";
    const bashBlock = "```bash\necho 'hello'\n```";

    const inputContent = `# Multi\n\n${jsBlock}\n\n${pyBlock}\n\n${bashBlock}`;
    const translatedText = "# マルチ\n\n__CODE_BLOCK_0__\n\n__CODE_BLOCK_1__\n\n__CODE_BLOCK_2__";

    mockChat.mockResolvedValue({
      content: translatedText,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const output = readFileSync(outputPath, "utf-8");

    expect(output).toContain(jsBlock);
    expect(output).toContain(pyBlock);
    expect(output).toContain(bashBlock);
  });

  it("should preserve inline code", async () => {
    const inputContent = "Use `const x = 1` and `let y = 2` in TypeScript.";
    const translatedText = "TypeScriptでは`__INLINE_CODE_0__`と`__INLINE_CODE_1__`を使ってください。";

    mockChat.mockResolvedValue({
      content: translatedText,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const output = readFileSync(outputPath, "utf-8");

    // Inline code must be preserved
    expect(output).toContain("`const x = 1`");
    expect(output).toContain("`let y = 2`");

    // LLM must NOT have received raw inline code
    const callArg = mockChat.mock.calls[0][0];
    const userMessage = callArg.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).toContain("__INLINE_CODE_0__");
    expect(userMessage.content).toContain("__INLINE_CODE_1__");
    expect(userMessage.content).not.toContain("const x = 1");
  });

  it("should preserve Japanese comments inside code blocks unchanged", async () => {
    const codeBlock = "```typescript\n// これはJapaneseコメント\nconst x = 1; // 初期化\n```";
    const inputContent = `# 説明\n\n${codeBlock}\n\n続きのテキスト。`;
    const translatedText = "# Description\n\n__CODE_BLOCK_0__\n\nContinued text.";

    mockChat.mockResolvedValue({
      content: translatedText,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "en",
    });

    const output = readFileSync(outputPath, "utf-8");

    // Japanese comments in code must NOT be changed
    expect(output).toContain("// これはJapaneseコメント");
    expect(output).toContain("// 初期化");
    expect(output).toContain(codeBlock);
  });

  it("should translate normally when there are no code blocks", async () => {
    const inputContent = "# Hello\n\nThis is regular text without code blocks.";
    const translatedText = "# こんにちは\n\nコードブロックのない普通のテキストです。";

    mockChat.mockResolvedValue({
      content: translatedText,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const output = readFileSync(outputPath, "utf-8");

    expect(output).toBe(translatedText);

    // No placeholder should appear in input to LLM (no code blocks)
    const callArg = mockChat.mock.calls[0][0];
    const userMessage = callArg.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).not.toContain("__CODE_BLOCK_");
    expect(userMessage.content).not.toContain("__INLINE_CODE_");
  });

  it("should handle nested code blocks (backtick inside fenced block)", async () => {
    const inputContent = "````markdown\nHere is some `inline code` and:\n```typescript\nconst x = 1;\n```\n````\n\nSome text.";
    const translatedText = "__CODE_BLOCK_0__\n\nいくつかのテキスト。";

    mockChat.mockResolvedValue({
      content: translatedText,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const output = readFileSync(outputPath, "utf-8");

    // The outer block including nested content must be preserved
    expect(output).toContain("````markdown");
    expect(output).toContain("const x = 1;");
    expect(output).not.toContain("__CODE_BLOCK_0__");
  });
});

describe("protectCodeBlocks robustness", () => {
  it("should handle many code blocks without stack overflow (ngsild.md pattern)", () => {
    // protectCodeBlocks imported at top level

    // Simulate ngsild.md: many short code blocks (http + json) interleaved with text/tables
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
    // 50 http blocks + 50 json blocks = 100 code blocks
    expect(result.map.size).toBeGreaterThanOrEqual(100);
    // 50 inline codes
    expect(result.text).toContain("__INLINE_CODE_");
    // No raw code blocks in output
    expect(result.text).not.toMatch(/```http\n/);
    expect(result.text).not.toMatch(/```json\n/);
  });

  it("should handle unclosed code fence gracefully", () => {
    // protectCodeBlocks imported at top level

    const content = "# Title\n\n```json\n{\"unclosed\": true}\n\nSome text after.";
    const result = protectCodeBlocks(content);

    // Unclosed fence should be emitted as-is, not swallowed
    expect(result.text).toContain("```json");
    expect(result.text).toContain('"unclosed"');
  });
});

describe("Real ngsild.md regression", () => {
  const fixturesDir = resolve(__dirname, "../../../tests/fixtures");
  const ngsildPath = join(fixturesDir, "ngsild-large.md");

  it("should process actual ngsild.md (1597 lines, 93 code blocks) without stack overflow", () => {
    const content = readFileSync(ngsildPath, "utf-8");
    expect(content.split("\n").length).toBeGreaterThan(1500);

    // protectCodeBlocks must not stack overflow
    const { text, map } = protectCodeBlocks(content);
    expect(map.size).toBeGreaterThan(80);

    // splitIntoChunks must not infinite-recurse
    const chunks = splitIntoChunks(text, 300);
    expect(chunks.length).toBeGreaterThan(1);

    // All content must be represented in chunks
    const rejoined = chunks.join("\n");
    expect(rejoined).toContain("NGSI-LD");
  });

  it("should process ngsild.md with bullet sentinels (translate-protected.ts simulation)", () => {
    const raw = readFileSync(ngsildPath, "utf-8");

    // Add frontmatter like sync-docs does
    const withFrontmatter = "---\ntitle: \"NGSI-LD API\"\n---\n" + raw;

    // Simulate protectBullets from translate-protected.ts
    const SENTINEL = "%%LISTITEM%%";
    const lines = withFrontmatter.split("\n");
    const bulletProtected: string[] = [];
    for (const line of lines) {
      if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        bulletProtected.push(SENTINEL);
      }
      bulletProtected.push(line);
    }
    const content = bulletProtected.join("\n");
    expect(content.split("\n").length).toBeGreaterThan(1600);

    const { frontmatter, body } = separateFrontmatter(content);
    expect(frontmatter).not.toBeNull();

    const { text, map } = protectCodeBlocks(body);
    expect(map.size).toBeGreaterThan(80);

    // This is where the infinite recursion occurred before the fix
    const chunks = splitIntoChunks(text, 300);
    expect(chunks.length).toBeGreaterThan(1);

    // No chunk should be unreasonably large
    for (const chunk of chunks) {
      expect(chunk.split("\n").length).toBeLessThan(600);
    }
  });

  it("should complete full translateFile pipeline on ngsild.md with mock provider", async () => {
    const raw = readFileSync(ngsildPath, "utf-8");
    const withFrontmatter = "---\ntitle: \"NGSI-LD API\"\n---\n" + raw;

    // Apply bullet sentinels
    const SENTINEL = "%%LISTITEM%%";
    const lines = withFrontmatter.split("\n");
    const bulletProtected: string[] = [];
    for (const line of lines) {
      if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        bulletProtected.push(SENTINEL);
      }
      bulletProtected.push(line);
    }

    const tempDir = join(tmpdir(), `yuuhitsu-ngsild-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const inputPath = join(tempDir, "ngsild.md");
    const outputPath = join(tempDir, "ngsild.ja.md");
    writeFileSync(inputPath, bulletProtected.join("\n"), "utf-8");

    const mockChat = vi.fn<any, Promise<ChatCompletionResponse>>().mockImplementation(
      async ({ messages }: any) => ({
        content: messages.find((m: any) => m.role === "user").content,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      })
    );

    try {
      const result = await translateFile({
        provider: { name: "mock", chat: mockChat },
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      expect(result.chunks).toBeGreaterThan(1);
      expect(existsSync(outputPath)).toBe(true);
      const output = readFileSync(outputPath, "utf-8");
      expect(output).toContain("NGSI-LD");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Frontmatter edge cases", () => {
  let mockProvider: AIProvider;
  let tempDir: string;
  let mockChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-frontmatter-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    mockChat = vi.fn<any, Promise<ChatCompletionResponse>>();
    mockProvider = {
      name: "mock",
      chat: mockChat,
    };
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

  it("should preserve frontmatter title during translation with CRLF content", async () => {
    const inputContent = "---\r\ntitle: Release Notes\r\n---\r\n\r\n# Content\r\n\r\nSome text.";
    const translatedBody = "# コンテンツ\n\nいくつかのテキスト。";

    mockChat.mockResolvedValue({
      content: translatedBody,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const inputPath = join(tempDir, "test.md");
    const outputPath = join(tempDir, "test.ja.md");
    writeFileSync(inputPath, inputContent, "utf-8");

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
    });

    const output = readFileSync(outputPath, "utf-8");

    // Title must be preserved in frontmatter
    expect(output).toContain("title: Release Notes");

    // LLM must NOT receive frontmatter
    const callArg = mockChat.mock.calls[0][0];
    const userMessage = callArg.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).not.toContain("title: Release Notes");
    expect(userMessage.content).toContain("# Content");
  });
});
