# Changelog

## [0.1.7] - 2026-03-10

### Fixed
- Replace regex-based code block detection with line-by-line parser to prevent V8 stack overflow on files with many fenced code blocks (e.g., NGSI-LD API docs with 100+ code blocks)
- The previous regex `/(`{3,})[^\n]*\n[\s\S]*?\1/g` used backreference + non-greedy `[\s\S]*?` which caused recursive backtracking in V8, exceeding stack limits on CI runners

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
