export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/** Request for structured output translation (tool_use path). */
export interface StructuredTranslateRequest {
  segments: Array<{ id: number; text: string }>;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
}

/** Response from structured output translation. */
export interface StructuredTranslateResponse {
  translations: Array<{ id: number; text: string }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  /**
   * Structured output translation via provider-native JSON schema enforcement.
   * Optional: implemented by Claude. Gemini and Ollama fall back to text mode.
   */
  translateStructured?(
    request: StructuredTranslateRequest
  ): Promise<StructuredTranslateResponse>;
}
