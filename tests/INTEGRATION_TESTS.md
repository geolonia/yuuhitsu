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

```
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
