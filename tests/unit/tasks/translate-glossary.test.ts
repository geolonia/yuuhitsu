import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { translateFile } from "../../../src/tasks/translate.js";
import type { GlossaryConfig } from "../../../src/tasks/glossary.js";

/** Create a JSON-returning mock that echoes text segments back unchanged. */
function createMockProvider() {
  return {
    chat: vi.fn().mockImplementation(async (request: any) => {
      const userMsg = request.messages.find((m: any) => m.role === "user");
      let segments: Array<{ id: number; text: string }> = [];
      try {
        segments = JSON.parse(userMsg.content).segments ?? [];
      } catch {
        // no segments
      }
      return {
        content: JSON.stringify({ translations: segments.map((s) => ({ id: s.id, text: s.text })) }),
        model: "mock-model",
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        finishReason: "end_turn",
      };
    }),
    chatStream: vi.fn(),
  };
}

describe("Translate Task - Glossary Integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-translate-glossary-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const sampleGlossary: GlossaryConfig = {
    version: 1,
    languages: ["ja", "en"],
    terms: [
      {
        canonical: "API",
        type: "noun",
        translations: { ja: "API", en: "API" },
        do_not_use: { ja: ["ＡＰＩ", "えーぴーあい"] },
      },
      {
        canonical: "webhook",
        type: "noun",
        translations: { ja: "Webhook", en: "webhook" },
        do_not_use: { ja: ["ウェブフック"] },
      },
    ],
  };

  it("should include glossary term instructions in system prompt", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# API Reference\n\nThis document describes the API.\n");

    const mockProvider = createMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
      glossaryConfig: sampleGlossary,
    });

    expect(mockProvider.chat).toHaveBeenCalledTimes(1);
    const callArgs = mockProvider.chat.mock.calls[0][0];
    const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
    expect(systemMsg).toBeDefined();
    // Glossary instructions should appear in system prompt
    expect(systemMsg.content).toContain("API");
    expect(systemMsg.content).toContain("ＡＰＩ");
  });

  it("should include do_not_use terms for target language in prompt", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# Webhook Guide\n");

    const mockProvider = createMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
      glossaryConfig: sampleGlossary,
    });

    const callArgs = mockProvider.chat.mock.calls[0][0];
    const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
    expect(systemMsg.content).toContain("ウェブフック");
    expect(systemMsg.content).toContain("Webhook");
  });

  it("should not add glossary instructions when glossaryConfig is undefined", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# Test\n");

    const mockProvider = createMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
      // no glossaryConfig
    });

    const callArgs = mockProvider.chat.mock.calls[0][0];
    const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
    // Without glossary, should not contain specific glossary section keywords
    expect(systemMsg.content).not.toContain("Glossary");
    expect(systemMsg.content).not.toContain("do_not_use");
  });

  it("should use canonical translation for target language in prompt", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# Test\n");

    const mockProvider = createMockProvider();

    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
      glossaryConfig: sampleGlossary,
    });

    const callArgs = mockProvider.chat.mock.calls[0][0];
    const systemMsg = callArgs.messages.find((m: any) => m.role === "system");
    // Canonical translation for ja should appear
    expect(systemMsg.content).toContain("Webhook");
  });

  // The system prompt should include JSON translation format instructions
  it("should include JSON translation format instructions in system prompt", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# Test\n");

    const mockProvider = createMockProvider();
    await translateFile({ provider: mockProvider, inputPath, outputPath, targetLang: "ja" });

    const systemMsg = mockProvider.chat.mock.calls[0][0].messages.find(
      (m: any) => m.role === "system",
    );
    expect(systemMsg.content).toContain("segments");
    expect(systemMsg.content).toContain("translations");
    expect(systemMsg.content).toContain("JSON");
  });

  // Glossary-provided system prompt should include warn strengthening
  it("should include strengthened warn rule when glossary is provided", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# Test\n");

    const mockProvider = createMockProvider();
    await translateFile({
      provider: mockProvider,
      inputPath,
      outputPath,
      targetLang: "ja",
      glossaryConfig: sampleGlossary,
    });

    const systemMsg = mockProvider.chat.mock.calls[0][0].messages.find(
      (m: any) => m.role === "system",
    );
    expect(systemMsg.content).toContain("near-mandatory");
    expect(systemMsg.content).toContain("regardless of severity");
  });

  // Without glossary, warn strengthening text should be absent
  it("should not include warn strengthening text when glossaryConfig is undefined", async () => {
    const inputPath = join(tempDir, "input.md");
    const outputPath = join(tempDir, "output.ja.md");
    writeFileSync(inputPath, "# Test\n");

    const mockProvider = createMockProvider();
    await translateFile({ provider: mockProvider, inputPath, outputPath, targetLang: "ja" });

    const systemMsg = mockProvider.chat.mock.calls[0][0].messages.find(
      (m: any) => m.role === "system",
    );
    expect(systemMsg.content).not.toContain("near-mandatory");
    expect(systemMsg.content).not.toContain("regardless of severity");
  });
});
