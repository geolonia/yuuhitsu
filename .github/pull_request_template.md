## Summary

<!-- What does this PR do? -->

## Related Issues

<!-- Closes #N -->

## Checklist

- [ ] Unit tests pass: `npm test` (SKIP=0)
- [ ] Build succeeds: `npm run build`
- [ ] TypeScript check: `npm run typecheck`

### Integration Tests (required when modifying `src/tasks/translate.ts` or `tests/integration/**`)

- [ ] `ANTHROPIC_API_KEY` is set locally
- [ ] All integration test fixtures pass: `npm run test:integration`
- [ ] No `describe.skip` / `it.skip` added to integration test files
- [ ] New fixtures added for any new sentinel patterns introduced
- [ ] CI integration test run completed (check Actions tab after pushing)
