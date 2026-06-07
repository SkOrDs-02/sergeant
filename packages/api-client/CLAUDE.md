# Claude in packages/api-client

> **Last validated:** 2026-06-07 by @Skords-01. **Next review:** 2026-09-05.
> **Status:** Active. Sub-tree pointer. Repo-wide policy (hard rules, invariants) приходить з root `CLAUDE.md` / `AGENTS.md`, завантаженого при старті сесії. Цей пакет не має власного `AGENTS.md` — критичні для нього інваріанти живуть у [`apps/server/AGENTS.md`](../../apps/server/AGENTS.md) і продубльовані тут одним рядком, бо той файл у цьому subtree не вантажиться.

**Завантаж specialist skill `sergeant-server-api` перед роботою тут.**

Критичне:

- **API contract triplet (Hard Rule #3):** форма server-response ↔ типи `@sergeant/api-client` ↔ contract-тест рухаються разом. Регенеруй: `pnpm api:generate-openapi` + `pnpm api:generate-openapi-types`. CI-гейти: `pnpm api:check-openapi` + `pnpm api:check-openapi-types`.
- **Money / bigint (Hard Rule #1):** kopiykas як `number`; ніколи не лік `bigint`-string у client-типи.
- **`noUncheckedIndexedAccess: true`** по всьому монорепо — кожен `arr[i]` це `T | undefined`.
