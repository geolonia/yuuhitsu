# Implementation Plan: AI Provider Abstraction Layer

**Branch**: `001-ai-provider` | **Date**: 2026-02-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ai-provider/spec.md`

## Summary

A CLI tool (`ai-provider`) that provides a unified interface for AI-powered document operations (translation, documentation generation, sync, research, link fixing, test scaffolding). Uses OpenRouter as a unified cloud API gateway (one endpoint for Claude, GPT, Gemini, Mistral, etc.) and Ollama for local model execution. Both providers implement the OpenAI Chat Completions API format, enabling a single HTTP client with configurable base URL and auth — no provider-specific adapters needed.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20+
**Primary Dependencies**: `openai` (npm, OpenAI-compatible SDK), `commander` (CLI), `yaml` (config), `dotenv` (.env support), `vitest` (tests)
**Storage**: File-based (config YAML, log JSON lines, prompt templates as .md files)
**Testing**: vitest (unit + integration)
**Target Platform**: WSL2/Linux, macOS (cross-platform via Node.js)
**Project Type**: Single project (CLI tool)
**Performance Goals**: Single-file translation (<10KB) in under 30 seconds (SC-007)
**Constraints**: Must work offline with Ollama; must not expose API keys in output
**Scale/Scope**: CLI tool for individual engineers; no server component

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is not yet configured (template state). No gates to enforce. Proceeding with research phase.

**Post-Phase 1 Re-check**: Design uses single-project structure, 2 provider configs (not adapters), standard CLI patterns. No complexity violations detected.

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-provider/
├── plan.md              # This file
├── research.md          # Phase 0: OpenRouter/Ollama API research
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Getting started guide
├── contracts/
│   ├── provider-interface.ts  # TypeScript interface contracts
│   └── cli-interface.md       # CLI command specifications
└── tasks.md             # Phase 2: Implementation tasks (next step)
```

### Source Code (repository root)

```text
src/
├── cli/
│   ├── index.ts         # CLI entry point (commander setup)
│   └── commands/        # Subcommand handlers (translate, generate-docs, etc.)
├── provider/
│   ├── index.ts         # Provider factory (returns configured OpenAI client)
│   └── config.ts        # Provider config resolution (URL, auth, headers)
├── tasks/
│   ├── translate.ts     # Translation task logic
│   ├── generate-docs.ts # Doc generation task logic
│   ├── sync-docs.ts     # Doc sync task logic
│   ├── research.ts      # Research task logic
│   ├── fix-links.ts     # Dead link detection/fixing
│   └── generate-tests.ts # Test scaffolding
├── templates/           # Default prompt templates
├── config.ts            # Config file loading & validation
├── logger.ts            # Execution logging
└── index.ts             # Library entry point

tests/
├── unit/
│   ├── provider/        # Provider factory tests
│   ├── config/          # Config loading tests
│   └── tasks/           # Task logic tests (mocked provider)
└── integration/
    └── cli/             # CLI end-to-end tests
```

**Structure Decision**: Single project structure. The tool is a CLI application with no frontend/backend split. All code lives under `src/` with tests under `tests/`.

## Complexity Tracking

No constitution violations to justify.
