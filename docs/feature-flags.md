# Feature Flags Registry

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
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

| Flag                            | Owner        | Default | Rollout plan                                                                                                                                                                                                | Kill switch                                                                                               | Created    | Expected removal                                | Touched surfaces                                                                          | Linked issue / PR                                                        |
| ------------------------------- | ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `AI_MEMORY_ENABLED`             | `@Skords-01` | `false` | dormant after PR1/2/3 land; activate via Railway env after `VOYAGE_API_KEY` provisioned. Per-source toggles роздільно. Runbook — [`docs/launch/ai-memory-activation.md`](./launch/ai-memory-activation.md). | Set `false` in Railway env → `remember()` / `recall()` no-op миттєво без redeploy-у callers               | 2026-05-01 | TBD (graduate after >30d stable in prod)        | `apps/server/src/modules/ai-memory/`, `/api/chat` (RAG), `/api/ai-memory/{recall,ingest}` | [ADR-0028](./adr/0028-pgvector-ai-memory.md) · #1305 (PR2) · #1347 (PR3) |
| `MONO_AI_MEMORY_INGEST_ENABLED` | `@Skords-01` | `false` | per-source gate для finyk-ingestion з mono webhook-у. Активація після `AI_MEMORY_ENABLED=true` і ≥1 день quiet master-flag-у.                                                                               | Set `false` → mono webhook припиняє enqueue jobs у `sergeant:ai-memory-ingest`; інші source-и продовжують | 2026-05-01 | TBD (об'єднати з master-flag-ом коли graduated) | `apps/server/src/modules/mono/webhook.ts`                                                 | [ADR-0028](./adr/0028-pgvector-ai-memory.md) · #1305                     |

## Rules

- Prefer one flag per rollout decision, not one flag per component.
- Default to `false` for experiments and `true` only for graduated-but-not-yet-removed behavior.
- Every flag needs an expiry date. Expired flags should be removed, not extended by default.
- If a flag is the primary rollback lever for a release, note that in the release PR and release playbook.
- A removed flag should also be deleted from this registry in the same PR.

## Related docs

- [add-feature-flag.md](./playbooks/add-feature-flag.md)
- [retire-feature-flag.md](./playbooks/retire-feature-flag.md)
- [release-policy.md](./governance/release-policy.md)
