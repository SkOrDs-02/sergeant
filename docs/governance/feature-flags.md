# Feature Flags Registry

> **Last validated:** 2026-05-09 by Devin (sync з `apps/{web,mobile}/src/core/lib/featureFlags.ts`: Stage 8 PR #057\* read-overlay quartet COMPLETE — PR #057r (drop `feature.routine.sqlite_v2.read_sqlite`) + PR #057f (drop `feature.fizruk.sqlite_v2.read_sqlite`) + PR #057k (drop `feature.finyk.sqlite_v2.read_sqlite`) + PR #057n (drop `feature.nutrition.sqlite_v2.read_sqlite`) — всі чотири read-overlay feature-flags видалені з web + mobile реєстрів; SQLite read overlay фірить unconditional once boot completes; LS/MMKV first-paint read залишається synchronous fallback до LS-reader drop у follow-up PR #057r-tombstone / PR #057f-tombstone / PR #057k-tombstone / PR #057n-tombstone (Routine tombstone gated on Stage 10 candidate — schema gap blocks LS-write removal). Stage 8 PR #056r (drop `feature.routine.sqlite_v2.dual_write`) + PR #056f (drop `feature.fizruk.sqlite_v2.dual_write`) + PR #056k (drop `feature.finyk.sqlite_v2.dual_write`) + PR #056n (drop `feature.nutrition.sqlite_v2.dual_write`) — чотири dual-write feature-flags видалені з web + mobile реєстрів; routine + fizruk + finyk + nutrition SQLite-mirror фірить unconditionally whenever a dual-write context is registered; LS-write залишається source-of-truth (Routine — для habits/tags/categories/prefs/pushups/habitOrder/completionNotes; Fizruk — для workouts/custom_exercises/measurements; Finyk — для hidden_accounts/hidden_transactions/budgets/subscriptions/assets/debts/receivables/custom_categories/manual_expenses/tx_categories/tx_splits/mono_debt_links/networth_history/prefs; Nutrition — для meals/pantries/prefs/recipes). **Next review:** 2026-08-01.
> **Status:** Active

Operational registry for release toggles, experiments, and kill switches in Sergeant. Code remains the executable source of truth; this file is the human-readable operating registry for rollout and cleanup.

## Registry contract

Every production flag must have:

- owner
- default value
- rollout plan
- kill-switch semantics
- created date
- expected removal date
- touched surfaces
- linked issue or PR

## Active flags

| Flag                                    | Owner        | Default | Rollout plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Kill switch                                                                                                                                                                                                  | Created    | Expected removal                                                                     | Touched surfaces                                                                                         | Linked issue / PR                                                                        |
| --------------------------------------- | ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `AI_MEMORY_ENABLED`                     | `@Skords-01` | `false` | dormant after PR1/2/3 land; activate via Railway env after `VOYAGE_API_KEY` provisioned. Per-source toggles роздільно. Runbook — [`docs/launch/tech/ai-memory-activation.md`](../launch/tech/ai-memory-activation.md).                                                                                                                                                                                                                                                                    | Set `false` in Railway env → `remember()` / `recall()` no-op миттєво без redeploy-у callers                                                                                                                  | 2026-05-01 | TBD (graduate after >30d stable in prod)                                             | `apps/server/src/modules/ai-memory/`, `/api/chat` (RAG), `/api/ai-memory/{recall,ingest}`                | [ADR-0028](../adr/0028-pgvector-ai-memory.md) · #1305 (PR2) · #1347 (PR3)                |
| `MONO_AI_MEMORY_INGEST_ENABLED`         | `@Skords-01` | `true`  | per-source gate для finyk-ingestion з mono webhook-у (PR-19 implementation; subordinate до master `AI_MEMORY_ENABLED`). Default `true` — після `AI_MEMORY_ENABLED=true` finyk-ingest стартує автоматично без додаткового toggle-у. Активація master-у — runbook [`docs/launch/tech/ai-memory-activation.md`](../launch/tech/ai-memory-activation.md). Decision-point Day 30 — [`docs/observability/runbook.md`](../observability/runbook.md#ai-memory-activation--day-30-decision-point). | Set `false` → mono webhook припиняє enqueue jobs у `ai-memory-ingest`; інші source-и продовжують. Метрика `ai_memory_ingest_enqueued_total{mode="source_disabled", source="finyk"}` фіксує skipped attempts. | 2026-05-01 | TBD (об'єднати з master-flag-ом коли graduated)                                      | `apps/server/src/modules/ai-memory/ingestQueue.ts`                                                       | [ADR-0028](../adr/0028-pgvector-ai-memory.md) · #1305 · PR-19                            |
| `feature.routine.sqlite_v2.read_sqlite` | `@Skords-01` | `true`  | Stage 4 PR #025 + Stage 8 PR #055r2 — completions читаються з SQLite (`routine_entries`) замість LS/MMKV blob. LS/MMKV-write залишається source-of-truth для habits/tags/categories/prefs/pushups/habitOrder/completionNotes (відсутні у SQLite-схемі рутини). Stage 8 PR #056r дропнув dual-write feature-flag gating — completion-mirror тепер unconditional whenever dual-write context registered.                                                                                    | Toggle off → reads повертаються на LS/MMKV path; SQLite дані лишаються.                                                                                                                                      | 2026-05-02 | TBD (gated on Stage 10 candidate — extend Routine SQLite schema до повного покриття) | `apps/web/src/modules/routine/lib/sqliteReader.ts`, `apps/web/src/modules/routine/lib/sqliteReadBoot.ts` | [storage-roadmap PR #025 + PR #055r2 + PR #056r](../planning/storage-roadmap.md) · #1407 |

## Rules

- Prefer one flag per rollout decision, not one flag per component.
- Default to `false` for experiments and `true` only for graduated-but-not-yet-removed behavior.
- Every flag needs an expiry date. Expired flags should be removed, not extended by default.
- If a flag is the primary rollback lever for a release, note that in the release PR and release playbook.
- A removed flag should also be deleted from this registry in the same PR.

## Related docs

- [add-feature-flag.md](../playbooks/add-feature-flag.md)
- [retire-feature-flag.md](../playbooks/retire-feature-flag.md)
- [release-policy.md](./release-policy.md)
