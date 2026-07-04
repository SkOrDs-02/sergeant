# @sergeant/dualwrite-core

> **Last touched:** 2026-07-04 by @dimastahov16012003. **Next review:** 2026-10-02.
> **Status:** Active

Платформо-нейтральне ядро dual-write фреймворку ([ADR-0073](../../docs/04-governance/adr/0073-dualwrite-generic-framework.md)) для 4 модульних пайплайнів LS/MMKV→SQLite (finyk, fizruk, nutrition, routine; web + mobile). Pure TypeScript, без DOM / React Native / Sentry — усе платформне (логер, телеметрія, uuid) ін'єктується споживачем.

## Що всередині (крок 1)

- **`applyDualWriteOps`** — best-effort op-loop з per-op try/catch і лічильниками `{applied, errored, skipped}`, перенесений з `apps/web/src/shared/lib/dualWrite/core.ts` (web-шлях лишився re-export-ом).
- **`toIntOrNull` / `toRealOrNull`** — nullable числові конвертери для SQLite bind-параметрів.
- Типи: `ApplyDualWriteOptions`, `ApplyDualWriteResult`, `ApplyOutcome`, `DualWriteLogger`.

## Що приїде наступними кроками (ADR-0073 § Decision)

- `createApplyOps` з параметризованою error policy (`best-effort` / `atomic-batch`).
- `TableSpec` + SQL-білдери (`buildLwwUpsert`, `buildDelete`, `buildReconcileChildren`) — LWW-guard `>` строго, як enum, не рядок.
- Orchestrator-фабрика (registration-контекст, parity-probe, телеметрія-ін'єкція).

## Інваріанти

- Жодних платформних залежностей у `src/` — mobile typecheck входить у гейт кожного міграційного кроку.
- LWW-семантика (ADR-0004): guard `excluded.updated_at > table.updated_at` — **строго новіший**, ніколи `>=`.
- Міграційні PR (кроки 2–9) не змінюють SQL-snapshot тести адаптерів — байт-ідентичність за визначенням.
