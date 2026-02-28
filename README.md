# yuuhitsu (右筆)

AI-powered document operations CLI

## Overview

**yuuhitsu** (右筆, meaning "secretary" or "scribe" in feudal Japan) is a command-line tool that automates document operations using AI. The name refers to scribes who served feudal lords, writing and managing official documents on their behalf — this tool serves engineers in the same way, handling translation, documentation generation, and document synchronization.

### Key Capabilities

- **Markdown Translation**: Translate documents while preserving structure, code blocks, and formatting
- **Glossary Management**: Maintain consistent terminology across all translations with a project-level glossary
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
- Automatic glossary lookup during translation (when `glossary` is configured)

### Glossary Management (Available Now)

Maintain a project-level glossary to enforce consistent terminology across all translations.

- **`glossary init`**: Generate a `glossary.yaml` skeleton with example terms
- **`glossary check`**: Detect forbidden or inconsistent terms in a document
- **`glossary sync`**: Report translation coverage across all configured languages and create stubs for missing entries
- **`glossary review`**: Generate a Markdown report of all glossary terms and their translations

When a `glossary` path is set in `yuuhitsu.config.yaml`, the `translate` command automatically injects the glossary into the AI prompt, ensuring canonical terms are used and forbidden variants are avoided.

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
glossary: ./glossary.yaml  # Path to glossary file (enables auto-injection during translation)
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

### `glossary`

Manage the project glossary for terminology consistency.

#### `glossary init`

Generate a `glossary.yaml` skeleton in the current directory.

**Options:**

- `--output <path>`: Output path for the glossary file (default: `glossary.yaml`)
- `--force`: Overwrite an existing glossary file

**Example:**

```bash
yuuhitsu glossary init
yuuhitsu glossary init --output ./docs/glossary.yaml
```

#### `glossary check`

Detect forbidden or inconsistent terminology in a document.

**Options:**

- `--input <file>` (required): Document file to check
- `--glossary <path>` (required): Glossary file path
- `--lang <code>` (required): Language code to check (e.g., `ja`, `en`)

**Example:**

```bash
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja
```

#### `glossary sync`

Report translation coverage and create stubs for missing entries.

**Options:**

- `--glossary <path>` (required): Glossary file path

**Example:**

```bash
yuuhitsu glossary sync --glossary glossary.yaml
```

#### `glossary review`

Generate a Markdown report of all glossary terms and their translations.

**Options:**

- `--glossary <path>` (required): Glossary file path
- `--output <path>`: Save the report to a file (Markdown)

**Example:**

```bash
yuuhitsu glossary review --glossary glossary.yaml
yuuhitsu glossary review --glossary glossary.yaml --output glossary-report.md
```

### Glossary File Format

The `glossary.yaml` file defines canonical terms, their translations, and forbidden variants:

```yaml
version: 1
languages: [ja, en]
terms:
  - canonical: "API"
    type: noun
    translations:
      ja: "API"
      en: "API"
    do_not_use:
      ja: ["ＡＰＩ", "えーぴーあい"]
  - canonical: "webhook"
    type: noun
    translations:
      ja: "Webhook"
      en: "webhook"
    do_not_use:
      ja: ["ウェブフック"]
      en: ["web hook"]
```

| Field | Description |
|-------|-------------|
| `version` | Schema version (currently `1`) |
| `languages` | List of language codes managed by this glossary |
| `terms[].canonical` | The authoritative (source-language) term |
| `terms[].type` | Term type (e.g., `noun`, `verb`) |
| `terms[].translations` | Map of language code → translated term |
| `terms[].do_not_use` | Map of language code → list of forbidden variants |

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
