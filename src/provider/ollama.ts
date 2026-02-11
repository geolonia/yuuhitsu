import OpenAI from "openai";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
} from "./interface.js";

export class OllamaProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(model: string, baseUrl?: string) {
    this.client = new OpenAI({
      baseURL: baseUrl ?? "http://localhost:11434/v1",
      apiKey: "ollama", // Ollama doesn't need a real key but the SDK requires one
    });
    this.model = model;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model: request.model || this.model,
      messages,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
    });

    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? "",
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? "unknown",
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const stream = await this.client.chat.completions.create({
      model: request.model || this.model,
      messages,
      stream: true,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? "";
      if (content) {
        yield { content, done: false };
      }
    }
    yield { content: "", done: true };
  }
}
