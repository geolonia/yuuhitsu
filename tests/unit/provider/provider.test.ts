import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProvider } from "../../../src/provider/index.js";
import type { AIProvider } from "../../../src/provider/interface.js";

describe("Provider Factory", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should create a Claude provider when provider is 'claude'", () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    const provider = createProvider("claude", "claude-sonnet-4-5-20250929");
    expect(provider).toBeDefined();
    expect(provider.chat).toBeTypeOf("function");
    expect(provider.chatStream).toBeTypeOf("function");
  });

  it("should create a Gemini provider when provider is 'gemini'", () => {
    process.env.GOOGLE_API_KEY = "test-google-key";
    const provider = createProvider("gemini", "gemini-2.0-flash");
    expect(provider).toBeDefined();
    expect(provider.chat).toBeTypeOf("function");
    expect(provider.chatStream).toBeTypeOf("function");
  });

  it("should create an Ollama provider when provider is 'ollama'", () => {
    const provider = createProvider("ollama", "llama3.2");
    expect(provider).toBeDefined();
    expect(provider.chat).toBeTypeOf("function");
    expect(provider.chatStream).toBeTypeOf("function");
  });

  it("should throw error for unsupported provider", () => {
    expect(() => createProvider("openrouter" as any, "model")).toThrow(
      /unsupported provider/i
    );
  });

  it("should throw error when ANTHROPIC_API_KEY is missing for claude", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createProvider("claude", "claude-sonnet-4-5-20250929")).toThrow(
      /ANTHROPIC_API_KEY/i
    );
  });

  it("should throw error when GOOGLE_API_KEY is missing for gemini", () => {
    delete process.env.GOOGLE_API_KEY;
    expect(() => createProvider("gemini", "gemini-2.0-flash")).toThrow(
      /GOOGLE_API_KEY/i
    );
  });

  it("should NOT require API key for ollama", () => {
    // Ollama is local — no API key needed
    expect(() => createProvider("ollama", "llama3.2")).not.toThrow();
  });
});

describe("Claude Adapter", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("should implement AIProvider interface", () => {
    const provider = createProvider("claude", "claude-sonnet-4-5-20250929");
    expect(provider).toHaveProperty("chat");
    expect(provider).toHaveProperty("chatStream");
  });
});

describe("Gemini Adapter", () => {
  beforeEach(() => {
    process.env.GOOGLE_API_KEY = "test-google-key";
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
  });

  it("should implement AIProvider interface", () => {
    const provider = createProvider("gemini", "gemini-2.0-flash");
    expect(provider).toHaveProperty("chat");
    expect(provider).toHaveProperty("chatStream");
  });
});

describe("Ollama Adapter", () => {
  it("should implement AIProvider interface", () => {
    const provider = createProvider("ollama", "llama3.2");
    expect(provider).toHaveProperty("chat");
    expect(provider).toHaveProperty("chatStream");
  });
});
