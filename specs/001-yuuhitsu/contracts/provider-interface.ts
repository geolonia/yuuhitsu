/**
 * Provider Interface Contracts
 *
 * These TypeScript interfaces define the contracts between components.
 * They serve as the source of truth for implementation.
 */

// === Provider Abstraction ===

export interface ProviderConfig {
  name: "openrouter" | "ollama";
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

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

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(
    request: ChatRequest
  ): AsyncIterable<StreamChunk>;
}

// === Configuration ===

export interface AppConfig {
  provider: "openrouter" | "ollama";
  model: string;
  ollamaBaseUrl?: string;
  templates?: string;
  outputDir?: string;
  referer?: string;
  appTitle?: string;
  log?: {
    enabled?: boolean;
    path?: string;
  };
}

// === Task Types ===

export type TaskType =
  | "translate"
  | "generate-docs"
  | "sync-docs"
  | "research"
  | "fix-links"
  | "generate-tests";

export interface TaskInput {
  type: TaskType;
  inputFiles: string[];
  outputPath?: string;
  options: Record<string, string>;
}

// === Execution Logging ===

export interface ExecutionLogEntry {
  timestamp: string;
  provider: string;
  model: string;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}
