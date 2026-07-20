# Initiatives — Архів

> **Last validated:** 2026-07-20 by @cursoragent. **Next review:** 2026-10-18.
> **Status:** Active — каталог архіву (батчі 2026-05-13 … 2026-07-20).

Цей каталог тримає **архівовані ініціативи** — файли, що пройшли lifecycle до `Closed`/`Done`/`Archived` і перенесені з `docs/90-work/initiatives/`. Default gate — ≥90 днів без регресій; **fast-forward** (skip 90d) — за рішенням founder-а. Redirect-stub-и — у [`../README.md` § Архів](../README.md#архів).

## Чим це не є

- **Не tombstone для Withdrawn-ініціатив.** `Withdrawn` лишається в активному списку у `../README.md`.
- **Не source of truth для канонічних правил.** Hard Rules / ADR / lint — у [`AGENTS.md`](../../../../AGENTS.md) і [`docs/04-governance/governance/`](../../../04-governance/governance). Архів — історичний контекст.

## Як архівувати ініціативу

Покрокова процедура — у [`../README.md` § Гайдлайн → крок 6](../README.md#гайдлайн-для-авторів). Коротко: `git mv` сюди з `_NNNN-` префіксом → stub у `../README.md` → `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` + `pnpm lint:archive-move-depth`.

## Batch archival schedule

### ✅ 2026-05-13 (executed early)

| Initiative                      | Done/Closed | Successor / Canonical                                                                                  | Archive path                                                                   |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **0001** Module decomposition   | 2026-05-04  | Hard Rule #18 + Successor [0013](./_0013-module-decomposition-round-2.md)                              | [`_0001-module-decomposition.md`](./_0001-module-decomposition.md)             |
| **0004** Server observability   | 2026-05-04  | [ADR-0035](../../../04-governance/adr/0035-distributed-tracing-opentelemetry.md)                       | [`_0004-server-observability.md`](./_0004-server-observability.md)             |
| **0005** AI cost (prompt cache) | 2026-05-04  | [ADR-0039](../../../04-governance/adr/0039-anthropic-prompt-cache-policy.md)                           | [`_0005-ai-cost-and-prompt-cache.md`](./_0005-ai-cost-and-prompt-cache.md)     |
| **0007** Design-system tooling  | 2026-05-05  | Storybook live deploy + [ADR-0046](../../../04-governance/adr/0046-storybook-vrt-scope.md)             | [`_0007-design-system-tooling.md`](./_0007-design-system-tooling.md)           |
| **0008** Platform hardening     | 2026-05-04  | `RATE_LIMIT_POLICIES` registry + [ADR-0044](../../../04-governance/adr/0044-renovate-vs-dependabot.md) | [`_0008-platform-hardening.md`](./_0008-platform-hardening.md)                 |
| **0009** Agent-OS hardening     | 2026-05-09  | AGENTS.md slim + `docs/04-governance/governance/rules/`                                                | [`_0009-agent-os-hardening.md`](./_0009-agent-os-hardening.md)                 |
| **0012** Perfect TS strictness  | 2026-05-04  | Hard Rule #19 + `tools/tsconfig-guard/allowlist.json`                                                  | [`_0012-perfect-strictness-rollout.md`](./_0012-perfect-strictness-rollout.md) |

### ✅ 2026-06-01 (executed early)

| Initiative                      | Done/Closed | Successor / Canonical                                                                                                      | Archive path                                                                                                   |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **0002** Mobile platform        | 2026-05-18  | [ADR-0052](../../../04-governance/adr/0052-mobile-strategy-capacitor-primary.md) + [0010](../0010-revenue-first-launch.md) | [`_0002-mobile-platform-decision.md`](./_0002-mobile-platform-decision.md)                                     |
| **0011** Foundation adoption    | 2026-05-20  | Hard Rule #15 + [email-verification-sweep](../../../01-product/launch/email-verification-sweep.md)                         | [`_0011-foundation-adoption-and-process-discipline.md`](./_0011-foundation-adoption-and-process-discipline.md) |
| **0013** Module decomp. round 2 | 2026-05-29  | Hard Rule #18 + [tech-debt/frontend](../../tech-debt/frontend.md)                                                          | [`_0013-module-decomposition-round-2.md`](./_0013-module-decomposition-round-2.md)                             |
| **0014** Knowledge graph        | 2026-05-15  | [ADR-0058](../../../04-governance/adr/0058-knowledge-graph-schema.md) + generated catalogs                                 | [`_0014-knowledge-graph-and-catalogs.md`](./_0014-knowledge-graph-and-catalogs.md)                             |
| **0016** CHANGELOG release-cut  | 2026-05-29  | `changelog:cut` script + [CHANGELOG](../../../../CHANGELOG.md)                                                             | [`_0016-changelog-release-cut.md`](./_0016-changelog-release-cut.md)                                           |

### ✅ 2026-06-14 / 2026-06-15

| Initiative                        | Archive path                                                               |
| --------------------------------- | -------------------------------------------------------------------------- |
| **0018** Agent semantic retrieval | [`_0018-agent-semantic-retrieval.md`](./_0018-agent-semantic-retrieval.md) |
| **0019** Agent routing            | [`_0019-agent-routing.md`](./_0019-agent-routing.md)                       |
| **0020** Agent decisions log      | [`_0020-agent-decisions-log.md`](./_0020-agent-decisions-log.md)           |

### ✅ 2026-07-20 (fast-forward — docs-drift reconcile)

90-day gate skipped за рішенням founder-а:

| Initiative / artifact              | Status    | Canonical / note                                 | Archive path                                                                         |
| ---------------------------------- | --------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **0003** Sync v2 rollout           | Closed    | ADR-0043/0047 + `apps/server/src/routes/sync.ts` | [`_0003-sync-v2-rollout-and-v1-sunset.md`](./_0003-sync-v2-rollout-and-v1-sunset.md) |
| **0017** Hub tabs mount perf       | Closed    | Re-open only if aggregateReport P95 regresses    | [`_0017-hub-tabs-mount-perf.md`](./_0017-hub-tabs-mount-perf.md)                     |
| **0021** React hooks v7 cleanup    | Done      | `eslint.baseline.js` react-hooks v7 `"error"`    | [`_0021-react-hooks-v7-cleanup.md`](./_0021-react-hooks-v7-cleanup.md)               |
| session-log 0018 (find / semantic) | Reference | Measurement logs                                 | [`session-log-0018-*.md`](./session-log-0018-agent-find-measurement-2026-06-08.md)   |

Паралельно: Closed stack-pulse картки → [`../stack-pulse-2026-05/archive/`](../stack-pulse-2026-05/archive/).

## Поточний вміст

~19 archived initiative files + session logs + batch plan — див. таблиці вище. Канонічні правила живуть у [`AGENTS.md`](../../../../AGENTS.md) + [`docs/04-governance/governance/`](../../../04-governance/governance).
