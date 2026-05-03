# ADR-0006: React Query keys via centralized factory (no inline tuples)

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`AGENTS.md`](../../AGENTS.md) — hard rule #2 (RQ keys: only via centralized factories).
  - [`apps/web/src/shared/lib/api/queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts) — реєстр factory-функцій.
  - [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js) — правило `rq-keys-only-from-factory` ([#869](https://github.com/Skords-01/Sergeant/pull/869)).
  - [`docs/playbooks/add-react-query-hook.md`](../playbooks/add-react-query-hook.md).

---

## 0. TL;DR

Усі ключі для `useQuery` / `useMutation` / `setQueryData` / `invalidateQueries` у `apps/web` створюються **виключно через фабрики у `apps/web/src/shared/lib/api/queryKeys.ts`**. Фабрика — це об'єкт виду:

```ts
export const finykKeys = {
  all: ["finyk"] as const,
  monoStatements: ["finyk", "mono", "statement"] as const,
  monoStatement: (accId: string, from: number, to: number) =>
    ["finyk", "mono", "statement", accId, from, to] as const,
};
```

Інлайнові тупли (`["finyk", "mono", "statement", accId]`) заборонені й ловляться ESLint-правилом `sergeant-design/rq-keys-only-from-factory` (`error`). Секрети (Mono-токен, push-endpoint) хешуються через `hashToken()` перед потраплянням у key.

| Ризик без фабрик                                     | Як фабрика його закриває                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Drift форми ключа (з'являється `accId` посередині)   | Сигнатура функції — єдине джерело істини; зміна ламає TS-компіл.                      |
| Bulk-invalidate неможливий                           | `invalidateQueries({ queryKey: finykKeys.all })` валідує все дерево по prefix-у.      |
| Секрет потрапляє в devtools / Sentry breadcrumbs     | Фабрика приймає тільки `tokenHash`, raw-token не існує в типі.                        |
| Колізії ключів між модулями (`["transactions", id]`) | Перший елемент tuple — namespace домену (`finyk`/`fizruk`/`nutrition`/`hub`/`coach`). |

---

## ADR-6.1 — Чому inline-tuples не масштабуються

### Status

accepted.

### Context

Стан до правила (приблизно лютий-березень 2026): у `apps/web/src/modules/finyk/**` ключі виглядали як:

```tsx
useQuery({
  queryKey: ["finyk", "transactions", accountId, from, to],
  queryFn: () => fetchTransactions(accountId, from, to),
});
```

Реальні проблеми, які ми спостерігали (а не уявні):

1. **Drift форми.** Один файл писав `["finyk", "transactions", accountId, from, to]`, інший — `["finyk-transactions", accountId, { from, to }]`. `invalidateQueries(["finyk", "transactions"])` мовчки промахувався по другому варіанту.
2. **Bulk-invalidate розламався.** Після Mono webhook-у треба інвалідувати **всі** finyk-кеші (statement, sync-state, accounts). З інлайн-туплів — це 5 окремих викликів `invalidateQueries`, легко забути новий ключ.
3. **Секрети у ключах.** Спочатку Mono-токен передавався як сирий рядок: `["finyk", "mono", "client-info", monoToken]`. Він потрапляв у devtools, у Sentry breadcrumbs (через `queryKey` у `onError`-логах), у Pino-логи серверних end-point-ів, що лили `req.query`. Це security-issue, який ми закрили з допомогою `hashToken()`.
4. **Колізії між модулями.** `["transactions", id]` могли писати і finyk, і pantry (там «transactions» — рух запасів). Ключі змішувалися — `setQueryData(["transactions", id])` оновлював не той кеш.
5. **TS не ловив помилок порядку аргументів.** Inline tuple `[..., from, to]` з помилково переставленими `from`/`to` компілюється — обидва `string`. Фабрика з іменованими параметрами хоча б у IDE підказує неправильний порядок (а в перспективі — strict branded типи `DateFrom` / `DateTo`).

### Decision

**Усі ключі — лише з фабрик у `apps/web/src/shared/lib/api/queryKeys.ts`.** Конвенції:

- Перший елемент tuple — namespace домену. Збігається з ім'ям модуля (`finyk`, `fizruk`, `nutrition`, `routine`) або core-фічі (`hub`, `coach`, `weekly-digest`, `push`).
- Параметри йдуть **від найширшого до найвужчого**, щоб `invalidateQueries({ queryKey: finykKeys.all })` каскадно скидав усе піддерево.
- Об'єкт-фабрика експортується `as const` — TS виводить літеральні tuple-типи; `setQueryData<T>(key, ...)` лишається типобезпечним.
- Секрети — лише через `hashToken(token: string): string` (перші 8 символів SHA-256). Raw-token у key — заборонено.
- Bulk-prefix-и (`finykKeys.monoStatements` без аргументів) — окремий експорт від конкретних ключів (`finykKeys.monoStatement(accId, from, to)`). Перші — для `invalidateQueries`, другі — для `useQuery`.

Правило #2 в `AGENTS.md` робить це **hard rule** для PR-ревʼю; ESLint `rq-keys-only-from-factory` ([#869](https://github.com/Skords-01/Sergeant/pull/869)) автоматизує перевірку — порушення ламає `pnpm check` у CI.

Module ownership map (`AGENTS.md` → §2) фіксує, яка фабрика обслуговує який path:

| Path                                    | Factory(ies)                         |
| --------------------------------------- | ------------------------------------ |
| `apps/web/src/modules/finyk/**`         | `finykKeys`, `monoWebhook*`          |
| `apps/web/src/modules/nutrition/**`     | `nutritionKeys`                      |
| `apps/web/src/modules/fizruk/**`        | (local-first via MMKV-web)           |
| `apps/web/src/modules/routine/**`       | (local-first)                        |
| `apps/web/src/core/**`                  | `hubKeys`, `coachKeys`, `digestKeys` |
| `apps/web/src/core/lib/pushSettings/**` | `pushKeys`                           |

Для `apps/mobile/**` ключі поки що локальні до модуля (відсутність cross-module `invalidate` зменшує ризик drift-у). Якщо коли-небудь cross-module інвалідація стане потрібною — мігруємо на ту саму factory-pattern, але з окремим реєстром (NativeWind / MMKV не мають обмежень web-only `queryKeys.ts`).

### Consequences

**Позитивні:**

- Точка істини в одному файлі (~250 LOC) — review нового key-у тривіальне.
- `invalidateQueries({ queryKey: finykKeys.all })` працює правильно після будь-якого мутування Mono-стану — тестується інтеграційними тестами Mono-webhook handler-а.
- ESLint ламає CI до того, як inline tuple дійде до прода.
- `hashToken()` гарантує, що Mono-токен ніколи не з'явиться у devtools / Sentry / Pino-логах.

**Негативні:**

- Файл `queryKeys.ts` росте з кожною новою фічею. Поки під 250 LOC — легко читається; у разі >800 LOC — розбиваємо по доменах (`queryKeys/finyk.ts`, `queryKeys/nutrition.ts`, …) з ре-експортом із `index.ts`, без зміни API споживачів.
- Для одноразового ключа (наприклад, у `__tests__` для mock-stub-у) фабрика — overhead. Прийнятний trade-off — у тестах теж використовуємо фабрику, щоб не дублювати знання форми ключа.

### Alternatives considered

1. **`@tanstack/query-key-factory`.**
   Зовнішня бібліотека з тією ж ідеєю, але hierarchical builder-ом (`createQueryKeys('finyk').contextual('mono').dynamic((id, from, to) => [...])`).
   Відхилено: +2 KB у бандл, ще одна dep на boundary `apps/web`, а наш use-case малий і не потребує hierarchical-builder-а. Звичайний `as const` об'єкт + ESLint автоматизація — простіше і швидше.

2. **Code-gen ключів зі схеми OpenAPI.**
   Логічно для server-driven контракту — кожен endpoint автоматично генерує свій queryKey. Відхилено на цей момент: у нас `api-client` ще не повністю openapi-driven (PR-4.D відкритий), і генерація додасть ще один build-step у `apps/web`. Повертатися до цього після PR-4.D.

3. **Перший елемент — `Symbol`.**
   Захист від колізій з зовнішніми бібліотеками, які теж пишуть у RQ-кеш. Відхилено: серіалізація `queryKey` у devtools / SSR-hydration ламається на `Symbol`. Звичайний `string`-namespace (`"finyk"`, `"hub"`) достатньо ізолює нас від чужих кешів.

---

## ADR-6.2 — `hashToken()` для секретів у key-ах

### Status

accepted.

### Context

Mono-token, push-endpoint, AI-API-key — секрети, які могли б природно стати частиною ключа (`["finyk", "mono", "client-info", monoToken]` — кожен токен → свій кеш). Але `queryKey` потрапляє в:

- React Query devtools (видимий локально, але потенційно у скрін-шейрі при дебагу).
- Sentry breadcrumbs через `query.state.error` + key-логування (`apps/web/src/core/observability/sentry.ts` стрипає body, але не key).
- Pino-логи серверних end-point-ів через `req.query` (deprecated шлях; зараз ми передаємо токен в Authorization header, але історично було).

Витік Mono-токена у логи — security-incident.

### Decision

**Будь-який секрет перед потраплянням у `queryKey` хешується через `hashToken(token: string): string`** (перші 8 символів SHA-256 — достатньо для cache-isolation, замало для відновлення оригіналу). Реалізація — інлайном у [`apps/web/src/shared/lib/api/queryKeys.ts`](../../apps/web/src/shared/lib/api/queryKeys.ts) (ре-експорт через `apps/web/src/shared/lib/index.ts`); раніше планувався окремий файл `hashToken.ts` — відмовились від нього заради локальності до фабрики. Фабрика приймає `tokenHash`, не `token`:

```ts
// ✅ GOOD — хеш у ключі
monoClientInfo: (tokenHash: string) =>
  ["finyk", "mono", "client-info", tokenHash] as const,
```

Виклик:

```ts
const hash = hashToken(monoToken);
useQuery({
  queryKey: finykKeys.monoClientInfo(hash),
  queryFn: () => fetchClientInfo(monoToken),
});
```

Raw-token іде в `queryFn` (closure), хеш — у key. ESLint поки не ловить «raw-token у key» автоматично — review + іменовані типи (`MonoTokenHash` у майбутньому як branded string).

### Consequences

**Позитивні:**

- Devtools/Sentry/логи бачать тільки 8-символьний хеш — useless без оригіналу.
- Кеш ізольований per-token (різні Mono-аккаунти не змішуються).

**Негативні:**

- Колізія SHA-256 на 8 символів — теоретично 1 на 4 млрд. Для приватних токенів одного юзера — не проблема.
- `hashToken()` — синхронний (`crypto.subtle.digest` асинхронний у браузері). Використовуємо `node-forge`-стиль pure-JS SHA-256 для синхронного path-у; bundle-cost ~3 KB, прийнятно.

### Alternatives considered

1. **Зашифрувати токен AES-GCM.** Overkill — нам не треба шифрування, лише deterministic-маппінг для cache-key.
2. **Використати ID акаунту замість токена.** Працює для Mono (token ↔ accountId 1:1), але не для push-endpoint (URL — sole identifier). Універсальне рішення — хеш від raw-secret.

---

## ADR-6.3 — Ownership: кожна фабрика має «дім»

### Status

accepted.

### Context

З ростом домену фабрика роздувається. Без чіткого ownership-у з'являється соціальна дилема: «Я додаю `coachKeys.byMonth` — а куди вставити, у coach чи hub?»

### Decision

Кожна фабрика має **єдиного власника** в module ownership map (`AGENTS.md` → §2). Ось поточний розподіл:

| Factory         | Owner path                              | Owner module |
| --------------- | --------------------------------------- | ------------ |
| `finykKeys`     | `apps/web/src/modules/finyk/**`         | finyk        |
| `nutritionKeys` | `apps/web/src/modules/nutrition/**`     | nutrition    |
| `hubKeys`       | `apps/web/src/core/hub/**`              | core/hub     |
| `coachKeys`     | `apps/web/src/core/coach/**`            | core/coach   |
| `digestKeys`    | `apps/web/src/core/digest/**`           | core/digest  |
| `pushKeys`      | `apps/web/src/core/lib/pushSettings/**` | core/push    |

Cross-domain key (наприклад, hub читає preview від finyk) → ключ живе у `hubKeys` (споживач), а не `finykKeys`. Принцип: **фабрика належить тому, хто інвалідує її ключі**.

### Consequences

**Позитивні:**

- Review зрозумілий: новий ключ у `coachKeys` → ревʼю від owner-а core/coach.
- Bulk-invalidate `coachKeys.all` стосується тільки coach-кеша, не зачіпає сторонніх.

**Негативні:**

- Деякі ключі дублюються логічно (hub-preview-finyk vs finykKeys.preview). Прийнятний overhead — boundary між модулями важливіший за DRY.

### Alternatives considered

— Глобальна factory `appKeys` з усіма ключами в одному об'єкті. Відкинуто: ламає ownership-map, ускладнює tree-shaking, не дає bulk-invalidate per-domain.

---

## Implementation status

- ✅ `queryKeys.ts` — централізовано всі чинні ключі finyk/nutrition/hub/coach/digest/push.
- ✅ ESLint `rq-keys-only-from-factory` ([#869](https://github.com/Skords-01/Sergeant/pull/869)) — `error`-rule у `eslint.config.js`.
- ✅ `hashToken()` інлайн у `apps/web/src/shared/lib/api/queryKeys.ts` (експорт через `apps/web/src/shared/lib/index.ts` як `hashToken`).
- ✅ Module ownership map у `AGENTS.md` фіксує власника фабрики.
- ⏳ Mobile (`apps/mobile/**`) поки локальні keys; мігруємо при першій крос-модульній інвалідації.
- ⏳ Можлива розбивка `queryKeys.ts` по доменах при перевищенні 800 LOC.

## Open questions

- **Branded types для секретів?** Зараз `monoClientInfo(tokenHash: string)` приймає звичайний `string`. Ми можемо ввести `type MonoTokenHash = string & { __brand: "mono-token-hash" }` і вимагати, щоб тільки `hashToken()` його повертав. Захищає від випадкового `monoClientInfo(rawToken)`. Поки не зробили — review + іменування достатні.

- **Server-side: чи потрібна аналогічна фабрика для query параметрів API?**
  Серверні end-point-и (`/api/finyk/transactions?from=...&to=...`) поки парсять параметри ad-hoc. Можливо, варто згенерувати клієнт із openapi (PR-4.D) і отримати key-маппінг автоматично — але це окреме рішення.
