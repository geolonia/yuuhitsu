# Tasks: AI Provider Abstraction Layer

**Input**: Design documents from `/specs/001-ai-provider/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks included (test-first development per殿の指示).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US7)
- Exact file paths included in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Initialize Node.js project with `package.json` at repository root (name: ai-provider, type: module, bin: ai-provider)
- [ ] T002 Install dependencies: `openai`, `commander`, `yaml`, `dotenv`, `chalk`
- [ ] T003 Install dev dependencies: `vitest`, `typescript`, `tsx`, `@types/node`
- [ ] T004 [P] Create `tsconfig.json` with strict mode, ESM output, paths config
- [ ] T005 [P] Create project directory structure per plan.md: `src/cli/`, `src/provider/`, `src/tasks/`, `src/templates/`, `tests/unit/`, `tests/integration/`
- [ ] T006 [P] Create `.gitignore` for node_modules, dist, .env, *.log
- [ ] T007 [P] Configure vitest in `vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 Implement config loader in `src/config.ts` — load `ai-provider.config.yaml`, validate provider/model fields, resolve .env with dotenv
- [ ] T009 Unit test for config loader in `tests/unit/config/config.test.ts` — valid config, missing file, invalid provider, missing model
- [ ] T010 Implement provider factory in `src/provider/index.ts` — return configured OpenAI client based on provider name (openrouter → OpenRouter base URL + API key; ollama → localhost URL + no auth)
- [ ] T011 Implement provider config resolver in `src/provider/config.ts` — map provider name to base URL, auth headers, extra headers (HTTP-Referer, X-Title for OpenRouter)
- [ ] T012 Unit test for provider factory in `tests/unit/provider/provider.test.ts` — openrouter config, ollama config, unsupported provider error, missing API key error
- [ ] T013 Implement execution logger in `src/logger.ts` — append JSON lines to log file (timestamp, provider, model, tokens, latency, success/error)
- [ ] T014 [P] Unit test for logger in `tests/unit/logger/logger.test.ts`
- [ ] T015 Implement CLI entry point in `src/cli/index.ts` — commander setup with global options (--config, --dry-run, --verbose, --version)
- [ ] T016 Implement error formatting utility in `src/errors.ts` — format errors with "Error:" + "Hint:" pattern per contracts/cli-interface.md
- [ ] T017 [P] Create default prompt templates in `src/templates/translate.md`, `src/templates/generate-docs.md`, etc.

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Translate a Document (Priority: P1) 🎯 MVP

**Goal**: Translate a Markdown document preserving structure, with streaming progress

**Independent Test**: Run `ai-provider translate --input sample.md --lang ja` and verify output file has correct Japanese content with preserved Markdown structure

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US1] Unit test for translate task in `tests/unit/tasks/translate.test.ts` — mock provider, verify prompt construction, output file creation, Markdown structure preservation
- [ ] T019 [P] [US1] Integration test for translate CLI in `tests/integration/cli/translate.test.ts` — end-to-end CLI invocation with mock server

### Implementation for User Story 1

- [ ] T020 [US1] Implement translate task in `src/tasks/translate.ts` — read input Markdown, construct prompt from template, call provider, write output file, handle chunking for >50KB files
- [ ] T021 [US1] Implement translate CLI command in `src/cli/commands/translate.ts` — parse --input, --lang, --output options, call translate task, display streaming progress
- [ ] T022 [US1] Implement streaming output handler in `src/tasks/stream.ts` — display streaming chunks to stdout with progress indicator
- [ ] T023 [US1] Add --dry-run support to translate command — show what would be done without API call
- [ ] T024 [US1] Add error handling: invalid API key → clear message without exposing key, file not found, empty file, network error → suggest Ollama

**Checkpoint**: User Story 1 fully functional and testable independently

---

## Phase 4: User Story 2 — Generate Documentation from Source (Priority: P2)

**Goal**: Generate VitePress-compatible documentation from source code or spec files

**Independent Test**: Run `ai-provider generate-docs --input sample.ts --format vitepress` and verify documentation output

### Tests for User Story 2

- [ ] T025 [P] [US2] Unit test for generate-docs task in `tests/unit/tasks/generate-docs.test.ts` — mock provider, verify prompt includes source code, output has VitePress format
- [ ] T026 [P] [US2] Integration test for generate-docs CLI in `tests/integration/cli/generate-docs.test.ts`

### Implementation for User Story 2

- [ ] T027 [US2] Implement generate-docs task in `src/tasks/generate-docs.ts` — read source file, construct prompt, call provider, write formatted output
- [ ] T028 [US2] Implement generate-docs CLI command in `src/cli/commands/generate-docs.ts` — parse --input, --format, --output options
- [ ] T029 [US2] Add VitePress frontmatter generation in generate-docs task

**Checkpoint**: User Stories 1 AND 2 work independently

---

## Phase 5: User Story 3 — Switch AI Provider via Configuration (Priority: P2)

**Goal**: Seamless switching between OpenRouter models and Ollama by editing config

**Independent Test**: Change config from `provider: openrouter` to `provider: ollama`, run translate command, verify it works with local model

### Tests for User Story 3

- [ ] T030 [P] [US3] Unit test for provider switching in `tests/unit/provider/switching.test.ts` — openrouter→ollama config change, model format validation, error on unsupported provider
- [ ] T031 [P] [US3] Integration test for provider switching in `tests/integration/cli/provider-switch.test.ts`

### Implementation for User Story 3

- [ ] T032 [US3] Implement `init` CLI command in `src/cli/commands/init.ts` — generate default `ai-provider.config.yaml` with commented examples per contracts/cli-interface.md
- [ ] T033 [US3] Add provider validation error messages — clear error listing supported providers (openrouter, ollama) when unsupported provider specified
- [ ] T034 [US3] Add OPENROUTER_API_KEY missing error — specific message with setup instructions per edge case spec

**Checkpoint**: All provider configurations work seamlessly

---

## Phase 6: User Story 4 — Synchronize External Markdown to VitePress (Priority: P3)

**Goal**: Convert external Markdown to VitePress format with frontmatter and sidebar metadata

**Independent Test**: Run `ai-provider sync-docs --input external/README.md --output docs/guide/external.md`

### Tests for User Story 4

- [ ] T035 [P] [US4] Unit test for sync-docs task in `tests/unit/tasks/sync-docs.test.ts`

### Implementation for User Story 4

- [ ] T036 [US4] Implement sync-docs task in `src/tasks/sync-docs.ts` — convert Markdown to VitePress format, add frontmatter, batch directory processing
- [ ] T037 [US4] Implement sync-docs CLI command in `src/cli/commands/sync-docs.ts` — parse --input, --output options, support directory batch mode
- [ ] T038 [US4] Implement sidebar config generation for batch sync in `src/tasks/sync-docs.ts`

**Checkpoint**: VitePress sync works for single files and directories

---

## Phase 7: User Story 5 — Research a Topic (Priority: P3)

**Goal**: Web research with structured Markdown report output

**Independent Test**: Run `ai-provider research --query "Compare X vs Y" --output report.md`

### Tests for User Story 5

- [ ] T039 [P] [US5] Unit test for research task in `tests/unit/tasks/research.test.ts`

### Implementation for User Story 5

- [ ] T040 [US5] Implement research task in `src/tasks/research.ts` — construct research prompt, call provider, format structured report (Summary, Comparison, Recommendations, Sources)
- [ ] T041 [US5] Implement research CLI command in `src/cli/commands/research.ts`
- [ ] T042 [US5] Add capability check — detect if provider/model supports web search, suggest OpenRouter alternative if not

**Checkpoint**: Research produces structured reports

---

## Phase 8: User Story 6 — Fix Dead Links (Priority: P4)

**Goal**: Detect and optionally fix broken links in documentation

**Independent Test**: Run `ai-provider fix-links --input docs/ --check-external`

### Tests for User Story 6

- [ ] T043 [P] [US6] Unit test for fix-links task in `tests/unit/tasks/fix-links.test.ts` — internal link detection, external URL checking

### Implementation for User Story 6

- [ ] T044 [US6] Implement fix-links task in `src/tasks/fix-links.ts` — parse Markdown for links, check internal paths, optionally verify external URLs via HTTP HEAD
- [ ] T045 [US6] Implement fix-links CLI command in `src/cli/commands/fix-links.ts` — parse --input, --check-external, --fix options
- [ ] T046 [US6] Add AI-assisted link correction — use provider to suggest replacement URLs for broken links

**Checkpoint**: Dead link detection and fixing works

---

## Phase 9: User Story 7 — Generate Test Scaffolding (Priority: P4)

**Goal**: Generate test suite skeleton from source code

**Independent Test**: Run `ai-provider generate-tests --input src/utils.ts --framework vitest`

### Tests for User Story 7

- [ ] T047 [P] [US7] Unit test for generate-tests task in `tests/unit/tasks/generate-tests.test.ts`

### Implementation for User Story 7

- [ ] T048 [US7] Implement generate-tests task in `src/tasks/generate-tests.ts` — analyze source exports, construct prompt, generate test file with describe/it blocks
- [ ] T049 [US7] Implement generate-tests CLI command in `src/cli/commands/generate-tests.ts` — parse --input, --framework, --output options

**Checkpoint**: Test scaffolding generates valid test files

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T050 [P] Add batch processing support (FR-010) — `--input` accepts glob patterns, process multiple files
- [ ] T051 [P] Implement exponential backoff retry (FR-006) — configure OpenAI SDK retry settings (max 3 retries, 1s start)
- [ ] T052 Add `--verbose` output mode — log config loaded, provider used, model, token usage
- [ ] T053 Verify cross-platform compatibility (SC-009) — test on WSL2 and macOS file paths
- [ ] T054 Run quickstart.md validation — follow quickstart steps end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Phase 2 completion
  - US1 (Phase 3): No dependencies on other stories
  - US2 (Phase 4): No dependencies on other stories (reuses provider pipeline)
  - US3 (Phase 5): No dependencies on other stories
  - US4 (Phase 6): No dependencies on other stories
  - US5 (Phase 7): No dependencies on other stories
  - US6 (Phase 8): No dependencies on other stories (link checking is mostly deterministic)
  - US7 (Phase 9): No dependencies on other stories
- **Polish (Phase 10)**: Depends on at least US1 completion

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Task logic before CLI command wiring
- Core implementation before error handling refinements
- Story complete before moving to next priority

### Parallel Opportunities

- T004/T005/T006/T007 can all run in parallel (Setup)
- T014/T017 can run in parallel with each other (Foundational)
- All user stories (Phase 3-9) can start in parallel after Phase 2
- Test tasks within each story marked [P] can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T007)
2. Complete Phase 2: Foundational (T008-T017)
3. Complete Phase 3: US1 — Translate (T018-T024)
4. **STOP and VALIDATE**: Test translation end-to-end
5. Deploy as v0.1.0

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Translate) → v0.1.0 (MVP!)
3. Add US2 (Generate Docs) + US3 (Provider Switch) → v0.2.0
4. Add US4 (Sync) + US5 (Research) → v0.3.0
5. Add US6 (Fix Links) + US7 (Generate Tests) → v0.4.0
6. Polish → v1.0.0

---

## Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Phase 1: Setup | T001-T007 (7) | — |
| Phase 2: Foundational | T008-T017 (10) | — |
| Phase 3: US1 Translate | T018-T024 (7) | P1 🎯 MVP |
| Phase 4: US2 Generate Docs | T025-T029 (5) | P2 |
| Phase 5: US3 Provider Switch | T030-T034 (5) | P2 |
| Phase 6: US4 Sync Docs | T035-T038 (4) | P3 |
| Phase 7: US5 Research | T039-T042 (4) | P3 |
| Phase 8: US6 Fix Links | T043-T046 (4) | P4 |
| Phase 9: US7 Gen Tests | T047-T049 (3) | P4 |
| Phase 10: Polish | T050-T054 (5) | — |
| **Total** | **54 tasks** | **7 stories** |
