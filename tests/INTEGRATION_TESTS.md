# Integration Tests Checklist

Integration tests call the real Anthropic API and require a valid `ANTHROPIC_API_KEY`.

## Prerequisites

- `ANTHROPIC_API_KEY` must be set in your environment.
- Tests consume API credits. Each fixture makes one LLM API call.

## Running Locally

```sh
export ANTHROPIC_API_KEY=sk-ant-...
npm run test:integration
```

If `ANTHROPIC_API_KEY` is not set, the test suite will **fail** (not skip) with:

```text
Error: ANTHROPIC_API_KEY is required for integration tests.
```

## Running in CI

Integration tests run via the `integration-tests.yml` workflow, which triggers:

- On pull requests that modify `src/tasks/translate.ts` or `tests/integration/**`
- On manual dispatch (`workflow_dispatch`)
- On a weekly schedule (Monday 09:00 UTC)

The workflow requires the `ANTHROPIC_API_KEY` secret to be configured in the repository settings.

## Checklist Before Merging PRs That Touch Sentinel Logic

- [ ] All unit tests pass: `npm test`
- [ ] All integration tests pass: `npm run test:integration` (requires `ANTHROPIC_API_KEY`)
- [ ] No `describe.skip` or `it.skip` added to integration test files
- [ ] New fixtures added for any new sentinel patterns
- [ ] CI integration test run completed (check Actions tab)
- [ ] Fixture 4-axis coverage checklist reviewed (see section below)

## Fixture 4-Axis Coverage Checklist

When adding new sentinel patterns or modifying LLM transformation logic, verify that the integration test fixtures cover the following 4 axes. Each cell should have at least one fixture (or an explicit note explaining why coverage is not needed).

### Axis 1: Content Type

| Content Type | Status | Fixture(s) |
|---|---|---|
| text-only | ✅ | p-a4-6 (short), p-a4-11 (long) |
| inline code (`\`...\``) | ✅ | p-a4-1 (short), p-a4-12 (medium) |
| block code fence (` ``` `) | ✅ | p-a4-2, p-a4-10 |
| mixed (text + inline code + bold) | ✅ | p-a4-12 |

### Axis 2: Structure

| Structure | Status | Fixture(s) |
|---|---|---|
| single element | ✅ | p-a4-6 (2-item list) |
| consecutive same-kind | ✅ | p-a4-9 (heading-bracketed list), p-a4-11 (long list) |
| adjacent different-kind | ✅ | p-a4-2 (list + fence), p-a4-5 (hr + heading) |
| nested | ✅ | p-a4-8 (2-level nested list) |
| 3+ level nested | ⚠️ missing | — |

### Axis 3: Size

| Size | Status | Fixture(s) |
|---|---|---|
| short (≤3 items) | ✅ | p-a4-1, p-a4-3, p-a4-6 |
| medium (4–10 items) | ⚠️ missing (text-only, inline code) | p-a4-12 partially covers inline code medium |
| long (10+ items) | ✅ | p-a4-11 |

### Axis 4: Marker Kind

| Marker Kind | Status | Fixture(s) |
|---|---|---|
| unordered list (`-`, `*`, `+`) | ✅ | p-a4-1, p-a4-6, p-a4-8, p-a4-9, p-a4-11, p-a4-12, p-a4-13 |
| ordered list (`1.`, `2.`, …) | ✅ | p-a4-7, p-a4-13 |
| heading (`##`, `###`, …) | ✅ | p-a4-4, p-a4-5, p-a4-9 |
| horizontal rule (`---`) | ✅ | p-a4-5 |
| fenced code block (` ``` `) | ✅ | p-a4-2, p-a4-10 |

### Known Missing Categories (Priority)

The following fixture patterns have been identified as missing. Add fixtures when the corresponding pattern is relevant to a new sentinel implementation:

| Priority | Category | Description | Example pattern |
|---|---|---|---|
| **P0** | `code_block_with_placeholder` | `__CODE_BLOCK_N__` placeholder adjacent to list | List items before/after a `__CODE_BLOCK_N__` line |
| **P0** | `list_inline_code_medium` | Medium list (4–10 items) with inline code | `- Item: \`value\`` × 5 items |
| P1 | `list_text_only_medium` | Medium list (4–10 items), text only | `- Item` × 5 items |
| P1 | `list_inline_code_long` | Long list (10+) with inline code | `- Item: \`value\`` × 10+ items |
| P1 | `list_nested_deep` | 3+ level nested list | `- A\n  - B\n    - C` |
| P1 | `ordered_list_long` | Long ordered list (10+ items) | `1. A\n2. B\n…\n11. K` |
| P2 | `heading_consecutive` | Two consecutive headings | `## A\n## B` |
| P2 | `heading_h1_to_h6` | All 6 heading levels | `# H1` through `###### H6` |
| P2 | `hr_alone` | Single horizontal rule only | `---` alone |
| P2 | `fence_alone` | Single fenced code block, no surrounding list/heading | ` ```js\ncode\n``` ` |
| P2 | `table_row_adjacent` | Markdown table row adjacent to list or heading | `\| col \|` near list |
| P2 | `bold_underscore_in_list` | List items with `**bold**` or `_underscore_` | `- **bold** item` |
| P2 | `blockquote_with_list` | Blockquote containing list | `> - A\n> - B` |

### How to Add a New Fixture

1. Create `tests/integration/fixtures/p-a4-<N>.input.md` with the pattern to test
2. Add a corresponding `it(...)` block in `translate-block-boundaries.real-llm.test.ts`
3. Update the coverage table above to mark the category as ✅
4. Run `npm run test:integration` to validate
