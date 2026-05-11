import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { translateFile } from "../../../src/tasks/translate.js";
import type { AIProvider, StructuredTranslateRequest, StructuredTranslateResponse } from "../../../src/provider/interface.js";

/** Create a structured mock provider (Claude-style) with translateStructured. */
function createStructuredMockProvider(
  handler: (req: StructuredTranslateRequest) => Promise<StructuredTranslateResponse>
): AIProvider {
  return {
    chat: vi.fn(),
    chatStream: vi.fn() as any,
    translateStructured: vi.fn().mockImplementation(handler),
  };
}

/** Create a simple structured mock provider that maps text → translation. */
function createSimpleStructuredProvider(textMap: Record<string, string> = {}): AIProvider {
  return createStructuredMockProvider(async (req) => ({
    translations: req.segments.map((s) => ({
      id: s.id,
      text: textMap[s.text] ?? s.text,
    })),
    usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
  }));
}

describe("0.3.1 hotfix — Part A: unexpected ID filter + retry", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-031-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should retry when structured provider returns unexpected IDs and succeed on retry", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Hello\n\nFirst paragraph.\n\nSecond paragraph.\n");

    let callCount = 0;
    const provider = createStructuredMockProvider(async (req) => {
      callCount++;
      const correctTranslations = req.segments.map((s) => ({
        id: s.id,
        text: s.text === "First paragraph." ? "最初の段落。" : s.text === "Second paragraph." ? "2番目の段落。" : s.text,
      }));

      if (callCount === 1) {
        // First call: inject an unexpected ID
        return {
          translations: [
            ...correctTranslations,
            { id: 999, text: "Hallucinated text" },
          ],
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        };
      }
      // Subsequent calls: return correct translations (without unexpected IDs)
      return {
        translations: correctTranslations,
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      };
    });

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    expect(callCount).toBeGreaterThanOrEqual(2);
    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain("最初の段落。");
    expect(output).toContain("2番目の段落。");
  });

  it("should throw after max retries if unexpected IDs persist", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Hello\n\nSome paragraph.\n");

    // Always return an unexpected ID
    const provider = createStructuredMockProvider(async (req) => ({
      translations: [
        { id: req.segments[0]?.id ?? 0, text: "翻訳テキスト" },
        { id: 999, text: "Hallucinated" },
      ],
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
    }));

    await expect(
      translateFile({ provider, inputPath, outputPath, targetLang: "ja" })
    ).rejects.toThrow(/unexpected IDs/i);
  });

  it("should include retry context in system prompt on retry", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Doc\n\nA paragraph.\n");

    const capturedPrompts: string[] = [];
    let callCount = 0;

    const provider = createStructuredMockProvider(async (req) => {
      callCount++;
      capturedPrompts.push(req.systemPrompt);
      if (callCount === 1) {
        return {
          translations: [
            { id: req.segments[0]?.id ?? 0, text: "翻訳済み。" },
            { id: 777, text: "Unexpected" },
          ],
          usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        };
      }
      return {
        translations: req.segments.map((s) => ({ id: s.id, text: "翻訳済み。" })),
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      };
    });

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    expect(capturedPrompts.length).toBeGreaterThanOrEqual(2);
    // Retry prompt should contain the unexpected ID correction
    expect(capturedPrompts[1]).toContain("777");
    expect(capturedPrompts[1]).toContain("RETRY CORRECTION");
  });

  it("should pass systemPromptSuffix to structured provider", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Test\n\nA simple paragraph.\n");

    const capturedPrompts: string[] = [];
    const provider = createStructuredMockProvider(async (req) => {
      capturedPrompts.push(req.systemPrompt);
      return {
        translations: req.segments.map((s) => ({ id: s.id, text: `翻訳: ${s.text}` })),
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      };
    });

    await translateFile({
      provider,
      inputPath,
      outputPath,
      targetLang: "ja",
      systemPromptSuffix: "CUSTOM SUFFIX FOR TESTING",
    });

    expect(capturedPrompts[0]).toContain("CUSTOM SUFFIX FOR TESTING");
  });
});

describe("0.3.1 hotfix — Part C: fence-only paragraph skip", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-fence-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("fence-only guard regex matches bare fence markers and ignores normal content", () => {
    // This guard is applied inside extractBlockNodes() before sending segments to the LLM.
    // Standard CommonMark/GFM always parses ``` lines as code nodes (not paragraphs), so
    // the guard cannot be exercised through translateFile(). We test the regex directly.
    const fenceGuardRegex = /^(`{3,}|~{3,})\S*$/;
    expect(fenceGuardRegex.test("```")).toBe(true);
    expect(fenceGuardRegex.test("```yaml")).toBe(true);
    expect(fenceGuardRegex.test("~~~python")).toBe(true);
    expect(fenceGuardRegex.test("````")).toBe(true);
    expect(fenceGuardRegex.test("Normal paragraph text")).toBe(false);
    expect(fenceGuardRegex.test("``` text after space")).toBe(false);
    expect(fenceGuardRegex.test("``")).toBe(false);
  });

  it("should translate normal paragraphs adjacent to code blocks", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    const content = `# Example

Before the code block.

\`\`\`javascript
const x = 1;
\`\`\`

After the code block.
`;
    writeFileSync(inputPath, content);

    const provider = createSimpleStructuredProvider({
      "Before the code block.": "コードブロックの前。",
      "After the code block.": "コードブロックの後。",
    });

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    const output = readFileSync(outputPath, "utf-8");
    expect(output).toContain("コードブロックの前。");
    expect(output).toContain("コードブロックの後。");
    // Code block content should be preserved unchanged
    expect(output).toContain("const x = 1;");
  });
});

describe("0.3.1 hotfix — system prompt includes ID and fence constraints", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-prompt-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should include ID constraint in structured system prompt", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Test\n\nA test paragraph.\n");

    const capturedPrompts: string[] = [];
    const provider = createStructuredMockProvider(async (req) => {
      capturedPrompts.push(req.systemPrompt);
      return {
        translations: req.segments.map((s) => ({ id: s.id, text: s.text })),
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      };
    });

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    expect(capturedPrompts[0]).toContain("CRITICAL");
    expect(capturedPrompts[0]).toContain("IDs");
    expect(capturedPrompts[0]).toContain("hallucinate");
  });

  it("should include code fence constraint in structured system prompt", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.md");
    writeFileSync(inputPath, "# Test\n\nA test paragraph.\n");

    const capturedPrompts: string[] = [];
    const provider = createStructuredMockProvider(async (req) => {
      capturedPrompts.push(req.systemPrompt);
      return {
        translations: req.segments.map((s) => ({ id: s.id, text: s.text })),
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      };
    });

    await translateFile({ provider, inputPath, outputPath, targetLang: "ja" });

    expect(capturedPrompts[0]).toMatch(/code fences/i);
    expect(capturedPrompts[0]).toMatch(/do not add/i);
  });
});
