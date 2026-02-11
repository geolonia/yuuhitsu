import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
} from "./interface.js";

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(model: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is not set. " +
          "Get your API key at https://console.anthropic.com/settings/keys"
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const userMessages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: request.model || this.model,
      max_tokens: request.maxTokens ?? 4096,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: userMessages,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return {
      content: textBlock?.text ?? "",
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason ?? "unknown",
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const userMessages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const stream = this.client.messages.stream({
      model: request.model || this.model,
      max_tokens: request.maxTokens ?? 4096,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: userMessages,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { content: event.delta.text, done: false };
      }
    }
    yield { content: "", done: true };
  }
}
