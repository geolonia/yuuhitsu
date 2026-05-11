import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  StructuredTranslateRequest,
  StructuredTranslateResponse,
} from "./interface.js";

const TRANSLATION_TOOL_NAME = "record_translations";

const DEBUG_RAW_STRUCTURED_LOG =
  process.env.YUUHITSU_DEBUG_RAW_STRUCTURED === "1";
const MAX_DEBUG_LOG_CHARS = 4000;

function safeDebugPayload(value: unknown): string {
  const raw = JSON.stringify(value);
  return raw.length > MAX_DEBUG_LOG_CHARS
    ? raw.slice(0, MAX_DEBUG_LOG_CHARS) + "...[truncated]"
    : raw;
}

const TRANSLATION_TOOL: Anthropic.Tool = {
  name: TRANSLATION_TOOL_NAME,
  description: "Record the translated text segments in structured JSON format",
  input_schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer", description: "Segment ID (must match input ID exactly)" },
            text: { type: "string", description: "Translated text for this segment" },
          },
          required: ["id", "text"],
        },
        description: "Translated segments — one entry per input segment, ID must match",
      },
    },
    required: ["translations"],
  },
};

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(model: string) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
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
      max_tokens: request.maxTokens ?? 16384,
      temperature: request.temperature ?? 0,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: userMessages,
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
      max_tokens: request.maxTokens ?? 16384,
      temperature: request.temperature ?? 0,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: userMessages,
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

  /**
   * Translate segments using Anthropic tool_use (structured output).
   * Forces Claude to return a JSON object matching the translation schema —
   * no prose wrapping, no schema deviations.
   */
  async translateStructured(
    request: StructuredTranslateRequest
  ): Promise<StructuredTranslateResponse> {
    const response = await this.client.messages.create({
      model: request.model || this.model,
      max_tokens: request.maxTokens ?? 16384,
      temperature: 0,
      system: request.systemPrompt,
      messages: [
        {
          role: "user",
          content: JSON.stringify({ segments: request.segments }),
        },
      ],
      tools: [TRANSLATION_TOOL],
      tool_choice: { type: "tool", name: TRANSLATION_TOOL_NAME },
    });

    const toolUseBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUseBlock) {
      if (DEBUG_RAW_STRUCTURED_LOG) {
        console.error(
          `[yuuhitsu] ClaudeProvider.translateStructured: no tool_use block in response` +
            ` (stop_reason: ${response.stop_reason})` +
            ` raw response content: ${safeDebugPayload(response.content)}`
        );
      }
      throw new Error(
        `[yuuhitsu] ClaudeProvider.translateStructured: no tool_use block in response` +
          ` (stop_reason: ${response.stop_reason})`
      );
    }

    const input = toolUseBlock.input as {
      translations?: Array<{ id: number; text: string }>;
    };
    if (!Array.isArray(input.translations)) {
      if (DEBUG_RAW_STRUCTURED_LOG) {
        console.error(
          `[yuuhitsu] ClaudeProvider.translateStructured: translations field is missing or not an array.` +
            ` raw tool_use input: ${safeDebugPayload(input)}`
        );
      }
      throw new Error(
        `[yuuhitsu] ClaudeProvider.translateStructured: translations field is missing or not an array`
      );
    }

    return {
      translations: input.translations,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
