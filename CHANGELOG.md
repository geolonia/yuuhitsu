# Changelog

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
