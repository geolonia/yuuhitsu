import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { translateFile } from "../../../src/tasks/translate.js";
import type { GlossaryConfig } from "../../../src/tasks/glossary.js";

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

    const mockProvider = createMockProvider("# APIリファレンス\n\nこのドキュメントはAPIについて説明します。\n");

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

    const mockProvider = createMockProvider("# Webhookガイド\n");

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

    const mockProvider = createMockProvider("# テスト\n");

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

    const mockProvider = createMockProvider("# テスト\n");

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
});
