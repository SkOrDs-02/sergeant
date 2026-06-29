# Monobank Provider API («tap-to-confirm») — план інтеграції

> **Last touched:** 2026-06-29 by @claude. **Next review:** 2026-09-27.
> **Status:** Draft / plan. Окрема майбутня інтеграція — поки **не реалізована**, блокована зовнішнім схваленням (див. § Передумови).

**Що цей документ:** план переходу від ручного вводу особистого API-токена Monobank до
flow «натисни → підтверди доступ у застосунку Монобанк» (як у сторонніх трекерах на кшталт
PocketMates). Описує поточний стан, цільове бачення, передумови, потреби, декомпозицію на PR-и
та зміни по файлах. Це **roadmap/ADR-чернетка**, а не готова специфікація до виконання — частина
кроків заблокована зовнішнім схваленням Монобанку і не може стартувати, поки воно не отримане.

**Зв'язок з рештою доків:** доповнює [`monobank-roadmap.md`](./monobank-roadmap.md) (там цей пункт
зафіксований однорядково як «MonoCorporate API. Окрема інтеграція, окрема задача» — § «Поза скоупом»).
Env-змінні — [`env-vars.md § 16-17`](./env-vars.md). Domain-інваріанти грошей/часу —
[`domain-invariants.md`](../architecture/domain-invariants.md).

---

## TL;DR

- Монобанк має **два різні API**. Зараз ми на **Personal API** (юзер копіює токен із сайту). Трекери, де
  «натиснув → підтвердив у застосунку», працюють на **Provider / відкритому API** (corporate).
- Різниця — **тільки в кроці отримання токена** (UX-обгортка авторизації). Весь pipeline після
  отримання токена (`client-info`, реєстрація webhook, backfill, persist транзакцій) залишається **той самий**.
- **Головний блокер — не код, а доступ:** Provider API вимагає заявки + схвалення Монобанком і,
  ймовірно, юрособи/ФОП + пари ECDSA-ключів. Без виданого `Key-Id` реалізувати flow **неможливо в принципі**.
- Технічно у нас уже є ~80% інфраструктури. Бракує саме «auth-обгортки»: підпис запитів, ендпойнт
  створення заявки, callback для прийому токена і нова кнопка на фронті замість поля вводу.
- **Рішення:** тримати Personal API як дефолт; почати Provider-інтеграцію **тільки після** отримання
  доступу провайдера. Цей документ — готовий план «на полиці», щоб стартувати без розгону, коли доступ буде.

---

## 1. Контекст: два API Монобанку

| Параметр                 | **Personal API** (зараз у нас)                  | **Provider / відкрите API** (tap-to-confirm)                      |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------- |
| Хто може користуватись   | будь-яка фізособа, self-service                 | лише схвалений провайдер (заявка + договір, ймовірно юрособа/ФОП) |
| Як юзер дає доступ       | йде на `api.monobank.ua`, генерує токен, копіює | тисне кнопку → підтверджує доступ у застосунку Монобанк           |
| Юзер бачить токен        | так (копіює вручну)                             | **ні** — токен приходить нам на callback, юзер його не торкається |
| Автентифікація сервісу   | хедер `X-Token` (сам токен юзера)               | підпис кожного запиту ECDSA-ключем (`X-Time`/`X-Key-Id`/`X-Sign`) |
| Дозволи (scopes)         | повний доступ токена                            | гранульовані: `s` — виписки/баланс, `p` — ПІБ                     |
| Rate-limit виписок       | 1 запит / 60 c на токен                         | вищі ліміти для провайдерів                                       |
| Доступність для MVP/beta | одразу                                          | заблоковано на схвалення Монобанку                                |

**Підсумок:** PocketMates та подібні — це **не «краще зроблено»**, а **інший рівень доступу до Монобанку**.
Ми на Personal API свідомо, бо він не блокує беta на зовнішній стороні.

---

## 2. Стан зараз (as-is)

Поточний connect-flow на Personal API:

1. **Web.** Юзер вставляє токен у [`FinykLoginScreen.tsx`](../../../apps/web/src/modules/finyk/components/FinykLoginScreen.tsx)
   (поле «API токен Monobank», підказка «Mono → Налаштування → Інші → API»). Хук
   [`useMonobank.ts`](../../../apps/web/src/modules/finyk/hooks/useMonobank.ts) шле `POST /api/mono/connect`.
2. **Server.** [`connection.ts → connectHandler`](../../../apps/server/src/modules/mono/connection.ts):
   - валідує токен через `GET https://api.monobank.ua/personal/client-info` (`X-Token`);
   - генерує `webhook_secret`, реєструє `POST /personal/webhook`;
   - шифрує токен (AES-256-GCM, [`crypto.ts`](../../../apps/server/src/modules/mono/crypto.ts)) і кладе у `mono_connection`;
   - fire-and-forget backfill 30 днів ([`historyFetch.ts`](../../../apps/server/src/modules/mono/historyFetch.ts)).
3. **Маршрути.** [`mono-webhook.ts`](../../../apps/server/src/routes/mono-webhook.ts) — `/api/mono/connect`
   гейтиться `requireSession()` + `requireVerifiedEmail()` (H6).
4. **Схема.** [`008_mono_integration.sql`](../../../apps/server/src/migrations/008_mono_integration.sql):
   `mono_connection` / `mono_account` / `mono_transaction`.
5. **Env.** `MONO_WEBHOOK_ENABLED`, `MONO_TOKEN_ENC_KEY`, `PUBLIC_API_BASE_URL` ([`env-vars.md § 16`](./env-vars.md)).

**Ключове спостереження:** усе нижче кроку «отримали валідний токен» (webhook, persist, backfill,
push, MCC) **не залежить** від способу отримання токена. Provider API підмінює лише крок отримання.

---

## 3. Як працює Provider flow (mechanism)

За [офіційною докою](https://api.monobank.ua/docs/corporate.html) і
[розбором flow](https://gist.github.com/Sominemo/8714a82e26a268c30e4a332b0b2fd943):

1. **Одноразовий setup.** Провайдер генерує ECDSA-пару (OpenSSL), віддає Монобанку публічний ключ,
   отримує `Key-Id` (SHA1 публічного ключа у hex).
2. **Підпис запитів.** Кожен запит несе `X-Time` (unix ts), `X-Key-Id`, `X-Sign` — ECDSA-SHA256-підпис
   конкатенації `X-Time + <token-or-permissions> + <path>`, base64.
3. **Створення заявки.** `POST /personal/auth/request` з `X-Permissions` (напр. `sp`) і `X-Callback`
   (наш webhook) → відповідь `{ tokenRequestId, acceptUrl }`.
4. **Підтвердження юзером.** Показуємо `acceptUrl` як deeplink/QR → юзер тисне «дозволити» у застосунку Монобанк.
5. **Доставка токена.** Монобанк стукає на `X-Callback`, токен користувача — у хедері `X-Request-Id`.
6. **Прив'язка.** Мапимо токен на наш `user.id`. ⚠ **Не** використовувати токен Монобанку як ідентифікатор
   юзера — тримаємо власний account-layer (у нас це Better Auth `user.id`, він уже PK у `mono_connection`).

Статус заявки можна поллити (`/personal/auth/request` status) — для UI «Очікування підтвердження».

```text
[Web] tap "Підключити Монобанк"
   → POST /api/mono/auth/request            (server підписує ECDSA)
   → Mono: { tokenRequestId, acceptUrl }
   → Web відкриває acceptUrl (deeplink/QR), показує "Очікування підтвердження"
[User] підтверджує у застосунку Монобанк
   → Mono → POST {our X-Callback}  (X-Request-Id: <userToken>)
   → server: шифрує токен, далі ТОЙ САМИЙ шлях, що й зараз
            (client-info → register webhook → persist → backfill)
[Web] поллить статус → "Підключено" → редірект у Фінік
```

---

## 4. Бачення фінального результату (to-be)

- На `FinykLoginScreen` основна дія — **«Відкрити Монобанк»** (deeplink на мобілці / QR на десктопі),
  а не поле вводу токена. Поле «вставити токен» лишається як **fallback** (Personal API) під «Інші способи».
- Стан «Очікування підтвердження» з поллінгом + кнопкою «Спробувати знову» (як на скріні PocketMates).
- Гранульований запит дозволів: `s` (виписки) обов'язково, `p` (ПІБ) — опційно, з поясненням навіщо.
- Жодного «піди на сайт, згенеруй, скопіюй» — нуль кроків поза нашим застосунком, окрім одного тапа в Монобанку.
- **Зворотна сумісність:** наявні Personal-токени продовжують працювати; ніякої міграції БД-даних не треба
  (токен лягає в ту саму колонку, тим самим шифруванням).

---

## 5. Передумови, умови, потреби (БЛОКЕРИ)

> Це найважливіша секція. Без п.1 **жоден код нижче не має сенсу** — немає `Key-Id`, немає чим підписати запит.

1. **🔴 Схвалення провайдера від Монобанку.** Подати заявку на відкрите/provider API, пройти онбординг,
   отримати `Key-Id`. Ймовірно потрібна **юрособа або ФОП** + договір. **Зовнішня залежність, не контролюємо
   терміни.** → owner-task поза репо (юридично-організаційний).
2. **🔑 Зберігання приватного ECDSA-ключа.** Новий секрет рівня `MONO_TOKEN_ENC_KEY`: лише в Railway env,
   ніколи в git/логах (Hard Rule #20, #21). Бажано — підтримка ротації (`*_KEYS` + `*_CURRENT_VERSION`,
   як у `BETTER_AUTH_TOKEN_ENC_KEYS`).
3. **🌐 Публічний callback-URL.** Уже маємо `PUBLIC_API_BASE_URL`; додається окремий шлях для `X-Callback`.
4. **🧪 Тестовий доступ.** З'ясувати, чи Монобанк дає sandbox/test-провайдера, чи лише прод-ключі —
   від цього залежить, як тестувати без реальних рахунків.
5. **⚖️ Юридично/безпека.** Гранульовані scopes + явна згода юзера; оновити
   [`pii-handling.md`](../../04-governance/security/pii-handling.md) і Privacy Policy, якщо запитуємо `p` (ПІБ).

**Потреби в людях/ресурсах:** ~3–5 інженер-днів коду (див. § 7) **після** розблокування; + організаційний
трек на отримання провайдерського доступу (юрособа/договір) — паралельно і заздалегідь.

---

## 6. Декомпозиція на PR-и

> Виконувати **тільки після** отримання `Key-Id`. До того — документ лежить «на полиці».

| PR     | Зміст                                                                                         | Залежності | Оцінка  |
| ------ | --------------------------------------------------------------------------------------------- | ---------- | ------- |
| **P0** | Org-трек: заявка + договір + `Key-Id` (поза репо)                                             | —          | extern  |
| **P1** | `lib/mono/sign.ts` — ECDSA-підпис (`X-Time`/`X-Key-Id`/`X-Sign`) + unit-тести на known-vector | P0         | 0.5 д   |
| **P2** | `POST /api/mono/auth/request` — створити заявку, повернути `{ acceptUrl, tokenRequestId }`    | P1         | 0.5 д   |
| **P3** | Callback-ендпойнт `X-Callback` — прийняти `X-Request-Id`, прогнати через наявний persist-шлях | P1, P2     | 1 д     |
| **P4** | `GET /api/mono/auth/status` — поллінг статусу заявки для UI                                   | P2         | 0.5 д   |
| **P5** | Web: кнопка «Відкрити Монобанк» + deeplink/QR + стан «Очікування», Personal-токен → fallback  | P2, P4     | 1–1.5 д |
| **P6** | Env + доки: `MONO_PROVIDER_*` у `env-vars.md`, оновити цей файл і `monobank-roadmap.md`       | P1–P5      | 0.5 д   |

Кожен PR — окрема гілка, тести (vitest), зелений CI; контрактний триплет (Hard Rule #3) для нових DTO.

---

## 7. Зміни по файлах (orienteering)

**Server (`apps/server/src`):**

- `lib/mono/sign.ts` _(new)_ — `signRequest({ time, path, permissionsOrToken })`; читає приватний ключ з env.
- `modules/mono/authRequest.ts` _(new)_ — handler `POST /api/mono/auth/request` (підпис → Mono → `{acceptUrl}`).
- `modules/mono/authCallback.ts` _(new)_ — handler `X-Callback`: дістати `X-Request-Id`, викликати
  **наявну** логіку з `connection.ts` (винести спільну частину `persistConnection(userId, token)` із `connectHandler`).
- `modules/mono/connection.ts` — рефактор: виділити `persistConnection()` зі `connectHandler`, щоб
  Personal і Provider ділили один persist-шлях.
- `routes/mono-webhook.ts` — зареєструвати нові маршрути (`auth/request`, `auth/status`, callback);
  **callback НЕ під `requireSession()`** (його зве Монобанк) — захист через підпис/`tokenRequestId`-lookup.
- `env/env.ts` — `MONO_PROVIDER_ENABLED`, `MONO_PROVIDER_KEY_ID`, `MONO_PROVIDER_PRIVATE_KEY`.
- Тести: `sign.test.ts` (known-vector), `authCallback.test.ts`, оновити `registerRoutes.test.ts.snap`.

**API client (`packages/api-client/src`):**

- `endpoints/mono.ts` — `monoAuthRequest()`, `monoAuthStatus()`; типи в SSOT-схемі (Hard Rule #3);
  `pnpm api:generate-openapi` + `*-types`.

**Web (`apps/web/src/modules/finyk`):**

- `components/FinykLoginScreen.tsx` — кнопка «Відкрити Монобанк» + deeplink/QR + стан «Очікування
  підтвердження»; поле токена → під «Інші способи підключення».
- `hooks/useMonobank.ts` — `startProviderAuth()` + поллінг `auth/status`; RQ-ключі лише через
  `finykKeys` factory (Hard Rule #2).

**БД:** змін схеми **не потрібно** — токен лягає в наявний `mono_connection`. Опційно: колонка
`auth_method TEXT` ('personal' | 'provider') для аналітики (sequential-міграція, Hard Rule #4).

---

## 8. Безпека (hard rules, що зачіпає)

- **#20 секрети:** приватний ECDSA-ключ + `Key-Id` лише в env, не в git/логах. Ротація бажана.
- **#21 Pino redaction:** `X-Sign`, `X-Request-Id`, `X-Token`, `acceptUrl` ніколи в логах — додати у redact-paths.
- **#3 контракт:** нові DTO (`auth/request`, `auth/status`) синхронні server ↔ api-client ↔ test.
- **#1 bigint:** persist-шлях спільний з Personal — коерсія `bigint→number` уже на місці.
- Callback автентифікувати по `tokenRequestId` (звіряти з тим, що ми створили), а не «довіряти будь-якому POST».

---

## 9. Ризики

| Ризик                                                    | Мітигація                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Монобанк не схвалює провайдера / вимагає юрособу         | Personal API лишається дефолтом; беta не блокується                           |
| Немає sandbox → тест лише на проді з реальними рахунками | З'ясувати на онбордингу (P0); обмежити тест founder-акаунтом                  |
| Неправильний підпис → 401 від Монобанку                  | P1 з known-vector тестом; лог діагностики без секретів                        |
| Десктоп без застосунку Монобанк                          | QR-фолбек + збереження Personal-токена як альтернативи                        |
| Витік приватного ключа                                   | env-only + ротація (`*_KEYS`/`*_CURRENT_VERSION`), як у Better Auth token enc |

---

## 10. Рішення (за станом 2026-06-29)

**Тримаємо Personal API як дефолт. Provider-інтеграцію стартуємо тільки після отримання `Key-Id`
(P0).** Цей документ — готовий план, щоб стартувати без розгону. Personal-flow залишається назавжди
як fallback (десктоп, юзери без застосунку, юзери, що не пройшли provider-confirm).

**Definition of Done (коли робитимемо):** юзер підключає Монобанк одним тапом + підтвердженням у
застосунку, без копіювання токена; Personal-токен працює як fallback; нові ендпойнти покриті тестами;
секрети лише в env; доки (`env-vars.md`, `monobank-roadmap.md`, цей файл) оновлені.

---

## Джерела

- Офіційна дока відкритого API Монобанку для провайдерів: <https://api.monobank.ua/docs/corporate.html>
- Розбір corporate-flow (підпис, `auth/request`, callback): <https://gist.github.com/Sominemo/8714a82e26a268c30e4a332b0b2fd943>
- Особистий API (поточний): <https://api.monobank.ua/> (`/personal/client-info`, `/personal/webhook`, `/personal/statement`)
