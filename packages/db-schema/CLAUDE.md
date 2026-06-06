# Claude in packages/db-schema

> **Status:** Active. Sub-tree pointer. Repo-wide policy (hard rules, invariants) приходить з root `CLAUDE.md` / `AGENTS.md`, завантаженого при старті сесії. Цей пакет не має власного `AGENTS.md` — критичні для нього інваріанти живуть у [`apps/server/AGENTS.md`](../../apps/server/AGENTS.md) і продубльовані тут одним рядком, бо той файл у цьому subtree не вантажиться.

**Завантаж specialist skill `sergeant-data-and-migrations` перед роботою тут.**

Критичне:

- **Migrations (Hard Rule #4):** послідовна нумерація, без прогалин. Two-phase для `DROP` (спочатку deploy writer, що ігнорує колонку → ship міграцію → прибери writer). Генератор: `pnpm gen` → `migration`. Lint-гейт: `pnpm lint:migrations`.
- **Money / bigint (Hard Rule #1):** kopiykas як `number` (minor units); `pg` повертає `bigint` як string — коерс у serializer, ніколи не лік у API/RQ.
- **Time:** `Europe/Kyiv` для day boundaries.
