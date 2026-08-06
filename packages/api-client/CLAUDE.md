# Claude in packages/api-client

> **Last touched:** 2026-08-06 by @claude. **Next review:** 2026-11-04.
> **Status:** Active. Sub-tree pointer. Repo-wide policy (hard rules, invariants) приходить з root `CLAUDE.md` / `AGENTS.md`, завантаженого при старті сесії. Цей пакет не має власного `AGENTS.md` — критичні для нього інваріанти живуть у [`apps/server/AGENTS.md`](../../apps/server/AGENTS.md) і продубльовані тут одним рядком, бо той файл у цьому subtree не вантажиться.

**Завантаж specialist skill `sergeant-server-api` перед роботою тут.**

Критичне:

- **API contract triplet (Hard Rule #3):** форма server-response ↔ типи `@sergeant/api-client` ↔ contract-тест рухаються разом. Регенеруй spec: `pnpm api:generate-openapi`. CI-гейт: `pnpm api:check-openapi`. (Generated TS-типи зі спеки retired 2026-08-06 — типи тут hand-written у `src/endpoints/*`.)
- **Money / bigint (Hard Rule #1):** kopiykas як `number`; ніколи не лік `bigint`-string у client-типи.
- **`noUncheckedIndexedAccess: true`** по всьому монорепо — кожен `arr[i]` це `T | undefined`.
