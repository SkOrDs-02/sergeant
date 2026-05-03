# ORM: Drizzle vs Kysely — що це і яку обрати

> **Last validated:** 2026-05-03. **Next review:** 2026-08-01.
> **Status:** Рекомендація підготовлена.
> **Owner:** @Skords-01

## Що таке ORM

**ORM (Object-Relational Mapping)** — це бібліотека, яка дозволяє працювати з базою даних через TypeScript/JavaScript код замість raw SQL.

Без ORM:

```ts
const result = await pool.query(
  "SELECT id, name, amount FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
  [userId],
);
// result.rows — масив untyped об'єктів, TypeScript не знає їх структуру
```

З ORM (Drizzle):

```ts
const transactions = await db
  .select()
  .from(transactionsTable)
  .where(eq(transactionsTable.userId, userId))
  .orderBy(desc(transactionsTable.createdAt))
  .limit(10);
// transactions — типізований масив Transaction[], autocomplete працює
```

**Головні переваги:**

- **Type safety** — TypeScript знає структуру кожної таблиці і кожного запиту
- **Автокомплект** — IDE підказує назви колонок, таблиць, операторів
- **Міграції** — автоматична генерація SQL міграцій при зміні схеми
- **Захист від SQL injection** — параметри автоматично ескейпляться

## Що зараз в Sergeant

У нас **два** query builder-и одночасно:

### Drizzle ORM (`drizzle-orm: ^0.45.2`)

- Використовується як **основний ORM** для бізнес-логіки
- Схема визначена в `packages/db-schema/` — type-safe таблиці
- Міграції генеруються через `drizzle-kit`
- Файли: `apps/server/src/drizzle.ts`, бізнес-логіка в `apps/server/src/modules/`

### Kysely (`kysely: ^0.28.14`)

- Використовується **тільки** для Better Auth адаптера
- Один файл: `apps/server/src/auth/encryptingAdapter.ts`
- Причина: `@better-auth/kysely-adapter` — офіційний адаптер Better Auth для PostgreSQL
- Kysely створює окремий connection через `PostgresDialect` (свій пул з'єднань)

## Проблема

Два query builder-и в одному проєкті:

1. **Когнітивне навантаження** — треба знати два різних API
2. **Два connection pool-и** — Drizzle і Kysely кожен тримають свій пул з'єднань до PostgreSQL
3. **Різна типізація** — Drizzle та Kysely по-різному визначають типи таблиць
4. **Залежності** — два великих пакети в `node_modules` замість одного

## Порівняння

| Критерій             | Drizzle                               | Kysely                              |
| -------------------- | ------------------------------------- | ----------------------------------- |
| Підхід               | ORM + Query Builder                   | Query Builder (чистий)              |
| SQL-подібність       | Дуже висока (SQL-like API)            | Висока (method chaining)            |
| Міграції             | `drizzle-kit` — автогенерація з схеми | Немає (потрібен окремий інструмент) |
| Схема                | Декларативна (TypeScript файли)       | Codegen з бази або ручна            |
| Популярність (2026)  | Зростає швидко, ~40k GitHub stars     | Стабільна, ~12k stars               |
| Bundle size          | 45 KB (gzip)                          | 30 KB (gzip)                        |
| PostgreSQL підтримка | Повна (pg, postgres.js, Neon)         | Повна (pg, postgres.js)             |
| Relations            | Так (relational queries)              | Ні (тільки joins)                   |
| Швидкість розробки   | Висока (schema → migration → query)   | Середня                             |

## Рекомендація: залишити Drizzle, позбутися Kysely

**Drizzle** — правильний вибір для Sergeant:

1. **Вже основний ORM** — вся бізнес-логіка, міграції, схема написані на Drizzle
2. **Міграції** — `drizzle-kit` автоматично генерує SQL з TypeScript схеми. Kysely цього не вміє
3. **SQL-like API** — максимально близький до raw SQL, мінімальна абстракція
4. **Активний розвиток** — часті релізи, зростаюча спільнота
5. **Better Auth** — має офіційний `@better-auth/drizzle-adapter` (існує!)

## План міграції Kysely → Drizzle

### Крок 1: Замінити Better Auth адаптер

Замість `@better-auth/kysely-adapter` використати `@better-auth/drizzle-adapter`:

```bash
pnpm --filter @sergeant/server add @better-auth/drizzle-adapter
pnpm --filter @sergeant/server remove @better-auth/kysely-adapter kysely
```

### Крок 2: Оновити encryptingAdapter.ts

Поточний файл `apps/server/src/auth/encryptingAdapter.ts` створює Kysely instance:

```ts
// ЗАРАЗ (Kysely):
import { Kysely, PostgresDialect } from "kysely";
import { kyselyAdapter } from "@better-auth/kysely-adapter";

const kysely = new Kysely<Record<string, unknown>>({
  dialect: new PostgresDialect({ pool }),
});
const inner = kyselyAdapter(kysely, { type: "postgres" });
```

Потрібно переписати на Drizzle:

```ts
// ПІСЛЯ (Drizzle):
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../drizzle.js";

const inner = drizzleAdapter(db, { provider: "pg" });
```

Решта файлу (encrypt/decrypt wrapping) залишається без змін — це обгортка поверх адаптера.

### Крок 3: Видалити Kysely

```bash
pnpm --filter @sergeant/server remove kysely @better-auth/kysely-adapter
```

### Крок 4: Перевірити

- Auth login/register працює
- OAuth token encryption/decryption працює
- Один connection pool замість двох
- `pnpm check` проходить

**Estimated effort:** 1-2 години. Зміни мінімальні — один файл.

## Корисні посилання

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Better Auth + Drizzle Guide](https://www.better-auth.com/docs/adapters/drizzle)
- [Kysely Docs](https://kysely.dev/)
