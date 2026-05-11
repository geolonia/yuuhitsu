# Changelog

## [Unreleased]

## [0.3.1] - 2026-05-12

### Fixed
- **[fix] cmd_462 — translateBatch: filter and retry on unexpected IDs in structured output response (Q1=B)**
  - Claude tool_use (structured output path) occasionally hallucinates IDs beyond the batch boundary (e.g. returns ID 67 in a batch of IDs 0–66)
  - Root cause: no explicit ID constraint in system prompt; Claude infers IDs from pattern rather than from input
  - Fix: `buildStructuredSystemPrompt` now appends `CRITICAL` constraint: *"Use ONLY the IDs provided in the input. Do NOT invent or hallucinate IDs beyond what was given."*
  - Fix: `translateBatch` (structured path) filters unexpected IDs from response and retries up to 3 times with corrective context: *"RETRY CORRECTION: Previous response contained unexpected IDs: [X]. Use ONLY: [valid IDs]."*
  - New `--system-prompt-suffix <text>` CLI option: appends custom text to the system prompt (enables geonicdb-docs HF3 contextual retry)
  - Also adds: `systemPromptSuffix?: string` field to `TranslateOptions`
- **[fix] cmd_462 — skip fence-only paragraphs from translation (Q3=A)**
  - `extractBlockNodes` now skips paragraph nodes whose stringified content matches `/^(\`{3,}|~{3,})\S*$/` (bare fence marker without closing fence)
  - Prevents LLM from mangling lone `` ``` `` or `~~~` markers that appear as paragraphs in malformed markdown
- **[fix] cmd_462 — system prompt includes code fence guard constraint**
  - `buildStructuredSystemPrompt` appends: *"Do NOT add new code fences (`` ``` ``) that are not present in the original input."*
  - Addresses fence count mismatch failure (reactivcore-rules.md 190→195 fences)

### Added
- **[test] cmd_462 — integration fixtures for ID boundary and fence-heavy documents**
  - `tests/fixtures/large-paragraphs-67-blocks.md`: 73 paragraphs + headings for testing ID boundary robustness (≥70 translatable blocks per chunk)
  - `tests/fixtures/reactivcore-like-fence-heavy.md`: 100 code fences (yaml/json/bash/python/typescript/sql/javascript) modeled on real reactivcore-rules.md structure

### Fixed (Local QC)
- **[fix] cmd_462 — local-qc.ts: fix fixture path for changelog (was `changelog/index.md`, now `changelog.md`)**

## [0.3.0] - 2026-05-10

### Changed (Breaking)
- **[feat] cmd_453 Part A — paragraph-level chunk redesign (`extractBlockNodes`) for 0.3.0**
  - Root cause of EN/JA mixing in 0.2.x: `extractTextNodes()` split paragraphs at inline-code/emphasis boundaries, causing LLM context loss → EN/JA mixing, duplicate phrases, semantic inversion (17 issues found in PR#210)
  - Example: `"When \`AUTH_ENABLED=true\`, a token is required."` was split into `"When "` + `", a token is required."` → LLM had no context for each fragment
  - **`extractTextNodes()` removed** — replaced by `extractBlockNodes()` which extracts paragraph and heading nodes as whole markdown units (inline code, bold, italic, links preserved within the block)
  - **`DEFAULT_MAX_NODES_PER_BATCH` removed** — replaced by `DEFAULT_MAX_TOKENS_PER_BATCH = 4000` (token-count-based batching: `chars / 4` approximation)
  - **`maxNodesPerBatch` option renamed to `maxTokensPerBatch`** in `TranslateOptions`, `BatchTranslateOptions`, and CLI flag (`--max-tokens-per-batch`)
  - System prompts updated: explicit instructions to preserve inline markdown formatting and treat each block as an independent paragraph-level unit
  - LLM output re-parsed through remark and written back to AST (`applyTranslation` closure per block)

## [0.2.4] - 2026-05-06

### Fixed
- **[fix] cmd_434 — glossary check skips fenced code block contents (explicit test coverage)**
  - `checkGlossary` already excluded fenced code block (`` ``` ``...`` ``` ``) contents via `inFencedBlock` tracking since 0.1.12; this release adds explicit test coverage for the real-world failure case
  - Root cause of CI failure (geonicdb-docs PR#204): `` ```json `` fenced blocks containing JSON keys (e.g. `"geonicdb"` in `mcpServers` config) were flagged as block-tier glossary violations by older published versions
  - Added unit tests: `"should not flag block-tier JSON key inside ```json fenced block (Japanese)"` and `"should not flag warn-tier term inside fenced code block (Japanese)"` — covers the exact CI failure scenario
  - Closes #84

## [0.2.3] - 2026-05-06

### Fixed
- **[fix] cmd_430 Hotfix 3 — glossary check skips inline code and code block contents**
  - `checkGlossary` was incorrectly flagging package names (e.g. `` `@geolonia/geonicdb-sdk` ``), file names (e.g. `` `geonicdb.d.ts` ``), and other technical identifiers inside inline code as glossary violations
  - Root cause: glossary check (block tier + warn tier) did not exclude inline code (`` `...` ``) contents from detection — package names must remain lowercase in code contexts
  - Fix: inline code contents are stripped from each line before glossary term matching (fenced code blocks were already excluded via `inFencedBlock` tracking)
  - Added unit tests for block-tier and warn-tier terms inside inline code, including Japanese translations of npm package names
  - Closes #80

## [0.2.2] - 2026-05-06

### Fixed
- **[fix] cmd_425 Hotfix 2 — max-nodes-per-batch=200 auto re-split (BUG-421-dense-chunk)**
  - Dense markdown files (e.g. changelog.md, ~3.7 text nodes/line) could produce chunks with 300+ text nodes, causing Claude structured output to hallucinate out-of-range IDs (`[yuuhitsu] translateBatch: unexpected IDs in response (IDs: 392)`)
  - `translateFile` now splits text nodes into sub-batches of `maxNodesPerBatch` (default: 200) before calling `translateBatch`; sparse API-docs files (avg 0.7 nodes/line) are unaffected (typically <200 nodes/chunk)
  - Added `DEFAULT_MAX_NODES_PER_BATCH = 200` constant exported from `translate.ts`
  - Added `maxNodesPerBatch?: number` field to `TranslateOptions`
  - Added `--max-nodes-per-batch <number>` CLI option to `yuuhitsu translate`
  - Added `@types/mdast` to devDependencies (was implicitly required but undeclared, causing `tsc` failures on fresh installs)

## [0.2.1] - 2026-05-05

### Fixed
- **[fix] cmd_419 H1 large file hotfix** — `max_tokens` 4096 → 16384 (prevents JSON truncation for large files ≥98KB), `DEFAULT_MAX_CHUNK_LINES` 300 → 150 (reduces per-chunk token load), raw response logging on JSON parse failure (`console.error` before throw)

## [0.2.0-rc] - 2026-05-05

### Added
- **[feat] cmd_410 Phase B structured output** — Claude tool_use integration for guaranteed 1:1 ID mapping
  - `ClaudeProvider` now implements optional `translateStructured(request)` method
  - Uses Anthropic `tools` API with `tool_choice: { type: "tool", name: "record_translations" }` to force JSON schema at the API level — no prose-wrapping, no schema deviations
  - `AIProvider` interface extended with optional `translateStructured?` method (`StructuredTranslateRequest` / `StructuredTranslateResponse` types added to `src/provider/interface.ts`)
  - `translateBatch` in `translate.ts` detects `provider.translateStructured` and uses it automatically; Gemini and Ollama fall back to text-mode JSON (unchanged)
  - 1:1 ID mapping validated in both paths: throws `Error` if any segment IDs are missing from the response
  - System prompt for structured path (`buildStructuredSystemPrompt`) omits JSON format instructions — schema enforces response shape
  - P-A1 truncation check ported to structured path (compares total translated chars to input chars)

### Changed (BREAKING)
- **[feat] cmd_409 AST-based translate** — complete rewrite of translation architecture (0.2.0)
  - `translateFile` now uses remark + remark-gfm to parse markdown into mdast AST before translation
  - Only leaf `text` nodes are extracted and sent to LLM; all structural elements (headings, lists, code blocks, inline code, links, tables, HR) are preserved deterministically by the AST round-trip
  - LLM receives a JSON `{ segments: [{id, text}] }` payload and returns `{ translations: [{id, text}] }` — no full-markdown context needed
  - Fenced code blocks and inline code are never sent to LLM (AST handles them as typed nodes)
  - **Removes** all sentinel logic: `BLOCK_BOUNDARY_SENTINEL`, `protectBlockBoundaries`, `restoreBlockBoundaries` removed from translation pipeline
  - Adds `remark`, `remark-gfm`, `unist-util-visit` as runtime dependencies

### Added
- `extractTextNodes`, `translateBatch`, `parseTranslationResponse`, `buildBatchSystemPrompt` — new AST-based translation helpers
- P-A1 truncation check retained: warns if output characters are < 30% of input characters

### Kept (not breaking)
- `protectCodeBlocks` / `restoreCodeBlocks` remain exported for use by `glossary-fix.ts`
- `separateFrontmatter`, `splitIntoChunks` and all heading-based chunking utilities unchanged
- `TranslateOptions`, `TranslateResult` interfaces unchanged

### Removed
- `BLOCK_BOUNDARY_SENTINEL`, `protectBlockBoundaries`, `restoreBlockBoundaries` from translation pipeline
- `buildPrompt` function (replaced by `buildBatchSystemPrompt`)
- `tests/unit/tasks/translate-block-boundaries.test.ts` (sentinel tests no longer applicable)

### Added
- `CONTRIBUTING.md`: Phase 0 PoC step mandatory flow for LLM-related changes
- `RELEASE.md`: canary release process documentation (npm tag `next` → 1-week dogfood → `latest` promotion, rollback procedure, post-mortem template)
- `tests/INTEGRATION_TESTS.md`: fixture 4-axis coverage checklist (content / structure / size / marker kind) with 25+ category matrix and 12 identified missing fixture categories (P0/P1/P2 prioritized)
- `package.json`: added `publishConfig` with `access: public` and registry configuration

## [0.1.17] - 2026-05-05

### Changed
- `protectBlockBoundaries`: list items now get **double sentinel before each item** (P-A4 v3)
  - Trailing sentinels omitted intentionally: avoids spurious trailing `\n` on round-trip
  - Heading/hr/fence still use single sentinel (unchanged from 0.1.16 — fixture 4-5 PASS)
  - LLM was treating a single leading sentinel as "redundant" and deleting it, collapsing list items to one line
- `restoreBlockBoundaries`: added Layer 3 list-aware fallback
  - Detects inline list concatenation (`- A- B`) that survived Layer 1+2 protection
  - Splits back to separate lines via deterministic regex (`/gm` multiline mode)
  - Emits `console.warn` when applied (silent failure prevention)
- `buildPrompt`: added list-specific counter-example to P-A4 v3 instructions
  - Shows "list items joined on one line" as explicit Bad example
  - Clarifies that consecutive `<!--BB-->` markers are intentional and must be preserved
  - +115 tokens vs 0.1.16

### Added
- Integration test fixtures 6-13 (`p-a4-6.input.md` through `p-a4-13.input.md`)
  - Fixture 6: 2-item simple list (English-only minimal case)
  - Fixture 7: ordered list (1./2./3.)
  - Fixture 8: nested list (2 levels deep)
  - Fixture 9: list + blank line + heading mix
  - Fixture 10: list + 4-backtick fence (PR#161 complete reproduction)
  - Fixture 11: long list (10+ items)
  - Fixture 12: list with inline code in each item
  - Fixture 13: mixed unordered + ordered list
- Integration test: 8 new test cases (fixtures 6-13), total 13 fixtures

### Tests (unit)
- `translate-block-boundaries.test.ts`: updated for double sentinel behavior
  - `protectBlockBoundaries`: list items produce 2×BB before (trailing omitted by design)
  - `restoreBlockBoundaries`: Layer 3 fallback tests (unordered, ordered, asterisk, plus)
  - Round-trip tests: double sentinel protects + restores correctly
  - False positive tests: prose dashes and nested content not misdetected

### Migration (0.1.16 → 0.1.17)
- Backward compatible: `restoreBlockBoundaries` correctly handles both 0.1.16 single-sentinel and 0.1.17 double-sentinel output
- geonicdb-docs: upgrade from 0.1.14 → 0.1.17 (0.1.16 was rolled back via cmd_398)

Closes https://github.com/geolonia/yuuhitsu/issues/62

## [0.1.16] - 2026-05-05

### Changed
- `BLOCK_BOUNDARY_SENTINEL`: `"%%BB%%"` → `"<!--BB-->"` (HTML comment form, LLM deformation-resistant)
  - HTML comments have strong LLM training prior as "structural elements to preserve verbatim"
  - Eliminates the LaTeX/Liquid template `%%` reflex that caused `%%BB__` deformation in 0.1.15
- `restoreBlockBoundaries`: 3-pass strategy for robust variant recovery
  - Pass 1: normalize LLM-deformed variants via fallback regex (`<!-- BB -->`, `<!--BB__-->`, `<!--BBx-->`, `<!--BB-x-->`, etc.)
  - Pass 2: split + restore newlines (existing logic, unchanged)
  - Pass 3: post-restore `console.warn` for residual sentinel-like patterns (silent failure prevention)
- `buildPrompt`: sentinel preservation instruction updated to `<!--BB-->` with counter-example section
  - 5 Bad examples (suffix insertion / internal whitespace / case change / deletion / hyphen suffix)
  - +135 tokens vs 0.1.15 +120 tokens (acceptable delta)

### Added
- `tests/integration/translate-block-boundaries.real-llm.test.ts`: real LLM integration test (Claude Sonnet 4.6 × 5 fixtures)
  - Fixture 1: PR#155 list-list newline preservation
  - Fixture 2: PR#161 macOS/Windows list + 4-backtick fence
  - Fixture 3: PR#166 3-item JSON list
  - Fixture 4: PR#161 heading + inline-code + body
  - Fixture 5: PR#155 hr + heading
  - Graceful skip when `ANTHROPIC_API_KEY` is not set
- `.github/workflows/integration-tests.yml`: CI workflow for real LLM tests
  - Triggers: pull_request (translate.ts + integration tests), workflow_dispatch, weekly schedule (Monday 09:00 UTC)
  - Runs only when `ANTHROPIC_API_KEY` secret is available

### Tests (8 new unit tests)
- `translate-block-boundaries.test.ts`: 8 variant detection tests
  - `<!-- BB -->`, `<!--BB__-->`, `<!--BBx-->`, `<!--BB-x-->`, `<!--  BB  -->` normalized via fallback
  - Round-trip with `<!-- BB -->` and `<!--BB__-->` variants returns original
  - Exact sentinel unaffected by fallback pass (no double-processing)

### Migration (0.1.15 → 0.1.16)
- Sentinel format changed: existing translated docs with `%%BB__` residuals will be re-translated correctly on next sync run
- `fix-doc-quality.ts` 7 functions maintained (Phase 3 deletion frozen per cmd_389 Q6)

Closes https://github.com/geolonia/yuuhitsu/issues/56

## [0.1.15] - 2026-05-04

### Added
- `protectBlockBoundaries` / `restoreBlockBoundaries`: P-A4 newline sentinel (`%%BB%%`) — inserts block boundary markers before list items, headings, horizontal rules, and code fences prior to LLM translation, then restores newlines after translation. Eliminates newline collapse at structural boundaries (root cause of PR#155/161/166 broken output patterns).
- `BLOCK_BOUNDARY_SENTINEL` exported constant (`"%%BB%%"`)
- `buildPrompt`: sentinel preservation instruction (+120 tokens) with few-shot example automatically added when sentinels are present — instructs LLM to output `%%BB%%` markers verbatim
- default-on behavior (no flag required); transparent to existing users

### Implementation
- `src/tasks/translate.ts`: `protectBlockBoundaries` runs after `protectCodeBlocks`; `restoreBlockBoundaries` runs before `restoreCodeBlocks`
- Sentinel strategy: insert `%%BB%%` on its own line before each structural element; restore by splitting on sentinel and normalizing newlines (handles both clean and collapsed LLM output)
- Residual sentinel warning: `console.warn` when `%%BB%%` remains in output (LLM moved/duplicated markers)

### Tests (23 new)
- `translate-block-boundaries.test.ts`: 7 `protectBlockBoundaries` unit tests, 9 `restoreBlockBoundaries` unit tests, 5 full round-trip fixture tests (PR#155 list-list, PR#166 3-item list, PR#161 macOS/Windows+fence, PR#155 hr+heading, PR#161 heading+body)

### Migration
Phase 2 (cmd_385): geonicdb-docs `yuuhitsu` bump `0.1.14 → 0.1.15` + 1-week monitoring
Phase 3 (cmd_386): `fix-doc-quality.ts` 4-function deletion (`fixEmbeddedFences`, `fixListMerge`, `fixHeadingMerge`, `fixHorizontalRuleMerge`) — ~700 LOC → ~250 LOC (60% reduction)

Closes https://github.com/geolonia/yuuhitsu/issues/53

## [0.1.14] - 2026-05-02

### Added
- `DoNotUseEntry` type: `string | { term: string; except_after?: string[] }` — backward-compatible Union type for `do_not_use` entries
- `checkGlossary`: context_exception lookback — when a `do_not_use` entry is object form with `except_after`, the forbidden term is allowed if any of the listed words appear within 16 chars before the match (e.g., "MQTT ブローカー" is allowed when `except_after: ["MQTT"]`)
- `buildGlossaryPrompt`: `except_after` attribute emitted in `<do_not_use>` XML (e.g., `<do_not_use except_after="MQTT, Message">ブローカー</do_not_use>`)
- `buildGlossaryPrompt`: Added instruction line explaining `except_after` behavior to LLM
- `fixGlossary`: updated to handle object-form `do_not_use` entries

### Migration
To use hybrid schema in `glossary.yaml`:
```yaml
do_not_use:
  ja:
    - "従来の禁止語"                          # string form (unchanged)
    - term: "ブローカー"                       # object form (new)
      except_after: ["MQTT", "Message"]
```

### Tests
- NEW-1: string form (backward compat) triggers violation
- NEW-2: object form + except_after match → allowed
- NEW-3: object form + except_after mismatch → violation
- NEW-4: lookback boundary (16 chars) inside/outside
- NEW-5: buildGlossaryPrompt emits except_after in XML

Closes https://github.com/geolonia/yuuhitsu/issues/50

## [0.1.13] - 2026-05-02

### Changed
- `DEFAULT_TEMPLATE`: Added mandatory code fence language identifier rule — every opening ` ``` ` must be followed by a language identifier; use ` ```text ` when unknown
- `DEFAULT_TEMPLATE`: Added bash counter-example showing correct vs incorrect code fence usage
- `buildGlossaryPrompt`: Added `do_not_use` entries as forbidden regardless of severity (block/warn/auto-fix)
- `buildGlossaryPrompt`: Strengthened `severity=warn` wording to "actively avoid all do_not_use forms; treat warn terms as near-mandatory"
- Note: These prompt-strengthening rules are not applied when using `--template-content` with a custom prompt.

### Tests
- NEW-1: fence lang 必須文言が DEFAULT_TEMPLATE に存在すること
- NEW-2: warn 強化文言が buildGlossaryPrompt に存在すること
- NEW-3: glossary 未設定時に warn 強化文言が出現しないこと

Closes https://github.com/geolonia/yuuhitsu/issues/47

## [0.1.12] - 2026-05-01

### Fixed
- `protectCodeBlocks`: code blocks are now stored as a single-line placeholder (no empty-line padding). Padding caused chunk boundaries to fall inside the whitespace region of large code blocks when using `--max-chunk-lines`, leading to non-deterministic LLM output and broken code fences in translated files (root cause of cmd_328 / cli.md build failure).
- `checkGlossary`: rewrote line scanning to iterate original body lines directly instead of relying on protected-body line indices, so reported line numbers remain accurate after the `protectCodeBlocks` padding removal.

### Notes
- A 120-line code block (e.g., Command Tree in `cli.md`) is now represented as 1 line in the protected body. With `--max-chunk-lines 100`, such a section is no longer force-split, eliminating the code fence break that caused Vue parser errors downstream.

Closes https://github.com/geolonia/yuuhitsu/issues/44

## [0.1.11] - 2026-04-30

### Fixed
- `yuuhitsu glossary check`: --severity-filter に無効値を渡すと exit 1 + 具体的エラーメッセージを出力
- `yuuhitsu glossary check`: --format に無効値を渡すと exit 1 + 具体的エラーメッセージを出力
- `yuuhitsu glossary fix`: URL placeholder に UUID suffix を付加し、本文中の `__URL_N__` パターンとの衝突リスクを解消
- `buildGlossaryPrompt`: XML 出力で `&` `<` `>` を正しくエスケープ（`&amp;` `&lt;` `&gt;`）
- `buildGlossaryPrompt`: few-shot example を do_not_use あり項目から最大 3 件取得するよう修正（旧: slice(0,2) で 0〜1 件しか取れないケースあり）

Closes https://github.com/geolonia/yuuhitsu/issues/42

## [0.1.10] - 2026-04-30

### Added
- Phase 1: translate prompt 強化（XML tag wrap, canonical-first, few-shot, severity=block 先頭再掲）
- Phase 2: `yuuhitsu glossary fix` 新サブコマンド（severity=auto-fix 語の機械置換、--dry-run 対応）
- Phase 3: glossary.yaml schema に severity フィールド追加（block/warn/auto-fix 3段階、既定 warn）
- `yuuhitsu glossary check` に --severity-filter / --format (json|sarif|text) オプション追加
- SARIF 2.1.0 出力フォーマット対応（`src/lib/sarif-formatter.ts`）

### Changed
- buildGlossaryPrompt() を XML tag wrap 形式に刷新（翻訳精度向上、token 増加 5-10% 許容）

### Notes
- severity 未指定の既存 glossary.yaml は 0.1.9 と同等に動作（後方互換）

Closes https://github.com/geolonia/yuuhitsu/issues/40

## [0.1.9] - 2026-04-29

### Fixed
- Fix infinite recursion in `splitAtPositions` when `###` heading is at segment position 0
- This caused SIGSEGV in CI for all input files starting with a top-level heading
  (regression introduced in 0.1.8 line-by-line parser change)

### Added
- Regression test using real ngsild.md fixture (1597 lines, 93 code blocks)
- Test for full `translateFile` pipeline with bullet sentinels
- Test for `splitIntoChunks` with `###` heading at segment position 0

## [0.1.8] - 2026-03-09

### Fixed
- Replace regex-based code block detection with line-by-line parser to prevent V8 stack overflow on files with many fenced code blocks (e.g., NGSI-LD API docs with 100+ code blocks)
- The previous regex used backreference + non-greedy `[\s\S]*?` which caused recursive backtracking in V8, exceeding stack limits on CI runners

### Added
- Test for `protectCodeBlocks` robustness with many code blocks (ngsild.md pattern)
- Test for unclosed code fence handling

## [0.1.6] - 2026-03-09

### Added
- Heading-based chunk splitting for `translateFile`: content is now split at `##` Markdown heading boundaries instead of fixed 50 KB byte boundaries
- `splitIntoChunks` exported for unit testing
- Helper functions exported: `findHeadingPositions`, `splitAtPositions`, `safeSplitLines`, `mergeSmallChunks`
- `--max-chunk-lines` CLI option for the `translate` command (default: 300 lines)
- `maxChunkLines` option added to `TranslateOptions`
- `DEFAULT_MAX_CHUNK_LINES` constant (300) exported from `translate.ts`

### Changed
- `splitIntoChunks` now splits at `##` heading boundaries (falling back to `###`, then safe line-count splitting)
- Tables and fenced code blocks are protected from mid-block splitting
- Small chunks (< 50 lines) are merged with the previous chunk when the combined size fits within `maxChunkLines`

### Removed
- `CHUNK_SIZE` constant (50 KB byte-based limit) — replaced by line-count-based `DEFAULT_MAX_CHUNK_LINES`
