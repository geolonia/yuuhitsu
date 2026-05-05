# yuuhitsu Release Process

This document describes the standard release procedure for yuuhitsu, including canary publishing, monitoring, and rollback steps.

## Overview: Canary-First Release Strategy

All releases use a **canary → monitoring → latest promotion** flow to catch LLM-related failures before they reach all users:

```
main merge → npm publish --tag next (canary) → 1-week dogfood → npm dist-tag add ... latest
```

## Step-by-Step Release Procedure

### 1. Pre-publish Checklist

Before publishing **any** version:

- [ ] CI all green: unit tests + integration tests + lint + typecheck
- [ ] Integration tests pass with 13+ fixtures (`npm run test:integration`)
- [ ] Fixture 4-axis coverage checklist reviewed (see `tests/INTEGRATION_TESTS.md`)
- [ ] CodeRabbit Actionable = 0 (verify via GitHub GraphQL `reviewThreads(unresolved: true)`)
- [ ] Phase 0 PoC completed for LLM-related changes (see `CONTRIBUTING.md`)
- [ ] `CHANGELOG.md` updated with new version entry
- [ ] `package.json` version bumped

### 2. Canary Publish (npm tag `next`)

```sh
# Bump version (do NOT push the tag yet)
npm version 0.1.X --no-git-tag-version
git add package.json package-lock.json pnpm-lock.yaml
git commit -m "chore: bump to 0.1.X"

# Create and push the tag
git tag v0.1.X
git push origin main --tags

# Publish as canary (NOT as latest)
npm publish --tag next
```

After publishing, verify:

```sh
npm dist-tag ls @geolonia/yuuhitsu
# Should show: next: 0.1.X
# Should still show: latest: 0.1.<previous>
```

### 3. Canary Monitoring (1 week)

During the canary period, run dogfood testing against a real document repository:

1. In geonicdb-docs (or equivalent), bump yuuhitsu to the canary version:
   ```sh
   npm install @geolonia/yuuhitsu@next
   ```
2. Run 5+ translation sync cycles over the monitoring week
3. Watch for any of the following failure signals:
   - Sentinel patterns (`<!--BB-->`) appearing in output files
   - List items collapsed onto a single line
   - Heading/HR boundaries lost
   - `Layer 3 fallback applied` count exceeding baseline

**Promotion criteria**: No failures observed across 5+ sync runs over 1 week.

### 4. Promote Canary to Latest

Once monitoring passes:

```sh
npm dist-tag add @geolonia/yuuhitsu@0.1.X latest
npm dist-tag rm @geolonia/yuuhitsu next
```

Verify:

```sh
npm dist-tag ls @geolonia/yuuhitsu
# Should show: latest: 0.1.X
# next tag should be gone
```

### 5. Post-publish Monitoring (1 week)

Continue monitoring after latest promotion for 1 additional week. If issues arise, follow the rollback procedure below.

---

## Rollback Procedure

### If canary fails (before latest promotion)

```sh
# Remove the canary tag — users on latest are unaffected
npm dist-tag rm @geolonia/yuuhitsu next

# Deprecate the failed canary version with a clear message
npm deprecate @geolonia/yuuhitsu@0.1.X "Rolled back due to <reason>. See https://github.com/geolonia/yuuhitsu/issues/<N>"
```

### If latest has already been promoted and failure is detected

```sh
# Point latest back to the previous stable version
npm dist-tag add @geolonia/yuuhitsu@0.1.<previous> latest

# Deprecate the broken version
npm deprecate @geolonia/yuuhitsu@0.1.X "Rolled back due to <reason>. Use 0.1.<previous> instead. See https://github.com/geolonia/yuuhitsu/issues/<N>"
```

### Hotfix releases

For critical hotfixes, the canary period may be shortened to 24–48 hours if the fix is narrowly scoped and integration tests pass fully. Document the rationale in the release commit.

---

## Post-mortem Template

When a publish failure occurs, create a post-mortem file at:
`queue/reports/post_mortem_<version>_YYYYMMDD.yaml`

```yaml
version: "0.1.X"
date: "YYYY-MM-DD"
summary: "One-line description of the failure"

timeline:
  - "YYYY-MM-DDTHH:MM: failure detected (describe how)"
  - "YYYY-MM-DDTHH:MM: root cause identified"
  - "YYYY-MM-DDTHH:MM: fix deployed"

root_cause:
  why_1: ""
  why_2: ""
  why_3: ""
  why_4: ""
  why_5: ""
  conclusion: ""

what_worked:
  - ""

what_failed:
  - ""

lessons_learned:
  - ""

action_items:
  - cmd: "cmd_NNN"
    description: ""

memory_file_updates:
  - ""
```

---

## Version Numbering

yuuhitsu follows [Semantic Versioning](https://semver.org/). Given the current `0.1.x` series:

- Patch (`0.1.x → 0.1.x+1`): bug fixes, no behaviour change
- Minor (`0.1.x → 0.2.0`): new features, backward-compatible
- Major (`0.x.y → 1.0.0`): breaking API changes

LLM-related sentinel and prompt changes are treated as **patch** increments when they are backward-compatible fixes, and **minor** increments when they introduce new sentinel formats or behaviour changes.
