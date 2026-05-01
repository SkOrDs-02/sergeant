# Playbook: Add API Endpoint

> **Last validated:** 2026-05-01 by @dmytro.s.stakhov. **Next review:** 2026-07-30.
> **Status:** Active

**Trigger:** "Додати новий endpoint в `apps/server`" / нова API-функціональність / зміна REST surface, яку будуть споживати web, mobile або console surfaces.

## Owner surface

- Primary surface: `apps/server`
- Coupled surface: `packages/api-client`
- Governing skill: `sergeant-server-api`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-server-api`.
- Якщо endpoint потребує schema change, спочатку виконай [`add-sql-migration.md`](./add-sql-migration.md).
- Звір hard rules #1 і #3 в [AGENTS.md](../../AGENTS.md).

## Steps

### 1. Визнач контракт до коду

- Який route, method, auth mode і response shape потрібні.
- Який модуль володіє endpoint.
- Які клієнти споживатимуть endpoint.

Якщо endpoint змінює product behavior, занотуй короткий spec у `docs/superpowers/specs/` або в PR description.

### 2. Додай або онови server handler

- Розмісти route в правильному module subtree.
- Валідовуй `params`, `query` і `body` через `zod`.
- Тримай business logic в module layer, а не прямо в router glue.
- У serializer завжди роби `bigint -> number`.

### 3. Зареєструй route і auth semantics

- Додай route в правильний router.
- Якщо endpoint потребує session, підключи відповідний auth middleware.
- Якщо endpoint public, явно перевір rate limit і abuse surface.

### 4. Синхронізуй client contract

- Онови `packages/api-client/src/endpoints/*`.
- Збери triplet: server response shape, `api-client` type, test.
- Якщо web/mobile використовує React Query, далі зміни мають іти через відповідний hook/playbook, а не ad-hoc fetch.

### 5. Додай або онови тести

- Unit/integration тести на happy path.
- Негативний тест на invalid input або auth failure.
- Regression check на shape, особливо для числових полів і дат.

### 6. Онови docs, якщо endpoint став канонічним surface

- API doc / architecture note / playbook лише якщо це новий повторюваний спосіб роботи або новий contract boundary.

## Verification

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm api:check-openapi`
- [ ] `packages/api-client` синхронізовано з сервером
- [ ] `bigint` не витікає у відповіді як `string`

## When not to use this playbook

- Зміна лише в UI-споживанні існуючого endpoint.
- Потрібна тільки DB migration без нового HTTP surface.
- Працюєш з HubChat tool або internal console agent, а не public/app API.

## Related playbooks and skills

- [add-sql-migration.md](./add-sql-migration.md)
- [fix-failing-ci.md](./fix-failing-ci.md)
- Skill: `sergeant-server-api`
- Skill: `sergeant-data-and-migrations`
