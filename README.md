# yuuhitsu (右筆)

AI-powered document operations CLI

## Overview

**yuuhitsu** (右筆, meaning "secretary" or "scribe" in feudal Japan) is a command-line tool that automates document operations using AI. The name refers to scribes who served feudal lords, writing and managing official documents on their behalf — this tool serves engineers in the same way, handling translation, documentation generation, and document synchronization.

### Key Capabilities

- **Markdown Translation**: Translate documents while preserving structure, code blocks, and formatting
- **Glossary Management**: Maintain consistent terminology across all translations with a project-level glossary
- **Multi-Provider Support**: Switch between Claude (Anthropic), Gemini (Google), and Ollama (local) with a single config line change
- **Local Quality Control**: Automated pre-publish QC with syntax, semantic, and LLM-judge checks
- **Dry-Run Mode**: Preview operations without making API calls

## Features

### Translation

yuuhitsu translates Markdown documents at the paragraph level using an AST (remark) pipeline:

1. **Parse** — remark parses the Markdown into an mdast AST
2. **Extract** — `extractBlockNodes()` collects whole paragraph and heading nodes as markdown units, preserving inline elements (code spans, bold, italic, links) within each block
3. **Batch** — nodes are grouped into API batches by estimated token count (`--max-tokens-per-batch`, default: 4000 chars ÷ 4)
4. **Translate** — Claude's structured output (tool_use) returns a guaranteed 1:1 ID-mapped JSON response; Gemini and Ollama use text-mode JSON
5. **Apply** — translated text is re-parsed through remark and written back into the AST; the full document is then serialized

**Why paragraph-level chunks?**

Earlier releases (0.1.x) split text at inline-element boundaries — for example, splitting `"When \`AUTH_ENABLED=true\`, a token is required."` into `"When "` and `", a token is required."`. The LLM had no context for each fragment, causing EN/JA mixing, duplicate phrases, and semantic inversions. Paragraph-level chunking (0.3.0) eliminates this class of error.

**What is preserved (never sent to LLM):**

- Fenced code blocks (`` ``` ``...`` ``` ``): preserved as-is via AST
- Inline code (`` `...` ``): preserved within each paragraph block
- Document structure (headings, lists, tables, HR, links): handled deterministically by the AST round-trip

### Glossary Management

Maintain a project-level glossary to enforce consistent terminology across all translations.

- **`glossary init`**: Generate a `glossary.yaml` skeleton with example terms
- **`glossary check`**: Detect forbidden or inconsistent terms in a document — supports Markdown (`.md`) and JSON i18n files (`.json`); violations are reported with line numbers or key paths
- **`glossary fix`**: Auto-replace `severity: auto-fix` terms in a document
- **`glossary sync`**: Report translation coverage across all configured languages and create stubs for missing entries
- **`glossary review`**: Generate a Markdown report of all glossary terms and their translations

When a `glossary` path is set in `yuuhitsu.config.yaml`, the `translate` command automatically injects the glossary into the AI prompt, ensuring canonical terms are used and forbidden variants are avoided.

**Severity levels** (set per-term in `glossary.yaml`):

| Level | Behaviour |
|-------|-----------|
| `block` | Hard error — CI fails |
| `warn` | Warning — CI passes, human review required |
| `auto-fix` | Automatically replaced by `glossary fix` |

### Local Quality Control

yuuhitsu ships a pre-publish QC script (`scripts/local-qc.ts`) that runs against a real translated fixture repository before every `npm publish`. This catches both syntax regressions and semantic quality drops that unit tests cannot detect.

**Syntax checks:**

| Check | Description |
|-------|-------------|
| bare-fence | Fenced code blocks without a language tag |
| five-axis | EN/JA mix, duplicate phrase, heading integrity, anchor validity across fixture files |
| markdownlint | Common Markdown lint rules |
| vitepress-build | VitePress build succeeds on the fixture repo |

**Semantic checks:**

| Check | Description |
|-------|-------------|
| en-ja-mix | Paragraphs that mix English and Japanese unexpectedly |
| duplicate-phrase | Same phrase repeated twice within one paragraph |
| heading-integrity | Headings match between EN and JA versions |
| anchor-validity | Internal anchor links resolve correctly |

**LLM Judge:**

- Model: `claude-sonnet-4-6`
- Threshold: average score ≥ 4.0 per fixture, minimum per fixture ≥ 3.5 (scale 1–5)
- Covers all 7 default fixture files in `LOCAL_QC_FIXTURE_REPO`

**Configuration:**

```bash
# Point to your translated fixture repository
export LOCAL_QC_FIXTURE_REPO=/home/user/workspace/my-docs  # default: /home/hal/workspace/geonicdb-docs

# Run QC manually
npm run local-qc

# QC runs automatically before publish
npm publish  # triggers prepublishOnly → local-qc.ts
```

The QC script also runs in GitHub Actions CI via `.github/workflows/local-qc.yml` on every pull request.

## Quick Start

### Installation

```bash
npm install -g @geolonia/yuuhitsu
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
model: claude-sonnet-4-6

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
# For Claude (Anthropic) — recommended
ANTHROPIC_API_KEY=your_api_key_here

# For Gemini (Google)
GOOGLE_API_KEY=your_api_key_here

# Ollama requires no API key (runs locally)

# For Local QC
LOCAL_QC_FIXTURE_REPO=/path/to/your/translated-docs-repo
```

### Supported Providers

| Provider | SDK | Environment Variable | Use Case |
|----------|-----|---------------------|----------|
| Claude | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | High-quality translation, structured output |
| Gemini | `@google/genai` | `GOOGLE_API_KEY` | Fast processing, cost-effective |
| Ollama | `openai` (compatible) | *(none)* | Local execution, privacy, offline use |

## Commands

### `translate`

Translate Markdown documents between languages.

**Global options** (before subcommand):

- `--config <path>`: Config file path (default: `./yuuhitsu.config.yaml`)
- `--dry-run`: Show what would be done without making API calls
- `--verbose`: Enable verbose output

**Options:**

- `--input <path>` (required): Input Markdown file path or glob pattern (e.g., `docs/en/**/*.md`)
- `--output <path>`: Output file path (defaults to `<input>.<lang>.md`)
- `--output-dir <dir>`: Output directory for batch translation (preserves directory structure)
- `--lang <code>` (required): Target language code (e.g., `en`, `ja`, `zh`, `es`)
- `--max-tokens-per-batch <N>`: Maximum estimated tokens per API batch call (default: `4000`). Increase for large documents with few headings; decrease if you hit API context limits.
- `--max-chunk-lines <N>`: Maximum lines per translation chunk (legacy fallback; default: `150`). Used only when the AST path is bypassed.

**Single file example:**

```bash
yuuhitsu translate \
  --input ./docs/guide.md \
  --output ./docs/guide.ja.md \
  --lang ja \
  --max-tokens-per-batch 4000
```

**Batch translation example:**

```bash
yuuhitsu translate \
  --input "docs/en/**/*.md" \
  --output-dir docs/ja \
  --lang ja
```

### `glossary`

Manage the project glossary for terminology consistency.

#### `glossary init`

Generate a `glossary.yaml` skeleton in the current directory.

**Options:**

- `--output <path>`: Output path for the glossary file (default: `glossary.yaml`)
- `--force`: Overwrite an existing glossary file

```bash
yuuhitsu glossary init
yuuhitsu glossary init --output ./docs/glossary.yaml
```

#### `glossary check`

Detect forbidden or inconsistent terminology in a document.

Supports both Markdown (`.md`) and JSON i18n files (`.json`). When a `.json` file is provided, violations are reported as key paths (e.g., `dashboard.title`).

**What is skipped (not checked):**

- Fenced code blocks (`` ``` ``...`` ``` ``)
- Inline code (`` `...` ``)
- URLs (`http://` / `https://`)
- Frontmatter (`---`...`---`)
- URL path portions of Markdown links

**Options:**

- `--input <file>` (required): Document file to check (Markdown or JSON i18n file)
- `--glossary <path>` (required): Glossary file path
- `--lang <code>` (required): Language code to check (e.g., `ja`, `en`)
- `--severity-filter <levels>`: Comma-separated severity levels to report (e.g., `block,warn`). Default: all levels.
- `--format <format>`: Output format: `text`, `json`, `sarif` (default: `text`)

```bash
# Check a Markdown document
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja

# Check only block-level violations
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja --severity-filter block

# Output SARIF for GitHub Code Scanning
yuuhitsu glossary check --input README.md --glossary glossary.yaml --lang ja --format sarif

# Check a JSON i18n file
yuuhitsu glossary check --input locales/ja/common.json --glossary glossary.yaml --lang ja
```

#### `glossary fix`

Auto-replace `severity: auto-fix` terms in a document.

**Options:**

- `--input <file>` (required): Document file to fix
- `--glossary <path>` (required): Glossary file path
- `--lang <code>` (required): Language code
- `--dry-run`: Show what would be replaced without modifying the file

```bash
yuuhitsu glossary fix --input README.md --glossary glossary.yaml --lang ja
yuuhitsu glossary fix --input README.md --glossary glossary.yaml --lang ja --dry-run
```

#### `glossary sync`

Report translation coverage and create stubs for missing entries.

```bash
yuuhitsu glossary sync --glossary glossary.yaml
```

#### `glossary review`

Generate a Markdown report of all glossary terms and their translations.

```bash
yuuhitsu glossary review --glossary glossary.yaml
yuuhitsu glossary review --glossary glossary.yaml --output glossary-report.md
```

### Glossary File Format

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
    severity: warn          # block | warn | auto-fix (default: block)
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
| `terms[].severity` | `block` (default), `warn`, or `auto-fix` |
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
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Integration tests (requires ANTHROPIC_API_KEY)
npm run test:integration

# Type checking
npm run lint

# Local QC (requires LOCAL_QC_FIXTURE_REPO)
npm run local-qc
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

**0.3.0 highlights:**

- Paragraph-level chunk redesign (`extractBlockNodes`) — eliminates EN/JA mixing, duplicate phrases, and semantic inversions caused by inline-element splitting
- Token-count-based batching (`--max-tokens-per-batch`, default: 4000) — replaces line-count-based `--max-nodes-per-batch`
- Local QC (`scripts/local-qc.ts`) — prepublishOnly hook + GitHub Actions CI with LLM-judge (`claude-sonnet-4-6`, avg ≥ 4.0)

## License

MIT — See [LICENSE](./LICENSE)

Copyright (c) 2026 Geolonia Inc.
