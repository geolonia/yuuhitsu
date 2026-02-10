# Research: AI Provider Abstraction Layer

**Feature Branch**: `001-ai-provider` | **Date**: 2026-02-11

## Decision 1: Cloud API Gateway

**Decision**: Use OpenRouter as the sole cloud AI gateway.

**Rationale**: OpenRouter provides an OpenAI-compatible API (`https://openrouter.ai/api/v1/chat/completions`) that supports all major models (Claude, GPT, Gemini, Mistral, Llama, etc.) through a single endpoint. This eliminates the need for individual provider adapters, reducing implementation complexity from 3+ adapters to 1.

**Alternatives considered**:
- Individual provider SDKs (Anthropic, Google, OpenAI) — rejected: too many adapters to build/maintain, each with different auth, rate-limit, and response formats.
- LiteLLM / other proxy libraries — rejected: adds a runtime dependency; OpenRouter is a hosted service requiring no local proxy.

## Decision 2: Local Model Execution

**Decision**: Use Ollama for local/offline model execution.

**Rationale**: Ollama provides an OpenAI-compatible API at `http://localhost:11434/v1/chat/completions`, making it trivially swappable with OpenRouter at the HTTP client level. Supports privacy-sensitive and offline use cases.

**Alternatives considered**:
- llama.cpp direct integration — rejected: requires managing model files and C++ bindings.
- LM Studio — rejected: less CLI-friendly, not as widely adopted for automation.

## Decision 3: API Client Architecture

**Decision**: Use a single OpenAI-compatible HTTP client with configurable base URL and auth.

**Rationale**: Both OpenRouter and Ollama implement the OpenAI Chat Completions API format. The provider abstraction reduces to:

| Provider   | Base URL                              | Auth Header                          | Model Format                          |
|-----------|---------------------------------------|--------------------------------------|---------------------------------------|
| OpenRouter | `https://openrouter.ai/api/v1`       | `Authorization: Bearer $OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4-5-20250929` |
| Ollama     | `http://localhost:11434/v1`           | None                                 | `llama3.2`                            |

This means the "provider adapter" is just a config object (base URL + auth + headers), not a class hierarchy.

## Decision 4: Language and Runtime

**Decision**: TypeScript on Node.js.

**Rationale**: Spec requires npm global install (`npm install -g ai-provider`). TypeScript provides type safety for the config/provider interfaces. Node.js has mature HTTP client and CLI libraries.

**Key dependencies**:
- `commander` — CLI argument parsing (mature, well-documented)
- `openai` (npm package) — OpenAI-compatible SDK works with both OpenRouter and Ollama
- `yaml` — Config file parsing
- `dotenv` — .env file support
- `vitest` — Testing framework (fast, TypeScript-native)

## Decision 5: Streaming

**Decision**: Use Server-Sent Events (SSE) via the OpenAI SDK's built-in streaming.

**Rationale**: OpenRouter supports `"stream": true` returning SSE. The `openai` npm package handles SSE parsing automatically. Ollama also supports the same streaming format.

## Decision 6: Special Headers

**Decision**: Include `HTTP-Referer` and `X-Title` headers for OpenRouter requests.

**Rationale**: OpenRouter recommends these for app identification and discovery. They can be set from the config file.

## Decision 7: Rate Limiting Strategy

**Decision**: Exponential backoff with max 3 retries, starting at 1 second.

**Rationale**: Matches spec FR-006. OpenRouter returns standard `429` status codes with `X-RateLimit-Reset` headers. The `openai` SDK has built-in retry support that can be configured.
