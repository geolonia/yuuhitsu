# yuuhitsu (右筆)

AI-powered document operations CLI

## Overview

**yuuhitsu** (右筆, meaning "secretary" or "scribe" in feudal Japan) is a command-line tool that automates document operations using AI. The name refers to scribes who served feudal lords, writing and managing official documents on their behalf — this tool serves engineers in the same way, handling translation, documentation generation, and document synchronization.

### Key Capabilities

- **Markdown Translation**: Translate documents while preserving structure, code blocks, and formatting
- **Multi-Provider Support**: Switch between Claude (Anthropic), Gemini (Google), and Ollama (local) with a single config line change
- **Streaming Output**: See translation progress in real-time
- **Dry-Run Mode**: Preview operations without making API calls
- **Prompt Templates**: Customize AI behavior with configurable templates

## Features

### Translation (Available Now)

- Translate Markdown documents between languages
- Preserve document structure (headings, links, code blocks, tables)
- Support for large files with automatic chunking
- Real-time streaming output
- Retry logic with exponential backoff for API failures

### Coming Soon

- **generate-docs**: Generate documentation from source code or specifications
- **sync-docs**: Convert external Markdown to VitePress-compatible format
- **research**: Perform web research and generate structured reports
- **fix-links**: Detect and fix dead links in documentation
- **generate-tests**: Generate test scaffolding from source code

## Quick Start

### Installation

```bash
npm install -g yuuhitsu
```

### Basic Usage

```bash
# Translate a document to Japanese
yuuhitsu translate --input README.md --lang ja

# Translate to English
yuuhitsu translate --input docs.md --lang en --output docs.en.md

# Preview without API calls
yuuhitsu translate --input README.md --lang ja --dry-run

# Use a specific config file
yuuhitsu translate --input README.md --lang ja --config ./custom.config.yaml
```

## Configuration

Create a `yuuhitsu.config.yaml` file in your project root:

```yaml
# AI Provider Selection
provider: claude  # Options: claude, gemini, ollama
model: claude-sonnet-4-5-20250929

# Optional Settings
outputDir: ./translated
templates: ./templates
log:
  enabled: true
  path: ./yuuhitsu.log
```

### Environment Variables

Create a `.env` file or set environment variables for API authentication:

```bash
# For Claude (Anthropic)
ANTHROPIC_API_KEY=your_api_key_here

# For Gemini (Google)
GOOGLE_API_KEY=your_api_key_here

# Ollama requires no API key (runs locally)
```

### Supported Providers

| Provider | SDK | Environment Variable | Use Case |
|----------|-----|---------------------|----------|
| Claude | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | High-quality translation, research tasks |
| Gemini | `@google/genai` | `GOOGLE_API_KEY` | Fast processing, cost-effective |
| Ollama | `openai` (compatible) | *(none)* | Local execution, privacy, offline use |

## Commands

### `translate`

Translate Markdown documents between languages.

**Options:**

- `--input <path>` (required): Input Markdown file path
- `--output <path>`: Output file path (defaults to input file with `.{lang}.md` suffix)
- `--lang <code>` (required): Target language code (e.g., `en`, `ja`, `zh`, `es`)
- `--provider <name>`: Override config provider (claude, gemini, ollama)
- `--model <name>`: Override config model
- `--dry-run`: Show what would be done without making API calls
- `--stream`: Enable streaming output (default: true)
- `--config <path>`: Config file path (default: `./yuuhitsu.config.yaml`)
- `--verbose`: Enable verbose output

**Example:**

```bash
yuuhitsu translate \
  --input ./docs/guide.md \
  --output ./docs/guide.ja.md \
  --lang ja \
  --provider claude \
  --model claude-sonnet-4-5-20250929
```

## Development

```bash
# Clone the repository
git clone https://github.com/geolonia/yuuhitsu.git
cd yuuhitsu

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Run locally (development)
npm run dev -- translate --input test.md --lang ja
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Type checking
npm run lint
```

## License

MIT — See [LICENSE](./LICENSE)

Copyright (c) 2026 Geolonia Inc.
