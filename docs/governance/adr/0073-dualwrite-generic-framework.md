# ADR-0073: Shared dual-write core for module persistence

- **Status:** Accepted
- **Date:** 2026-07-03
- **Last validated:** 2026-10-18 by @claude
- **Next review:** 2027-03-04
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0011](./0011-local-first-storage.md), [ADR-0064](./0064-syncv2-modular-refactor.md), [`packages/dualwrite-core/`](../../../packages/dualwrite-core/), [`docs/engineering/architecture/domain-invariants.md`](../../engineering/architecture/domain-invariants.md)

## Context

Web and mobile preserve local-first module state through four domain-specific
SQLite writer families: finyk, fizruk, nutrition, and routine. Their domain
operations deliberately differ, but their error policy, LWW guard mechanics,
SQL execution contract, and telemetry must not drift independently.

## Decision

`@sergeant/dualwrite-core` is the shared platform-neutral mechanism for
applying operation batches. It provides `createApplyOps`, standard result
accounting, injectable logging, and the two supported error policies:
best-effort and atomic-batch. Web and mobile adapters use that core while each
domain retains ownership of its op shapes, SQL, conflict semantics, timestamps,
and side effects.

The framework is intentionally not a generic domain model. Hard delete,
tombstone, child-cascade, timestamp, and LWW/no-guard choices remain explicit
in each adapter and are verified by SQL/result tests.

**Поправка 2026-10-18 (data-15, рішення власника): явний вибір soft-delete для
finyk-адаптерів.** `finyk_tx_categories`, `finyk_tx_splits`,
`finyk_mono_debt_links` і `finyk_networth_history` більше не hard-delete:
DeleteSpec `soft` (`deleted_at` + `updated_at`, LWW-guard `updated_at < ?`), як
у `finyk_budgets`. Причина: hard DELETE не лишає часу видалення, тож
запізнілий upsert зі старого пристрою (insert@T1 після delete@T2)
воскрешав рядок через `INSERT ... ON CONFLICT`. Tombstone відхиляє такий
запис як `lww_conflict`; новіший запис воскрешає (`deleted_at = NULL`).
Серверна міграція 156 і клієнтська `005_finyk_soft_delete_tombstones`; читачі
фільтрують `deleted_at IS NULL`. Правило для нових адаптерів: hard delete
припустимий лише там, де застарілий upsert не може прийти (локальна таблиця
поза синком); для синхронізованих таблиць за замовчуванням soft.

## Consequences

Кожен новий читач soft-таблиці зобовʼязаний фільтрувати `deleted_at IS NULL`
(sqliteReader, експорт/GDPR, бекап); забутий фільтр показує видалене.

New dual-write paths must reuse the core only for shared mechanics and add
parity/replay tests for the domain semantics they own. A change to a shared
policy needs an adapter-impact review across web and mobile; copying a server
sync apply handler into a client is not an acceptable shortcut.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#508](https://github.com/SkOrDs-02/sergeant/pull/508) | fix(docs): reconcile canonical docs with current repo                                                                   | 2026-07-29 |
| [#334](https://github.com/SkOrDs-02/sergeant/pull/334) | docs(root): reconcile docs with code after 2026-07-20 audit (Railway->Coolify, CI gates, dual-write, domain invariants) | 2026-07-21 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
