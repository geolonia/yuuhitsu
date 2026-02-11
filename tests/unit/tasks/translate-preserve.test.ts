import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translateFile } from "../../../src/tasks/translate.js";
import type { AIProvider, ChatCompletionResponse } from "../../../src/provider/interface.js";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Translation preservation (frontmatter & links)", () => {
  let mockProvider: AIProvider;
  let tempDir: string;
  let mockChat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `yuuhitsu-preserve-test-${Date.now()}`);
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

  describe("Frontmatter preservation", () => {
    it("should preserve frontmatter exactly as-is during translation", async () => {
      const inputContent = `---
title: 変更履歴
description: リリースノート
layout: default
---

# Changelog

This is the changelog.`;

      const translatedBody = `# 変更履歴

これは変更履歴です。`;

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

      // Frontmatter should be preserved exactly
      expect(output).toContain("---\ntitle: 変更履歴\ndescription: リリースノート\nlayout: default\n---");

      // Body should be translated
      expect(output).toContain("# 変更履歴");
      expect(output).toContain("これは変更履歴です。");

      // LLM should NOT receive frontmatter
      const callArg = mockChat.mock.calls[0][0];
      const userMessage = callArg.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).not.toContain("title: 変更履歴");
      expect(userMessage.content).toContain("# Changelog");
    });

    it("should handle files without frontmatter normally", async () => {
      const inputContent = `# Introduction

This is a document without frontmatter.`;

      const translatedContent = `# はじめに

これはfrontmatterのないドキュメントです。`;

      mockChat.mockResolvedValue({
        content: translatedContent,
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

      expect(output).toBe(translatedContent);

      // LLM should receive full content
      const callArg = mockChat.mock.calls[0][0];
      const userMessage = callArg.messages.find((m: any) => m.role === "user");
      expect(userMessage.content).toContain("# Introduction");
    });
  });

  describe("Internal link preservation", () => {
    it("should preserve internal link paths and only translate link text", async () => {
      const inputContent = `Check the [introduction guide](/ja/introduction/quick-start) for details.

Also see [this page](./relative-path/guide.md).`;

      const translatedContent = `詳細については[紹介ガイド](/ja/introduction/quick-start)を確認してください。

また、[このページ](./relative-path/guide.md)も参照してください。`;

      mockChat.mockResolvedValue({
        content: translatedContent,
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

      // Link paths must be preserved exactly
      expect(output).toContain("/ja/introduction/quick-start");
      expect(output).toContain("./relative-path/guide.md");

      // Link text should be translated
      expect(output).toContain("紹介ガイド");
      expect(output).toContain("このページ");
    });
  });

  describe("External URL preservation", () => {
    it("should preserve external URLs exactly without language conversion", async () => {
      const inputContent = `Visit [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) for the Japanese version.

Also check [MDN](https://developer.mozilla.org/ja/docs/Web/) for Japanese docs.`;

      const translatedContent = `日本語版については、[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)を参照してください。

また、日本語ドキュメントは[MDN](https://developer.mozilla.org/ja/docs/Web/)を確認してください。`;

      mockChat.mockResolvedValue({
        content: translatedContent,
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

      // URLs must be preserved exactly (no /ja/ -> /en/ conversion)
      expect(output).toContain("https://keepachangelog.com/ja/1.1.0/");
      expect(output).toContain("https://developer.mozilla.org/ja/docs/Web/");

      // Link text should be translated
      expect(output).toContain("日本語版については");
      expect(output).toContain("日本語ドキュメント");
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

      const translatedBody = `# はじめに

[クイックスタート](/ja/quick-start)を参照し、[当サイト](https://example.com/ja/)をご覧ください。`;

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

      // Frontmatter preserved
      expect(output).toContain("title: Introduction");
      expect(output).toContain("url: /ja/intro");

      // Links preserved
      expect(output).toContain("/ja/quick-start");
      expect(output).toContain("https://example.com/ja/");

      // Text translated
      expect(output).toContain("はじめに");
      expect(output).toContain("クイックスタート");
    });
  });
});
