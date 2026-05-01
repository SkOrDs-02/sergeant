# ADR-0014: `bigint` → `number` coercion у API-серіалізаторах

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`AGENTS.md`](../../AGENTS.md) §1 — hard rule "coerce bigint to number in serializers".
  - [`packages/api-client/src/endpoints/`](../../packages/api-client/src/endpoints/) — клієнтські типи API responses.
  - [`apps/server/src/modules/`](../../apps/server/src/modules/) — serializers (приклади coercion).
  - [#708](https://github.com/Skords-01/Sergeant/issues/708) — root-cause для цього правила.
  - ADR-0013 — migration conventions (використання `BIGINT` в DDL).

---

## 0. TL;DR

Postgres `BIGINT` (8-byte signed integer) у `pg` Node-driver-і віддається
як **`string`**, а не `bigint` чи `number`. Якщо serializer забуде
coerce-нути, `string` потрапляє у JSON response і ламає все, що робить
`amount + fee`, `balance.toLocaleString()`, `sortBy(amount)` на клієнті —
тихо, без помилки.

**Правило:**

1. У serializer-і модуля завжди `Number(row.col)` для будь-якої `BIGINT`
   колонки.
2. `@sergeant/api-client` типи — `number`, не `string | number` union.
3. Snapshot-test на response shape лочить контракт.
4. Єдиний виняток — **опaque ID-и**, які передаються назад у сервер
   (у нас таких майже немає, але обґрунтовується явно).

Це **безпечно до 2^53 - 1** (`Number.MAX_SAFE_INTEGER` = 9007199254740991).
Для фінансових сум у копійках — 90 трлн грн на один amount, для id-counter-ів
— достатньо на десятиліття.

---

## ADR-14.1 — Чому `BIGINT`, а не `INT`/`NUMERIC`?

### Status

accepted.

### Context

Типи в Postgres для integer-сум:

| Тип        | Розмір  | Range               | pg-driver JS type |
| ---------- | ------- | ------------------- | ----------------- |
| `SMALLINT` | 2 bytes | ±32K                | `number`          |
| `INTEGER`  | 4 bytes | ±2.1B               | `number`          |
| `BIGINT`   | 8 bytes | ±9.2E18             | `string`          |
| `NUMERIC`  | var     | arbitrary precision | `string`          |

Для monetary amount (Monobank transactions — у копійках, Finyk — у копійках),
cashback, balances — `INTEGER` замало (2.1B копійок = 21М грн — легко перевищити
за лайфтайм акаунта з багатьма транзакціями). `BIGINT` — природний вибір.

Для `id` counter-ів: ми використовуємо або `TEXT` ID (Better Auth user), або
`BIGSERIAL` (implicit `BIGINT`). В обох випадках `BIGINT` у response payload
виникає.

### Decision

**`BIGINT` — стандарт** для:

- Monetary amount у копійках/мілі-копійках (Finyk, Monobank).
- Balances, credit limits.
- Cashback amount, commission rate.
- `BIGSERIAL` primary key (якщо не TEXT).

`NUMERIC` — тільки коли потрібна exact decimal math (поки у нас немає; можливий
кандидат — fx-rate для Monobank FX, але там string math на клієнті).

### Consequences

- Більше amount-range на майбутнє.
- Всі monetary колонки → `bigint → number` converson на serializer boundary.

### Exit criteria

n/a (standard).

---

## ADR-14.2 — Coerce на serializer-boundary, не на клієнті

### Status

accepted.

### Context

Два місця, де можна конвертувати string → number:

1. **Сервер, у serializer** (рекомендовано AGENTS.md).
2. **Клієнт, при десеріалізації** (`.map(r => ({ ...r, amount: Number(r.amount) }))`).
3. **Глобально через `pg.types.setTypeParser(20, parseInt)`** — zero-coercion,
   driver сам повертає number.

### Decision

**Coerce у serializer.** Кожен `apps/server/src/modules/<module>/*Handler.ts`
робить `Number(row.col)` для кожної BIGINT колонки:

```ts
// ❌ BAD — bigint leaks as string to client; arithmetic breaks silently
return rows.map((r) => ({
  id: r.id, // string!
  amount: r.amount, // string!
}));

// ✅ GOOD — explicit Number() in the serializer
return rows.map((r) => ({
  id: Number(r.id),
  amount: Number(r.amount),
}));
```

### Consequences

**Позитивні:**

- Клієнт бачить pure `number` — типи у `@sergeant/api-client` безумовно `number`,
  не `string | number`.
- Кожен handler робить coercion явно → code-review легший.
- Snapshot-тести (`inlineSnapshot`) шоу-ять stringified-number одразу, якщо
  coercion пропущений.

**Негативні:**

- Легко забути на новому handler-і. Мітігація:
  - ESLint-rule (TBD) що попереджає, коли response-об'єкт містить pg-колонку
    типу BIGINT без `Number()`.
  - Hard rule #1 у AGENTS.md — частина onboarding.

### Alternatives considered

- **Global `pg.types.setTypeParser(20, parseInt)`.** Zero-coercion на handler-ах,
  driver повертає number. Відкинуто тому що:
  - Втрачаємо явність у коді — handler не "документує", що амаунт — це
    bigint → number.
  - При accidental великому числі (>2^53) driver silently truncate-ить, без
    signal. Якщо coerce вручну, можна додати guard `assertSafeInt(row.amount)`.
  - Важче тестувати. Testcontainers vs mock — різна behavior без явних сигналів.
- **Client-side conversion.** API-client map-ить. Але тоді snapshot-тест
  fixture на серверній стороні не ловить bug-у. Відкинуто.
- **Переходимо на JS `bigint` у клієнті.** Технічно "правильно", але:
  - JSON не підтримує bigint нативно (`JSON.stringify(1n)` кидає).
  - Більшість UI-лібок (`toLocaleString`, chart-libs) не вміють bigint.
  - Наші amount-и помістяться у 2^53 — overkill.

### Exit criteria

Переглядається, якщо:

- Реальна amount перевищить 2^53 (нереально для особистих фінансів).
- JSON.stringify нативно підтримує bigint (TC39 stage 4).
- Переходимо на `decimal.js` або `NUMERIC` для exact math (pricing, fx-rate).

---

## ADR-14.3 — Safe integer guard

### Status

proposed.

### Context

`Number("9007199254740992")` === `9007199254740992` (точно). Але
`Number("9007199254740993")` === `9007199254740992` (lost precision,
`Number.MAX_SAFE_INTEGER + 2`). Якщо у БД з'явиться amount > 2^53, coercion
тихо збреше.

### Decision

Utility `safeCoerceBigint(val: string | null): number`:

```ts
export function safeCoerceBigint(val: string | number | null): number {
  if (val === null) return 0;
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isSafeInteger(n)) {
    throw new AppError({
      code: "UNSAFE_BIGINT",
      message: `value ${val} exceeds Number.MAX_SAFE_INTEGER`,
    });
  }
  return n;
}
```

Використовувати у serializer-ах замість голого `Number(r.amount)`. Для нашого
bar — це no-op, але створює fail-fast для exotic-даних (мілліардний cashback
з bug-у в Monobank webhook, etc).

**Статус:** `proposed`, бо зараз serializer-и use просто `Number(...)`. Треба
окремий PR, щоб:

1. Додати helper у `apps/server/src/lib/<numbers>.ts` (планований/proposed шлях; на момент написання ADR файлу ще немає).
2. Мігрувати existing serializer-и.
3. Додати ESLint rule (optional) проти голого `Number(r.xxx)` у `apps/server/src/modules/`.

### Consequences

**Позитивні:**

- Fail-fast для precision loss — log + Sentry замість тихого зіпсованого balance.
- Маленька цінa виклику.

**Негативні:**

- Extra wrapper на кожен field — розмова код.
- Легко забути — ESLint rule треба.

### Exit criteria

Повне перетворення готове коли всі serializer-и у `apps/server/src/modules/*`
використовують `safeCoerceBigint` замість `Number`.

---

## ADR-14.4 — Zod-схема на API-contract

### Status

accepted.

### Context

Навіть з serializer-coercion можна щось пропустити — новий endpoint, copy-paste
з іншого. Треба runtime-guard на контракт.

### Decision

Для кожного endpoint-у, який повертає BIGINT-дані:

1. У `@sergeant/api-client` — Zod-схема response, `amount: z.number()`.
2. API-client робить `.parse()` на response — якщо сервер збрехав і повернув
   `"123"` замість `123`, ранн-ерор з чітким повідомленням у dev-console.

Сервер-side snapshot-тест фіксує shape з already-coerced значеннями:

```ts
expect(result).toMatchInlineSnapshot(`
  {
    "id": 42,
    "amount": 250,
  }
`);
```

Якщо coercion пропущений → `"amount": "250"` (string) з'явиться у snapshot,
diff ловить before-merge.

### Consequences

**Позитивні:**

- Double defense: server-side snapshot + client-side runtime parse.
- Клієнт на mobile/web відразу бачить, що саме ламалось — не downstream
  `NaN` у UI.

**Негативні:**

- Runtime overhead на client zod-parse — прийнятний (~5-20 µs на response).

### Exit criteria

n/a (convention).

---

## ADR-14.5 — Ідентифікатори як `TEXT`, не `BIGSERIAL`

### Status

accepted.

### Context

Better Auth використовує текстові `user.id` (`cuid2`-подібні). Ми свідомо
поширили цей підхід на більшість доменних таблиць: `mono_tx_id TEXT`,
`mono_account_id TEXT`, `habit_id TEXT` (у blob), etc. Де `BIGSERIAL` —
тільки там, де автогенерація БД доречна (типу `id BIGSERIAL PRIMARY KEY` у
internal event-таблицях).

### Decision

- User-facing ID = `TEXT` (cuid/ulid/nanoid) — стабільні між імпортами,
  безпечні у URL, не leak-ять counter-info.
- Internal audit/event ID = `BIGSERIAL` (OK якщо не видно клієнту).
- При expo-аудиті `BIGSERIAL` у client payload-і → coerce `Number(id)` (ADR-14.2
  правило застосовується).

### Consequences

**Позитивні:**

- URL-и типу `/api/v1/finyk/tx/xxxxxx` без counter-leak.
- Імпорти Monobank transactions зберігають їхні native ID (mono_tx_id з webhook-у)
  без synthetic counter.

**Негативні:**

- `TEXT` ID дорожчий у БД (16–24 байти vs 8 bytes BIGINT), більший overhead
  у join-ах. Для наших масштабів — pro-negligent.

### Exit criteria

n/a.

---

## Open questions

1. **`safeCoerceBigint` rollout.** Наразі serializer-и пишуть просто
   `Number(r.col)`. Перехід на `safeCoerceBigint` — окремий PR з ESLint rule.
2. **Decimal-math endpoints.** Якщо додамо pricing logic (Stripe ADR-0001)
   з taxes/fractional cents, доведеться перейти на `NUMERIC` для точності →
   string math на клієнті (`decimal.js`). Окремий ADR, якщо coincide.
3. **`BigInt` native JSON support.** TC39 proposal "JSON.parse source text"
   / bigint → JSON — на stage 3. Якщо стабілізується, можна буде безболісно
   подорожувати bigint end-to-end. Поки — no-op.

---

## Implementation tracker

| Arte-fact                                                | Статус  |
| -------------------------------------------------------- | ------- |
| Hard rule #1 у `AGENTS.md`                               | live    |
| `Number(r.col)` у всіх current serializer-ах             | live    |
| `api-client` types як `number`                           | live    |
| Inline-snapshot тести на response shapes                 | live    |
| `safeCoerceBigint` helper                                | TBD     |
| ESLint rule проти голого `Number(r.xxx)` у serializer-ах | TBD     |
| Zod-runtime parse на всіх api-client endpoints           | partial |
