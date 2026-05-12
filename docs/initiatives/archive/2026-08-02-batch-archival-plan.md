# Batch Archival Plan — 2026-08-02

> **Last validated:** 2026-05-12 by Devin. **Next review:** 2026-08-02.
> **Status:** Planned (execute 2026-08-02)
> **Owner:** @Skords-01
> **ETA:** 2026-08-02 (3 hours estimated)
> **Related:** [initiatives/archive/README.md](./README.md), [AGENTS.md Hard Rules](../../../AGENTS.md#hard-rules-do-not-break)

Одночасна архівація 6 initiatives, які пройшли 90 днів від Done/Closed статусу без регресій.

---

## Ініціативи для архівації

| Initiative                      | Status | Done/Closed | Wait until | Canonical                                                       | Notes                                                         |
| ------------------------------- | ------ | ----------- | ---------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| **0001** Module decomposition   | Closed | 2026-05-04  | 2026-08-02 | Successor: 0013, Hard Rule #18                                  | max-lines: 600 guard active                                   |
| **0004** Server observability   | Done   | 2026-05-04  | 2026-08-02 | [ADR-0035](../../adr/0035-distributed-tracing-opentelemetry.md) | Sentry + OTel live; OTLP optional follow-up                   |
| **0005** AI cost (prompt cache) | Done   | 2026-05-04  | 2026-08-02 | [ADR-0039](../../adr/0039-anthropic-prompt-cache-policy.md)     | Prompt cache live; cost-alerts post-baseline                  |
| **0008** Platform hardening     | Closed | 2026-05-04  | 2026-08-02 | `RATE_LIMIT_POLICIES` registry                                  | RFC-9239 RateLimit-\* headers live                            |
| **0012** Perfect TS strictness  | Closed | 2026-05-04  | 2026-08-02 | Hard Rule #19, allowlist.json                                   | Phase 6a/6c/6e done; 6b/6d residual in allowlist              |
| **0007** Design-system tooling  | Done   | 2026-05-05  | 2026-08-03 | Storybook live deployment                                       | VRT scope → [ADR-0046](../../adr/0046-storybook-vrt-scope.md) |

---

## Pre-archival checklist (2026-08-01)

Execute day before archival to unblock 2026-08-02 batch-PR:

### 0001: Module decomposition

- [ ] Verify: Successor **0013** is `In progress` (should track allowlist drain to ≤2 files)
- [ ] Check: `docs/tech-debt/frontend.md` mentions 0001 only in historical context (not as active tracker)
- [ ] Check: Hard Rule #18 (`max-lines: 600`) is enforced in ESLint CI
- [ ] Check: `eslint.config.js` allowlist fully understood (11 files tracked)

### 0004: Server observability

- [ ] Verify: Sentry + OTel running in production
- [ ] Check: All grafana dashboards pinned / documented in [docs/observability/](../../observability/)
- [ ] Check: Optional follow-up (RED-deltas, AI-latency spans) documented in follow-ups.md
- [ ] Result: Move carry-over to [ADR-0035](../../adr/0035-distributed-tracing-opentelemetry.md)

### 0005: AI cost (prompt cache)

- [ ] Verify: Prompt cache live on chat.ts (2 breakpoints)
- [ ] Check: `ai_tokens_total`, `ai_cost_estimate_usd_total`, `anthropic_prompt_cache_hit_total` metrics active
- [ ] Check: Grafana `ai-cost.json` dashboard deployed
- [ ] Result: Cost-based alert follow-up documented in [follow-ups.md](../follow-ups.md) (trigger: baseline-week measurement)

### 0008: Platform hardening

- [ ] Verify: `RATE_LIMIT_POLICIES` registry live in `apps/server/src/`
- [ ] Check: RFC-9239 `RateLimit-*` headers returned from /api/\* endpoints
- [ ] Check: `/startupz` + nested probes + health endpoint live
- [ ] Check: Renovate + Dependabot configured (ADR-0044)
- [ ] Result: All carry-overs (sigstore, per-route migrations) documented in file § Що НЕ увійшло

### 0012: Perfect TS strictness

- [ ] Verify: `pnpm strict:coverage` reports 13/13 (100%)
- [ ] Check: Phase 6a/6c/6e fully deployed to production
- [ ] Check: Phase 6b/6d allowlist in `tools/tsconfig-guard/allowlist.json` with `expires: 2026-09-30`
- [ ] Check: No new production files added to allowlist after 2026-05-04
- [ ] Result: Phase 6a/6b/6d cleanup documented as post-archival follow-up

### 0007: Design-system tooling

- [ ] Verify: Storybook deployed to GitHub Pages (https://skords-01.github.io/Sergeant/)
- [ ] Check: `shared/ui` coverage 100% (37/37 stories)
- [ ] Check: `sergeant-design/require-stories-for-ui-components` ESLint rule active
- [ ] Check: [ADR-0046](../../adr/0046-storybook-vrt-scope.md) describes VRT scope
- [ ] Result: Phase 2 ESLint rule already merged (PR #1812)

---

## Archival execution (2026-08-02)

### Step 1: Batch file move (5 min)

```bash
cd /home/user/Sergeant

# Rename locally (pre-commit to ensure names are correct)
git mv docs/initiatives/0001-module-decomposition.md \
       docs/initiatives/archive/_0001-module-decomposition.md
git mv docs/initiatives/0004-server-observability.md \
       docs/initiatives/archive/_0004-server-observability.md
git mv docs/initiatives/0005-ai-cost-and-prompt-cache.md \
       docs/initiatives/archive/_0005-ai-cost-and-prompt-cache.md
git mv docs/initiatives/0008-platform-hardening.md \
       docs/initiatives/archive/_0008-platform-hardening.md
git mv docs/initiatives/0012-perfect-strictness-rollout.md \
       docs/initiatives/archive/_0012-perfect-strictness-rollout.md
git mv docs/initiatives/0007-design-system-tooling.md \
       docs/initiatives/archive/_0007-design-system-tooling.md
```

### Step 2: Update docs/initiatives/README.md (10 min)

Для кожної ініціативи, перенести рядок із `## Нещодавно завершені` → `## Архів`:

```markdown
- [archive/\_0001-module-decomposition.md](./archive/_0001-module-decomposition.md) — archived 2026-08-02; successor [0013-module-decomposition-round-2.md](./0013-module-decomposition-round-2.md), Hard Rule #18 (`max-lines: 600`) live
- [archive/\_0004-server-observability.md](./archive/_0004-server-observability.md) — archived 2026-08-02; [ADR-0035](../adr/0035-distributed-tracing-opentelemetry.md) + Sentry production, OTLP optional
- [archive/\_0005-ai-cost-and-prompt-cache.md](./archive/_0005-ai-cost-and-prompt-cache.md) — archived 2026-08-02; [ADR-0039](../adr/0039-anthropic-prompt-cache-policy.md) production policy
- [archive/\_0008-platform-hardening.md](./archive/_0008-platform-hardening.md) — archived 2026-08-02; `RATE_LIMIT_POLICIES` registry production, RFC-9239 live
- [archive/\_0012-perfect-strictness-rollout.md](./archive/_0012-perfect-strictness-rollout.md) — archived 2026-08-02; Hard Rule #19 active, allowlist expires 2026-09-30
- [archive/\_0007-design-system-tooling.md](./archive/_0007-design-system-tooling.md) — archived 2026-08-03; Storybook live, [ADR-0046](../adr/0046-storybook-vrt-scope.md) VRT scope
```

### Step 3: Verification (5 min)

```bash
pnpm lint:initiative-status-sync      # Should pass
pnpm docs:check-links                 # Should find no broken links
pnpm lint:tech-debt-freshness         # Should pass
git status                            # Should show 6 renamed files + 1 modified
```

### Step 4: Commit (3 min)

```bash
git commit -m "docs(initiatives): archive batch 2026-08-02 (6 completed initiatives)

Archive 6 Done/Closed initiatives after ≥90 days without regressions:

- 0001-module-decomposition → Hard Rule #18 (max-lines: 600)
- 0004-server-observability → ADR-0035 + Sentry production
- 0005-ai-cost-and-prompt-cache → ADR-0039 prompt cache policy
- 0008-platform-hardening → RATE_LIMIT_POLICIES registry live
- 0012-perfect-strictness-rollout → Hard Rule #19 + allowlist
- 0007-design-system-tooling → Storybook live + ADR-0046

All canonical rules, ADRs, lint-rules continue to live in AGENTS.md / docs/governance/.
Archive README updated with batch schedule.

Related: initiative-status-sync audit 2026-05-11.

https://claude.ai/code/session_01GGmBJpcYdwRJKAqJSxn9Rt"
```

### Step 5: Push & PR (5 min)

```bash
git push -u origin claude/update-docs-tasks-Y9RNJ
gh pr create \
  --title "docs(initiatives): archive batch 2026-08-02" \
  --body "Batch archival of 6 Done/Closed initiatives after ≥90-day stabilization window.

See [archive/README.md](./docs/initiatives/archive/README.md) for prep details.

All canonical rules/ADRs/lint-rules remain active in AGENTS.md / docs/governance/.
File renames preserve slug IDs for backward references (TODO-markers, hard-rules.json)."
```

---

## Post-archival (2026-08-03)

- [ ] Verify: CI gates pass (lint:initiative-status-sync, docs:check-links)
- [ ] Merge: Batch archival PR
- [ ] Update: [archive/README.md](./README.md) status → `Active archive` (remove `Archive prep`)
- [ ] Notify: Spike post-archival carry-over items (optional OTLP, cost-alerts, phase-6 cleanup)

---

## Rollback plan

Якщо архівація не вдалась (e.g., broken links):

```bash
git reset --hard HEAD~1
git push -f origin claude/update-docs-tasks-Y9RNJ  # NOT to main
# Diagnose, fix, retry
```

Но git-mv не має сайд-ефектів, тому навряд чи буде потрібно.

---

## Related docs

- [initiatives/README.md](../README.md) — master schedule + lifecycle rules
- [initiatives/archive/README.md](./README.md) — archive policy + this batch schedule
- [docs/governance/doc-freshness.md](../../governance/doc-freshness.md) — freshness marker policy
