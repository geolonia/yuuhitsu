import { GoogleGenAI } from "@google/genai";
import type {
  AIProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
} from "./interface.js";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(model: string) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GOOGLE_API_KEY environment variable is not set. " +
          "Get your API key at https://aistudio.google.com/apikey"
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const userMessages = request.messages.filter((m) => m.role !== "system");

    // Build contents for Gemini
    const contents = userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await this.client.models.generateContent({
      model: request.model || this.model,
      contents,
      ...(systemMessage
        ? { config: { systemInstruction: systemMessage.content } }
        : {}),
      ...(request.temperature !== undefined
        ? { config: { temperature: request.temperature } }
        : {}),
      ...(request.maxTokens
        ? { config: { maxOutputTokens: request.maxTokens } }
        : {}),
    });

    const text = response.text ?? "";
    const usage = response.usageMetadata;

    return {
      content: text,
      model: request.model || this.model,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      finishReason: response.candidates?.[0]?.finishReason ?? "unknown",
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const systemMessage = request.messages.find((m) => m.role === "system");
    const userMessages = request.messages.filter((m) => m.role !== "system");

    const contents = userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await this.client.models.generateContentStream({
      model: request.model || this.model,
      contents,
      ...(systemMessage
        ? { config: { systemInstruction: systemMessage.content } }
        : {}),
      ...(request.temperature !== undefined
        ? { config: { temperature: request.temperature } }
        : {}),
      ...(request.maxTokens
        ? { config: { maxOutputTokens: request.maxTokens } }
        : {}),
    });

    for await (const chunk of response) {
      const text = chunk.text ?? "";
      if (text) {
        yield { content: text, done: false };
      }
    }
    yield { content: "", done: true };
  }
}
