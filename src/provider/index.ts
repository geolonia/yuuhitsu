import type { ProviderName } from "../config.js";
import type { AIProvider } from "./interface.js";
import { ClaudeProvider } from "./claude.js";
import { GeminiProvider } from "./gemini.js";
import { OllamaProvider } from "./ollama.js";

export function createProvider(
  provider: ProviderName,
  model: string
): AIProvider {
  switch (provider) {
    case "claude":
      return new ClaudeProvider(model);
    case "gemini":
      return new GeminiProvider(model);
    case "ollama":
      return new OllamaProvider(model);
    default:
      throw new Error(
        `Unsupported provider: "${provider}". Supported providers: claude, gemini, ollama`
      );
  }
}

export type { AIProvider } from "./interface.js";
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  StreamChunk,
} from "./interface.js";
