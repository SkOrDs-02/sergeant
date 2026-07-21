# @sergeant/dualwrite-core

> **Last touched:** 2026-07-20 by @Skords-01. **Next review:** 2026-10-18.
> **Status:** Active

Платформо-нейтральне ядро dual-write фреймворку ([ADR-0073](../../docs/04-governance/adr/0073-dualwrite-generic-framework.md)) для 4 модульних пайплайнів LS/MMKV→SQLite (finyk, fizruk, nutrition, routine; web + mobile). Pure TypeScript, без DOM / React Native / Sentry — усе платформне (логер, телеметрія, uuid) ін'єктується споживачем.

## Що всередині

Міграцію завершено — усі примітиви нижче реалізовані й спожиті всіма 4 пайплайнами (web + mobile):

- **`applyDualWriteOps`** (`apply.ts`) — best-effort op-loop з per-op try/catch і лічильниками `{applied, errored, skipped}`. _(Історично жив у `apps/web/src/shared/lib/sqliteWriter/core.ts`; той файл **видалено** — web імпортує напряму з цього пакета.)_
- **`createApplyOps`** (`createApplyOps.ts`) — фабрика op-applier-ів з параметризованою error policy (`best-effort` / `atomic-batch`).
- **`TableSpec` + SQL-білдери** (`tableSpec.ts`: `buildLwwUpsert`, `buildDelete`, `buildReconcileChildren`) — LWW-guard `>` строго, як enum, не рядок.
- **`toIntOrNull` / `toRealOrNull`** (`convert.ts`) — nullable числові конвертери для SQLite bind-параметрів.
- Типи: `ApplyDualWriteOptions`, `ApplyDualWriteResult`, `ApplyOutcome`, `DualWriteLogger`.

> Boot-path orchestrator-фабрику (крок 10 з ADR-0073) **скасовано** (Open Q #6) — не додається.

## Інваріанти

- Жодних платформних залежностей у `src/` — mobile typecheck входить у гейт кожного міграційного кроку.
- LWW-семантика (ADR-0004): guard `excluded.updated_at > table.updated_at` — **строго новіший**, ніколи `>=`.
- Міграційні PR (кроки 2–9) не змінюють SQL-snapshot тести адаптерів — байт-ідентичність за визначенням.
