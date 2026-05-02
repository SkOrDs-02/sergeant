# Playbook: Add Monobank Event Handler

> **Last validated:** 2026-04-27 by @Skords-01. **Next review:** 2026-07-26.
> **Status:** Active

**Trigger:** "Треба обробити нову подію X від Monobank" / новий тип webhook event / новий статус транзакції від Monobank API.

---

## Steps

### 1. Оновити схему події в server

Знайти типи та схеми в `apps/server/src/modules/monobank/`:

```bash
# Перевірити поточні типи
cat apps/server/src/modules/mono/types.ts

# Перевірити zod-schema
cat apps/server/src/modules/mono/http/schemas.ts
```

- Додати новий case / поле в DTO (`types.ts`).
- Оновити zod-schema (`http/schemas.ts`) для валідації вхідного payload.

### 2. Додати handler

Додати гілку обробки у `apps/server/src/modules/mono/webhook.ts`:

- Новий `case` або `if`-блок для нового типу події.
- Бізнес-логіка: що робити з подією (insert / update / notify).
- **Обов'язково:** якщо handler зберігає дані в DB — перевірити bigint→number coercion у serializer (AGENTS.md rule #1, [#708](https://github.com/Skords-01/Sergeant/issues/708)).

### 3. SQL-міграція (якщо потрібна)

Якщо нова подія потребує нового поля або таблиці в БД:

```bash
# Перевірити поточний номер міграції
ls apps/server/src/migrations/

# Створити наступний файл (sequential, без gaps — AGENTS.md rule #4)
touch apps/server/src/migrations/NNN_mono_<desc>.sql
```

- Номер міграції — наступний після останнього існуючого.
- Ім'я: `NNN_mono_<short_desc>.sql`.

### 4. Оновити типи в `packages/api-client`

Оновити types у `packages/api-client/src/endpoints/mono.ts` (AGENTS.md rule #3):

- Додати нові поля / типи у response або request interfaces.
- Переконатись що типи збігаються з серверним DTO.

### 5. Snapshot-тест на serializer

Додати або оновити snapshot-тест для перевірки що bigint поля коерсяться у number:

```bash
# Запустити існуючі тести для перевірки
pnpm --filter @sergeant/server exec vitest run apps/server/src/modules/mono/
```

Тест має перевіряти:

- Новий тип події коректно серіалізується.
- Bigint-поля повертаються як `number`, а не `string` (rule #1, [#708](https://github.com/Skords-01/Sergeant/issues/708)).
- Невалідний payload відхиляється zod-schema.

### 6. Оновити `apps/web` (якщо UI використовує подію)

Якщо нова подія впливає на UI:

- Оновити React Query hooks в `apps/web/src/modules/finyk/`.
- Використовувати **тільки** централізовані key factories з `queryKeys.ts` (AGENTS.md rule #2).
- Додати UI-компонент або оновити існуючий для відображення нового типу події.

Якщо UI не потрібен — пропустити цей крок.

### 7. Оновити документацію

- Оновити `docs/integrations/monobank-roadmap.md` якщо нова подія змінює архітектурну діаграму.
- Оновити `docs/integrations/monobank-roadmap.md` якщо подія була у плані.

### 8. Створити PR

```bash
pnpm lint       # має бути зеленим
pnpm typecheck  # має бути зеленим
```

- Branch: `devin/<unix-ts>-feat-mono-<event-name>`
- Commit: `feat(server): add Monobank <event_type> event handler`
- PR description:
  - Який тип події додано і для чого.
  - Чи є міграція.
  - Які endpoints / типи оновлено.

---

## Verification

- [ ] `pnpm lint` — green
- [ ] `pnpm typecheck` — green
- [ ] Snapshot-тест на serializer проходить (bigint→number coercion)
- [ ] Zod-schema відхиляє невалідний payload
- [ ] Типи в `packages/api-client` відповідають серверному DTO
- [ ] React Query keys — через factories з `queryKeys.ts` (якщо є UI-зміни)
- [ ] SQL-міграція sequential, без gaps (якщо є)
- [ ] Документація оновлена

## Notes

- **bigint→number coercion** (AGENTS.md rule #1) — `pg` driver повертає bigint як string. Завжди коерсити в serializer. Див. [#708](https://github.com/Skords-01/Sergeant/issues/708).
- **API contract** (AGENTS.md rule #3) — зміна response shape → оновити `packages/api-client` + тест.
- **Sequential migrations** (AGENTS.md rule #4) — номери `NNN_*.sql` без gaps, pre-deploy job копіює через `build.mjs`.
- Monobank rate limit: `/personal/statement` — 1 req/60s/token. Webhook handler не має цього обмеження.

## See also

- [monobank-roadmap.md](../integrations/monobank-roadmap.md) — план покращень Monobank-інтеграції
- [monobank-roadmap.md](../integrations/monobank-roadmap.md) — архітектура Monobank-інтеграції та roadmap
- [AGENTS.md](../../AGENTS.md) — hard rules
- [cleanup-dead-code.md](cleanup-dead-code.md) — якщо старий handler потрібно видалити
