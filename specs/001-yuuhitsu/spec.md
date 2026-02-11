# Feature Specification: AI Provider Abstraction Layer

**Feature Branch**: `001-yuuhitsu`
**Created**: 2026-02-11
**Status**: Draft
**Input**: External AI API abstraction layer enabling engineers to perform translation, document generation, document sync, research, dead-link fixing, and test scaffolding without requiring the Shogun multi-agent environment. Uses direct API integration with each provider — Claude (via @anthropic-ai/sdk), Gemini (via @google/genai), and Ollama (via OpenAI-compatible SDK for local execution). Provider switching is a 1-line config change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Translate a Document (Priority: P1)

As an engineer, I want to translate a Markdown document from one language to another using a CLI command, so that I can quickly produce localized documentation without manually operating an AI chat interface.

**Why this priority**: Translation is the most frequent task identified in the system. Delivering this first provides immediate, tangible value and validates the entire provider abstraction pipeline (config loading, API calls, prompt templating, output writing).

**Independent Test**: Can be fully tested by running a single CLI command with a sample Markdown file and verifying the translated output file is created with correct language content.

**Acceptance Scenarios**:

1. **Given** a Markdown file `README.md` in English and a config file specifying `provider: claude` with model `claude-sonnet-4-5-20250929`, **When** the user runs `yuuhitsu translate --input README.md --lang ja`, **Then** a translated Japanese Markdown file is produced preserving the original Markdown structure (headings, links, code blocks).
2. **Given** a Markdown file in Japanese, **When** the user runs `yuuhitsu translate --input docs.md --lang en`, **Then** an English translation is produced.
3. **Given** an invalid API key in the configuration, **When** the user runs the translate command, **Then** a clear error message is displayed indicating authentication failure, without exposing the API key.
4. **Given** a very large Markdown file (>50KB), **When** the user runs the translate command, **Then** the system shows streaming progress and completes successfully, splitting the content into manageable chunks if needed.

---

### User Story 2 - Generate Documentation from Source (Priority: P2)

As an engineer, I want to generate a documentation page from source code or a specification file, so that I can automate repetitive documentation writing tasks.

**Why this priority**: Documentation generation is the second most common task. It reuses the same provider pipeline built for US1, adding only a new prompt template.

**Independent Test**: Can be tested by pointing the tool at a source file and verifying a structured documentation Markdown file is generated.

**Acceptance Scenarios**:

1. **Given** a TypeScript source file, **When** the user runs `yuuhitsu generate-docs --input src/index.ts --format vitepress`, **Then** a VitePress-compatible Markdown documentation file is produced containing function descriptions, parameter tables, and usage examples.
2. **Given** a YAML specification file, **When** the user runs `yuuhitsu generate-docs --input api-spec.yaml`, **Then** a human-readable API documentation page is produced.

---

### User Story 3 - Switch AI Provider via Configuration (Priority: P2)

As an engineer, I want to switch between AI providers (Claude, Gemini, Ollama) by editing a configuration file, so that I can use whichever model best fits my needs or budget without changing my workflow.

**Why this priority**: Provider flexibility is a core architectural requirement. Each provider uses its official SDK for direct API access — Claude via @anthropic-ai/sdk, Gemini via @google/genai, Ollama via OpenAI-compatible SDK. A common adapter interface wraps each SDK, so switching providers is a 1-line config change. Adding a new provider requires only implementing one adapter file.

**Independent Test**: Can be tested by changing the provider and model in the config file and verifying the same translate command works with each supported configuration.

**Acceptance Scenarios**:

1. **Given** a config file specifying `provider: claude` with model `claude-sonnet-4-5-20250929`, **When** the user runs any yuuhitsu command, **Then** the request is sent directly to the Anthropic API via @anthropic-ai/sdk.
2. **Given** a config file specifying `provider: gemini` with model `gemini-2.0-flash`, **When** the user runs the same command, **Then** the request is sent directly to the Google Gemini API via @google/genai.
3. **Given** a config file set to `provider: ollama` with model `llama3.2`, **When** the user runs the same command with a local Ollama server running, **Then** the request is handled locally without any external API call.
4. **Given** a config file with an unsupported provider name, **When** the user runs any command, **Then** a clear error lists the supported providers (claude, gemini, ollama).

---

### User Story 4 - Synchronize External Markdown to VitePress (Priority: P3)

As an engineer, I want to convert external repository Markdown files into VitePress-compatible format, so that I can maintain a unified documentation site from multiple sources.

**Why this priority**: Document sync is a specialized variant of generation. It builds on US1/US2 infrastructure and adds file-system orchestration.

**Independent Test**: Can be tested by providing an external Markdown file and verifying the output matches VitePress sidebar/frontmatter conventions.

**Acceptance Scenarios**:

1. **Given** a Markdown file from an external repository, **When** the user runs `yuuhitsu sync-docs --input external/README.md --output docs/guide/external.md`, **Then** the file is converted to VitePress format with correct frontmatter and sidebar metadata.
2. **Given** a directory of Markdown files, **When** the user runs `yuuhitsu sync-docs --input external/ --output docs/guide/`, **Then** all files are batch-converted and a sidebar config snippet is generated.

---

### User Story 5 - Research a Topic (Priority: P3)

As an engineer, I want to perform web research on a technical topic and get a structured summary, so that I can quickly gather competitive analysis or technology evaluations.

**Why this priority**: Research requires web-search capabilities which may not be available on all providers. Scoping this as P3 allows the core pipeline to stabilize first.

**Independent Test**: Can be tested by running a research command and verifying a structured Markdown report is produced.

**Acceptance Scenarios**:

1. **Given** a research query, **When** the user runs `yuuhitsu research --query "Compare Vite vs Webpack in 2026" --output report.md`, **Then** a structured Markdown report with sections (Summary, Comparison, Recommendations, Sources) is produced.
2. **Given** a provider/model combination that does not support web search (e.g., Ollama local models), **When** the user runs the research command, **Then** a clear message explains the limitation and suggests using a cloud provider (Claude or Gemini) that supports it.

---

### User Story 6 - Fix Dead Links in Documentation (Priority: P4)

As an engineer, I want to detect and fix dead links in my documentation files, so that I can maintain link integrity automatically.

**Why this priority**: Dead-link fixing is a utility feature that builds on the existing pipeline and can be partially implemented without AI (link checking is deterministic).

**Independent Test**: Can be tested by providing a Markdown file with known broken links and verifying corrections are applied.

**Acceptance Scenarios**:

1. **Given** a Markdown file with broken internal links, **When** the user runs `yuuhitsu fix-links --input docs/`, **Then** a report of broken links is produced and auto-fixable links are corrected.
2. **Given** a Markdown file with broken external URLs, **When** the user runs `yuuhitsu fix-links --input docs/ --check-external`, **Then** external URLs are verified via HTTP HEAD requests and broken ones are reported.

---

### User Story 7 - Generate Test Scaffolding (Priority: P4)

As an engineer, I want to generate a test suite skeleton from my source code, so that I can jumpstart test-first development.

**Why this priority**: Test scaffolding is valuable but is the most specialized task. It depends on the generation pipeline (US2) and adds code-analysis complexity.

**Independent Test**: Can be tested by pointing at a source file and verifying a test file with describe/it blocks is generated.

**Acceptance Scenarios**:

1. **Given** a TypeScript source file with exported functions, **When** the user runs `yuuhitsu generate-tests --input src/utils.ts --framework vitest`, **Then** a test file `src/utils.test.ts` is generated with test cases covering each exported function.

---

### Edge Cases

- What happens when the AI provider API returns a rate-limit error (HTTP 429)? The system retries with exponential backoff (max 3 retries, starting at 1 second).
- What happens when the input file does not exist? A clear file-not-found error is displayed with the attempted path.
- What happens when the input file is empty? The system reports that the input is empty and exits without making an API call.
- What happens when the API response is truncated or malformed? The system detects incomplete output and reports an error suggesting the user retry or use a model with a larger context window.
- What happens when the network is unavailable? The system detects the connection failure and suggests checking network connectivity, or switching to a local provider (Ollama).
- What happens when the Ollama server is not running? A clear error message instructs the user to start the Ollama server.
- What happens when the config file is missing? The system displays an error with instructions on how to create a default config, optionally offering an `yuuhitsu init` command.
- What happens when a required API key environment variable (`ANTHROPIC_API_KEY` for Claude, `GOOGLE_API_KEY` for Gemini) is not set? The system identifies the missing variable and provides setup instructions for obtaining the appropriate API key.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support three AI providers — Claude (via @anthropic-ai/sdk for Anthropic models), Gemini (via @google/genai for Google models), and Ollama (via OpenAI-compatible SDK for local model execution) — through a unified adapter interface. Adding a new provider MUST require only implementing a single adapter file.
- **FR-002**: System MUST allow provider selection and model specification via a YAML configuration file (`yuuhitsu.config.yaml`).
- **FR-003**: System MUST manage API keys through environment variables (`ANTHROPIC_API_KEY` for Claude, `GOOGLE_API_KEY` for Gemini) or `.env` files, never storing keys in the configuration file itself. Ollama requires no API key.
- **FR-004**: System MUST provide a CLI interface with subcommands for each task type (translate, generate-docs, sync-docs, research, fix-links, generate-tests).
- **FR-005**: System MUST use task-specific prompt templates that are customizable by the user.
- **FR-006**: System MUST implement automatic retry with exponential backoff for rate-limited or transiently failed API requests (max 3 retries).
- **FR-007**: System MUST support streaming output for long-running operations, displaying progress to the user.
- **FR-008**: System MUST preserve Markdown structure (headings, links, code blocks, tables, frontmatter) during translation and transformation operations.
- **FR-009**: System MUST provide clear, actionable error messages for all failure modes (auth errors, network errors, invalid config, missing files).
- **FR-010**: System MUST support batch processing of multiple files in a single command invocation.
- **FR-011**: System MUST be installable as a global CLI tool via npm (`npm install -g yuuhitsu`).
- **FR-012**: System MUST support a `--dry-run` flag that shows what would be done without making API calls.
- **FR-013**: System MUST log all API interactions to a configurable log file for debugging and cost tracking.
- **FR-014**: System MUST support an `init` subcommand that generates a default configuration file with commented examples.

### Key Entities

- **Provider**: Represents an AI service backend (Claude, Gemini, or Ollama). Each provider has a name, SDK, authentication method, and rate-limit characteristics. Claude and Gemini connect directly to their respective APIs via official SDKs; Ollama provides local model execution via OpenAI-compatible API.
- **Task**: A unit of work requested by the user (translate, generate-docs, etc.). Each task has a type, input file(s), output destination, and an associated prompt template.
- **PromptTemplate**: A reusable text template with placeholders for input content, target language, output format, etc. Templates are stored as files and can be overridden per-project.
- **Configuration**: The user's settings including selected provider (`claude`, `gemini`, or `ollama`), model (e.g., `claude-sonnet-4-5-20250929` for Claude, `gemini-2.0-flash` for Gemini, `llama3.2` for Ollama), API key environment variable reference, default output paths, and logging preferences. Stored as a YAML file.
- **ExecutionLog**: A record of each API call including timestamp, provider, model, token usage, cost estimate, latency, and success/failure status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can install the tool and translate their first document within 5 minutes of setup (including config creation).
- **SC-002**: Switching between providers (Claude ↔ Gemini ↔ Ollama) requires only editing 1-2 lines in the config file (`provider` and `model`); no code changes or reinstallation needed.
- **SC-003**: All 6 task types (translate, generate-docs, sync-docs, research, fix-links, generate-tests) are executable via CLI with consistent command patterns.
- **SC-004**: The system handles API rate-limiting transparently; users experience automatic retry without manual intervention for transient failures.
- **SC-005**: Translated Markdown files pass a structural comparison check (same heading count, same link count, same code block count) against the original.
- **SC-006**: Error messages for all identified failure modes (8 edge cases) provide actionable guidance that enables the user to resolve the issue without consulting external documentation.
- **SC-007**: The tool completes a single-file translation (under 10KB) in under 30 seconds on a standard internet connection.
- **SC-008**: Unit test coverage for the provider abstraction layer and CLI argument parsing reaches 80% or higher.
- **SC-009**: The system operates correctly in both WSL2/Linux and macOS environments.
