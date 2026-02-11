# Data Model: AI Provider Abstraction Layer

**Feature Branch**: `001-yuuhitsu` | **Date**: 2026-02-11

## Entities

### ProviderConfig

Represents the connection settings for an AI backend.

| Field       | Type     | Required | Description                                      |
|------------|----------|----------|--------------------------------------------------|
| name       | string   | Yes      | `"openrouter"` or `"ollama"`                     |
| baseUrl    | string   | Yes      | API base URL                                     |
| apiKeyEnv  | string   | No       | Environment variable name for API key (e.g., `OPENROUTER_API_KEY`) |
| headers    | Record   | No       | Additional headers (e.g., `HTTP-Referer`, `X-Title`) |

**Validation**: `name` must be one of `["openrouter", "ollama"]`. If `name` is `"openrouter"`, `apiKeyEnv` defaults to `"OPENROUTER_API_KEY"`.

### AppConfig

Top-level configuration loaded from `yuuhitsu.config.yaml`.

| Field           | Type           | Required | Default                  | Description                             |
|----------------|----------------|----------|--------------------------|-----------------------------------------|
| provider       | string         | Yes      | —                        | `"openrouter"` or `"ollama"`            |
| model          | string         | Yes      | —                        | Model identifier (e.g., `anthropic/claude-sonnet-4-5-20250929`) |
| ollamaBaseUrl  | string         | No       | `http://localhost:11434` | Ollama server URL                       |
| templates      | string         | No       | `./templates`            | Path to prompt template directory       |
| outputDir      | string         | No       | `.`                      | Default output directory                |
| log            | LogConfig      | No       | —                        | Logging settings                        |
| referer        | string         | No       | —                        | HTTP-Referer header for OpenRouter      |
| appTitle       | string         | No       | `"yuuhitsu"`          | X-Title header for OpenRouter           |

### LogConfig

| Field    | Type    | Required | Default              | Description               |
|---------|---------|----------|----------------------|---------------------------|
| enabled | boolean | No       | `true`               | Enable/disable logging    |
| path    | string  | No       | `./yuuhitsu.log`  | Log file path             |

### Task

A unit of work requested by the user.

| Field          | Type     | Required | Description                                      |
|---------------|----------|----------|--------------------------------------------------|
| type          | TaskType | Yes      | One of: translate, generate-docs, sync-docs, research, fix-links, generate-tests |
| inputFiles    | string[] | Yes      | Input file paths                                 |
| outputPath    | string   | No       | Output file/directory path                       |
| options       | Record   | No       | Task-specific options (e.g., `lang`, `format`, `framework`) |

**TaskType enum**: `translate` | `generate-docs` | `sync-docs` | `research` | `fix-links` | `generate-tests`

### PromptTemplate

| Field       | Type   | Required | Description                        |
|------------|--------|----------|------------------------------------|
| taskType   | string | Yes      | Maps to a TaskType                 |
| system     | string | Yes      | System prompt template             |
| user       | string | Yes      | User prompt template with placeholders |

**Placeholders**: `{{content}}`, `{{language}}`, `{{format}}`, `{{framework}}`

### ExecutionLog

| Field        | Type    | Required | Description                           |
|-------------|---------|----------|---------------------------------------|
| timestamp   | string  | Yes      | ISO 8601 timestamp                    |
| provider    | string  | Yes      | `"openrouter"` or `"ollama"`          |
| model       | string  | Yes      | Model used                            |
| taskType    | string  | Yes      | Task type executed                    |
| inputTokens | number  | Yes      | Prompt tokens used                    |
| outputTokens| number  | Yes      | Completion tokens used                |
| latencyMs   | number  | Yes      | Request duration in milliseconds      |
| success     | boolean | Yes      | Whether the request succeeded         |
| error       | string  | No       | Error message if failed               |

## Relationships

```
AppConfig ──uses──▶ ProviderConfig (derived from provider + model fields)
Task ──uses──▶ PromptTemplate (matched by taskType)
Task ──produces──▶ ExecutionLog (one per API call, may be multiple for chunked input)
```

## Config File Example

```yaml
# yuuhitsu.config.yaml
provider: openrouter
model: anthropic/claude-sonnet-4-5-20250929

# Optional: Ollama server URL (only used when provider: ollama)
# ollamaBaseUrl: http://localhost:11434

# Optional: prompt template directory
# templates: ./templates

# Optional: OpenRouter app identification
# referer: https://my-project.example.com
# appTitle: my-project

# Optional: logging
log:
  enabled: true
  path: ./yuuhitsu.log
```
