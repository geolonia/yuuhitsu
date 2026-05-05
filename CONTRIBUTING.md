# Contributing to yuuhitsu

## Development Setup

```sh
git clone https://github.com/geolonia/yuuhitsu.git
cd yuuhitsu
npm install
npm test
```

## LLM-Related Changes: Phase 0 PoC Step (Mandatory)

> **This step is MANDATORY for any change that involves sentinel patterns, prompt modifications, or LLM transformation logic.**

When making changes to sentinel format, prompt templates, or chunk boundary transformation logic, you must complete a **Phase 0 Proof-of-Concept (PoC)** before full implementation:

### What Triggers Phase 0 PoC

Changes that touch any of the following require Phase 0:

- Sentinel format or naming (e.g., `<!--BB-->`, `%%BB%%`)
- Prompt templates in `src/tasks/translate.ts`
- Block boundary insertion/restoration logic
- Chunk splitting or merging logic
- Any logic where LLM behaviour cannot be predicted from unit tests alone

### Phase 0 PoC Procedure

1. **Design hypothesis**: State the expected LLM behaviour for the proposed change
2. **Select fixtures**: Choose at least 3 fixtures covering the affected patterns (use the [fixture 4-axis checklist](#fixture-4-axis-coverage-checklist) in `tests/INTEGRATION_TESTS.md`)
3. **Run PoC**: Execute real API calls against Claude Sonnet 4.6 (minimum):

   ```sh
   export ANTHROPIC_API_KEY=sk-ant-...
   npm run test:integration
   ```

4. **Evaluate results**: Do the results match the hypothesis?
   - **Yes → all fixtures pass**: Proceed to full implementation
   - **No → unexpected behaviour**: Revise hypothesis, update design, repeat from step 1

5. **Document results**: Record PoC findings in the strategy report (`queue/reports/`) before issuing an implementation command

### Why Phase 0 PoC is Mandatory

Two consecutive publish failures (yuuhitsu 0.1.15 and 0.1.16) occurred because LLM-related changes were implemented using only unit tests (mock LLM) without real API validation:

- **0.1.15**: Sentinel `%%BB%%` was transformed by Claude/Gemini into `%%BB__` — not caught by mock tests, detected only after publish
- **0.1.16**: List sentinel was deleted by LLM as "redundant" — fixture coverage was insufficient to catch the list-collapse pattern

Phase 0 PoC adds a mandatory **hypothesis → validate → revise** loop before implementation, catching LLM unpredictability early.

## Running Tests

```sh
# Unit tests (no API key required)
npm test

# Integration tests (requires ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=sk-ant-...
npm run test:integration

# Type check
npm run lint
```

## Release Process

See [RELEASE.md](RELEASE.md) for the full release procedure including canary publishing, monitoring, and rollback steps.

## Commit Guidelines

- Commits should be small and focused
- Use present tense ("Add feature" not "Added feature")
- Reference issues in commit messages when applicable
- Do not add `Co-Authored-By:` trailers to commits

## Pull Request Requirements

Before opening a PR that touches sentinel logic or LLM translation code:

- [ ] Phase 0 PoC completed and documented (if applicable)
- [ ] All unit tests pass: `npm test`
- [ ] All integration tests pass: `npm run test:integration`
- [ ] Fixture coverage checklist reviewed (see `tests/INTEGRATION_TESTS.md`)
- [ ] No `describe.skip` or `it.skip` added
- [ ] CodeRabbit Actionable comments resolved (graphql `reviewThreads(unresolved: true)` = 0)
