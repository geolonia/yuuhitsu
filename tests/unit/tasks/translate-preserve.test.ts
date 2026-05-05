import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateFile } from "../../../src/tasks/translate.js";
import type { AIProvider } from "../../../src/provider/interface.js";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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

describe("Translation preservation (frontmatter & links)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-preserve-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Frontmatter preservation", () => {
    it("should preserve frontmatter exactly as-is during translation", async () => {
      const inputContent = `---
title: 変更履歴
description: リリースノート
layout: default
---

# Changelog

This is the changelog.`;

      const provider = createJsonMockProvider({
        Changelog: "変更履歴",
        "This is the changelog.": "これは変更履歴です。",
      });

      const inputPath = join(tempDir, "test.md");
      const outputPath = join(tempDir, "test.ja.md");

      writeFileSync(inputPath, inputContent, "utf-8");

      await translateFile({
        provider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const output = readFileSync(outputPath, "utf-8");

      // Frontmatter should be preserved exactly
      expect(output).toContain("---\ntitle: 変更履歴\ndescription: リリースノート\nlayout: default\n---");

      // Body should contain translated text
      expect(output).toContain("変更履歴");
      expect(output).toContain("これは変更履歴です。");

      // LLM should NOT receive frontmatter
      const callArg = (provider.chat as any).mock.calls[0][0];
      const userMsg = callArg.messages.find((m: any) => m.role === "user");
      const segments = JSON.parse(userMsg.content).segments ?? [];
      const texts = segments.map((s: any) => s.text).join(" ");
      expect(texts).not.toContain("title: 変更履歴");
    });

    it("should handle files without frontmatter normally", async () => {
      const inputContent = `# Introduction

This is a document without frontmatter.`;

      const provider = createJsonMockProvider({
        Introduction: "はじめに",
        "This is a document without frontmatter.": "これはfrontmatterのないドキュメントです。",
      });

      const inputPath = join(tempDir, "test.md");
      const outputPath = join(tempDir, "test.ja.md");

      writeFileSync(inputPath, inputContent, "utf-8");

      await translateFile({
        provider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const output = readFileSync(outputPath, "utf-8");
      expect(output).toContain("はじめに");
      expect(output).toContain("これはfrontmatterのないドキュメントです。");

      // LLM should receive heading text
      const callArg = (provider.chat as any).mock.calls[0][0];
      const userMsg = callArg.messages.find((m: any) => m.role === "user");
      const segments = JSON.parse(userMsg.content).segments ?? [];
      const texts = segments.map((s: any) => s.text);
      expect(texts).toContain("Introduction");
    });
  });

  describe("Internal link preservation", () => {
    it("should preserve internal link paths in the output", async () => {
      const inputContent = `Check the [introduction guide](/ja/introduction/quick-start) for details.

Also see [this page](./relative-path/guide.md).`;

      // With AST approach, link text is translated but URLs are preserved natively
      const provider = createJsonMockProvider({
        "introduction guide": "紹介ガイド",
        "this page": "このページ",
        "Check the ": "詳細については",
        " for details.": "を確認してください。",
        "Also see ": "また、",
        ".": "。",
      });

      const inputPath = join(tempDir, "test.md");
      const outputPath = join(tempDir, "test.ja.md");

      writeFileSync(inputPath, inputContent, "utf-8");

      await translateFile({
        provider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const output = readFileSync(outputPath, "utf-8");

      // Link paths must be preserved (AST keeps url property unchanged)
      expect(output).toContain("/ja/introduction/quick-start");
      expect(output).toContain("./relative-path/guide.md");
    });
  });

  describe("External URL preservation", () => {
    it("should preserve external URLs exactly without language conversion", async () => {
      const inputContent = `Visit [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) for the Japanese version.

Also check [MDN](https://developer.mozilla.org/ja/docs/Web/) for Japanese docs.`;

      const provider = createJsonMockProvider({
        "Keep a Changelog": "Keep a Changelog",
        MDN: "MDN",
        "Visit ": "日本語版については、",
        " for the Japanese version.": "を参照してください。",
        "Also check ": "また、",
        " for Japanese docs.": "を確認してください。",
      });

      const inputPath = join(tempDir, "test.md");
      const outputPath = join(tempDir, "test.ja.md");

      writeFileSync(inputPath, inputContent, "utf-8");

      await translateFile({
        provider,
        inputPath,
        outputPath,
        targetLang: "en",
      });

      const output = readFileSync(outputPath, "utf-8");

      // URLs must be preserved exactly (no /ja/ -> /en/ conversion)
      expect(output).toContain("https://keepachangelog.com/ja/1.1.0/");
      expect(output).toContain("https://developer.mozilla.org/ja/docs/Web/");
    });
  });

  describe("Combined: frontmatter + links", () => {
    it("should preserve both frontmatter and links in the same document", async () => {
      const inputContent = `---
title: Introduction
url: /ja/intro
---

# Introduction

See [quick start](/ja/quick-start) and visit [our site](https://example.com/ja/).`;

      const provider = createJsonMockProvider({
        Introduction: "はじめに",
        "quick start": "クイックスタート",
        "our site": "当サイト",
        "See ": "を参照し、",
        " and visit ": "をご覧ください。",
        ".": "。",
      });

      const inputPath = join(tempDir, "test.md");
      const outputPath = join(tempDir, "test.ja.md");

      writeFileSync(inputPath, inputContent, "utf-8");

      await translateFile({
        provider,
        inputPath,
        outputPath,
        targetLang: "ja",
      });

      const output = readFileSync(outputPath, "utf-8");

      // Frontmatter preserved
      expect(output).toContain("title: Introduction");
      expect(output).toContain("url: /ja/intro");

      // Links preserved
      expect(output).toContain("/ja/quick-start");
      expect(output).toContain("https://example.com/ja/");
    });
  });
});
