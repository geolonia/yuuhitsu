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

  it("should expose translateStructured method (structured output support)", () => {
    const provider = createProvider("claude", "claude-sonnet-4-5-20250929");
    expect(provider).toHaveProperty("translateStructured");
    expect(provider.translateStructured).toBeTypeOf("function");
  });
});

describe("Claude translateStructured — unit (mocked Anthropic SDK)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("should call messages.create with tools and tool_choice forced to record_translations", async () => {
    const { ClaudeProvider } = await import("../../../src/provider/claude.js");
    const provider = new ClaudeProvider("claude-sonnet-4-6");

    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "record_translations",
          input: {
            translations: [
              { id: 0, text: "こんにちは" },
              { id: 1, text: "世界" },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    // Spy on the internal client
    (provider as any).client = { messages: { create: mockCreate } };

    const result = await provider.translateStructured({
      segments: [
        { id: 0, text: "Hello" },
        { id: 1, text: "World" },
      ],
      systemPrompt: "Translate to Japanese.",
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools[0].name).toBe("record_translations");
    expect(callArgs.tool_choice).toEqual({ type: "tool", name: "record_translations" });
    expect(result.translations).toHaveLength(2);
    expect(result.translations[0]).toEqual({ id: 0, text: "こんにちは" });
    expect(result.translations[1]).toEqual({ id: 1, text: "世界" });
    expect(result.usage.promptTokens).toBe(100);
    expect(result.usage.completionTokens).toBe(50);
  });

  it("should throw if no tool_use block is returned", async () => {
    const { ClaudeProvider } = await import("../../../src/provider/claude.js");
    const provider = new ClaudeProvider("claude-sonnet-4-6");

    (provider as any).client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "oops" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    };

    await expect(
      provider.translateStructured({
        segments: [{ id: 0, text: "Hello" }],
        systemPrompt: "Translate.",
      })
    ).rejects.toThrow(/no tool_use block/);
  });

  it("should throw if translations field is missing from tool input", async () => {
    const { ClaudeProvider } = await import("../../../src/provider/claude.js");
    const provider = new ClaudeProvider("claude-sonnet-4-6");

    (provider as any).client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "tool_use", name: "record_translations", input: {} }],
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    };

    await expect(
      provider.translateStructured({
        segments: [{ id: 0, text: "Hello" }],
        systemPrompt: "Translate.",
      })
    ).rejects.toThrow(/translations field is missing/);
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

  it("should NOT expose translateStructured (text mode fallback)", () => {
    const provider = createProvider("gemini", "gemini-2.0-flash");
    // Gemini uses text-mode JSON fallback — structured output not implemented
    expect(provider.translateStructured).toBeUndefined();
  });
});

describe("Ollama Adapter", () => {
  it("should implement AIProvider interface", () => {
    const provider = createProvider("ollama", "llama3.2");
    expect(provider).toHaveProperty("chat");
    expect(provider).toHaveProperty("chatStream");
  });

  it("should NOT expose translateStructured (text mode fallback)", () => {
    const provider = createProvider("ollama", "llama3.2");
    // Ollama uses text-mode JSON fallback — structured output not implemented
    expect(provider.translateStructured).toBeUndefined();
  });
});
