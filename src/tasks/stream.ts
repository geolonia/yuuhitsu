import type { AIProvider, ChatRequest, StreamChunk } from "../provider/interface.js";

export interface StreamOptions {
  onChunk?: (chunk: string) => void;
  onDone?: () => void;
}

export async function streamResponse(
  provider: AIProvider,
  request: ChatRequest,
  options?: StreamOptions
): Promise<string> {
  let fullContent = "";

  for await (const chunk of provider.chatStream(request)) {
    if (chunk.done) {
      options?.onDone?.();
      break;
    }
    fullContent += chunk.content;
    options?.onChunk?.(chunk.content);
  }

  return fullContent;
}
