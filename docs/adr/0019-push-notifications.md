# ADR-0019: Push notifications — server-driven fan-out (web + APNs + FCM)

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/push/send.ts`](../../apps/server/src/push/send.ts) — `sendToUser(userId, payload)` єдина точка fan-out-у.
  - [`apps/server/src/push/apnsClient.ts`](../../apps/server/src/push/apnsClient.ts), [`apps/server/src/push/fcmClient.ts`](../../apps/server/src/push/fcmClient.ts) — клієнти платформ.
  - [`apps/server/src/lib/webpushSend.ts`](../../apps/server/src/lib/webpushSend.ts) — web-push transport з timeout + circuit breaker.
  - [`apps/server/src/migrations/003_baseline_schema.sql`](../../apps/server/src/migrations/003_baseline_schema.sql) — `push_subscriptions` (web-push, RFC 8030).
  - [`apps/server/src/migrations/006_push_devices.sql`](../../apps/server/src/migrations/006_push_devices.sql) — `push_devices` (iOS/Android токени).
  - [`packages/shared/src/types/index.ts`](../../packages/shared/src/types/index.ts) — `PushPayload` (cross-package контракт).
  - [`apps/web/src/sw.ts`](../../apps/web/src/sw.ts) — клієнтський SW handler (`push`, `notificationclick`).
  - [`docs/playbooks/add-push-notification.md`](../playbooks/add-push-notification.md) — операційний how-to.

---

## 0. TL;DR

Push-нотифікація проходить через одну серверну функцію `sendToUser(userId, payload)`, яка fan-out-ить payload на **усі активні пристрої юзера** через 3 канали:

| Канал   | Тригер                                              | Транспорт                       | Реєстр пристроїв     | Cleanup-сигнал                      |
| ------- | --------------------------------------------------- | ------------------------------- | -------------------- | ----------------------------------- |
| web     | браузер з SW, juser натиснув "увімкнути сповіщення" | `web-push` library              | `push_subscriptions` | 404/410 → soft-delete               |
| iOS     | mobile-shell / native Expo, registered APNs token   | `@parse/node-apn`               | `push_devices`       | 410 / `BadDeviceToken`              |
| Android | mobile-shell / native Expo, registered FCM token    | `messaging.googleapis.com` REST | `push_devices`       | `UNREGISTERED` / `INVALID_ARGUMENT` |

Контракт payload — `PushPayload` у `@sergeant/shared` (cross-package: SW, mobile handler, server send). `sendToUser` НЕ кидає; помилки конкретного каналу повертає у `errors[]`. Для fire-and-forget — `sendToUserQuietly(userId, payload)`.

`sendToUser` у нашій моделі — **єдина** допустима точка для серверного push-у. Нові тригери додаються через playbook `add-push-notification.md`, а не через прямі `webpush.sendNotification` / `apn.send` виклики.

---

## ADR-9.1 — Чому єдина точка `sendToUser`, а не per-feature send

### Status

accepted.

### Context

До PR-перегляду середини 2026-Q1 окремі тригери (Mono webhook, AI insight, scheduler) самі імпортували `web-push` і ходили в БД за підписками. Реальні проблеми:

1. **Дублювання cleanup-логіки.** Кожен тригер мусив сам обробляти 410/404 і робити soft-delete у `push_subscriptions`. У `monoWebhookHandler` ми це робили правильно, у `aiInsightScheduler` — забули; "мертві" підписки накопичувалися.
2. **Розкид retry-policy.** Один файл — один retry, інший — три. На transient 5xx від FCM різні тригери поводилися інакше.
3. **Неможливо додати iOS/Android.** Треба було б у кожен тригер імпортувати ще й `apnsClient`/`fcmClient`. Замість одного знайдемо–заміни — N файлів.
4. **Метрики розкидані.** `pushSendsTotal{outcome}` потрібно інкрементувати в N місцях, легко промахнутися.

### Decision

`apps/server/src/push/send.ts → sendToUser(userId, payload)` — **єдина** функція, яка:

1. Читає всі активні пристрої юзера:

   ```sql
   SELECT token, platform FROM push_devices
    WHERE user_id = $1 AND platform IN ('ios','android') AND deleted_at IS NULL;

   SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE user_id = $1 AND deleted_at IS NULL;
   ```

2. Паралельно (`Promise.allSettled`) б'є APNs / FCM / web-push з retry-policy `MAX_ATTEMPTS=3` (delays 200 / 1000 / 3000 ms).
3. Класифікує outcome (ok / invalid_endpoint / rate_limited / timeout / circuit_open / error). На `invalid_endpoint` — soft-delete pid токена/підписки.
4. Повертає aggregated `SendToUserResult { delivered: {ios,android,web}, cleaned, errors[] }`. **Не throw-ить.**
5. Інкрементує `pushSendsTotal{outcome}` для дашбордів.

`sendToUserQuietly` — обгортка для fire-and-forget кейсів усередині handler-а, що не має валитися через push (catch + log + повернення undefined).

Нові тригери → виклик `sendToUser` (або `sendToUserQuietly`). Без exceptions: pre-commit ESLint-rule `restricted-imports` блокує `import "web-push"` поза `apps/server/src/push/` і `apps/server/src/lib/webpushSend.ts`.

### Consequences

**Позитивні:**

- Cleanup-логіка одна: invalid endpoint виявляється у `webpushSend` / `apnsClient` / `fcmClient`, soft-delete виконує `send.ts` уніфіковано.
- Retry — одна політика, тестована (`apps/server/src/push/send.test.ts` × ~25 кейсів).
- Метрики — один interceptor, один outcome-enum, легко переглянути дашборд "delivered vs cleaned vs errors per platform".
- Додавання нового тригера — playbook на 5 кроків (визнач тригер → виклич `sendToUser` → `payload` за схемою → тест → PR).

**Негативні:**

- `sendToUser` бавиться навколо db-pool-у напряму, що ускладнює юніт-тестування без Testcontainers (ми це вже мали для serializer-snapshot-ів). Тестуємо з real Postgres у `apps/server/src/push/send.test.ts`.
- Аж до того моменту, як юзер реєструє хоча б одну web-push підписку через ServiceWorker → жодного push-у не отримає. Це за дизайном (opt-in), але можна забути додати UI для prompts. Перевірка — Playwright smoke-e2e.

### Alternatives considered

1. **Chevre чи інший job-queue (Bull/Bee/SQS).**
   Push fan-out за дизайном — ~1-3 пристрої per user, не bulk. Latency не критичний (SLA 30 с). Job-queue додає інфру (Redis), яку ми поки не маємо у Railway-стеку.
2. **Server-Sent Events замість web-push.**
   SSE працює лише поки таб відкритий; web-push — навіть коли браузер закритий (SW виходить з background). Web-push краще для нашого UX (нагадування, AI-insights).
3. **Per-feature send-функції з shared utility.**
   Спокусливо, але не вирішує проблему: будь-який shared util треба ще покликати, що еквівалентно `sendToUser`. Краще запровадити одну точку входу.

---

## ADR-9.2 — Чому дві окремі таблиці: `push_subscriptions` і `push_devices`

### Status

accepted.

### Context

Web-push (RFC 8030) підписка — це trio `{endpoint, p256dh, auth}` і прив'язана до service-worker-а конкретного браузера. APNs/FCM тільки `{token, platform}` і прив'язані до пристрою (зміна при reinstall). Ситуативно це різні сутності з різними життєвими циклами.

Якби тримали одну таблицю — `endpoint` був би NULL для iOS/Android, `p256dh`/`auth` теж; крос-platform query усе одно потребували б `WHERE platform = ...`.

### Decision

**Окремі таблиці за платформним семантиком:**

- `push_subscriptions` (з migration `003_baseline_schema.sql`) — web-push, історично перша. Колонки `endpoint`, `p256dh`, `auth`, `user_id`, `created_at`, `deleted_at` (soft-delete через #005). Унікальний індекс на `(user_id, endpoint)` (RFC 8030 запобігає дублям endpoint-у).
- `push_devices` (з migration `006_push_devices.sql`) — native iOS/Android. Колонки `platform CHECK IN ('web','ios','android')`, `token`, `endpoint NULL`, `user_id`, `deleted_at`. Унікальний індекс `(platform, token)` — reinstall повертає той самий FCM/APNs token, потрібен `ON CONFLICT (platform, token) DO UPDATE SET user_id=..., updated_at=NOW()` для re-binding.

**Чому `push_devices` має `platform = 'web'` теж:** заплановане об'єднання у майбутньому. Сьогодні web-flow читає `push_subscriptions` (історичний шлях), нативний — `push_devices`. У наступній ітерації (rolling migration з `push_subscriptions` → `push_devices` per-row) уніфікуємо. ADR-9.2 переходить у `superseded` після цієї міграції.

### Consequences

**Позитивні:**

- Кожна платформа має чисту схему без NULL-fields.
- Партіальний індекс `WHERE deleted_at IS NULL` тримає реактивний lookup швидким.
- Reinstall iOS/Android коректно re-binding через `ON CONFLICT (platform, token)`.

**Негативні:**

- Два SELECT-запити в `sendToUser` замість одного. Dual-table вартість мала: PG-driver pipelining → 1 RTT.
- Майбутня уніфікація — окрема міграція з two-phase drop (rule #4 у `AGENTS.md`). Заплановано в roadmap (`PR-push.unify`).

### Alternatives considered

1. **Колонкоозкуть NULL-able (`endpoint`/`p256dh`/`auth` для native = NULL).**
   Робочий варіант, але ламає constraint-логіку: NULL-able trio для web — це валідна підписка чи ні? Окремі таблиці чистіші семантично.
2. **JSONB-колонка `provider_data` для всіх deuxièmes.**
   Гнучко, але втрачаємо schema-валідацію від PG. Важче індексувати.

---

## ADR-9.3 — Retry, timeout і circuit breaker для transport-шарів

### Status

accepted.

### Context

Без timeout-а push-сервіс під деградацією тримає async-задачу живою аж до TCP RST. У fan-out-і це блокує `Promise.allSettled` і pg-connection (бо ми робимо follow-up update після send-у). Без circuit breaker-а кожен з N паралельних запитів до одного origin-а (наприклад, FCM під деградацією) витрачає мережу та CPU на завідомо-приречені виклики.

### Decision

`apps/server/src/lib/webpushSend.ts` (web-push transport) реалізує:

1. **AbortController-timeout** — конфігурований через `WEBPUSH_TIMEOUT_MS` (default 5000).
2. **Per-origin circuit breaker** — після N послідовних failures origin-а (FCM/Apple/Mozilla proxy) breaker open-ається на T мс; під час open усі push-и до того origin-а одразу fail-fast-ять із `outcome: 'circuit_open'`.
3. **Один retry на timeout/5xx** з малим backoff. 4xx (400/403/404/410/413) НЕ ретраїмо — це per-subscription семантика (invalid keys, gone endpoint, oversize payload).
4. **Outcome-enum:** `ok` / `invalid_endpoint` / `rate_limited` / `timeout` / `circuit_open` / `error`. Зберігаємо `error` всередині result-у для логування caller-ом, але **не throw-ить**.

`sendToUser` понад це додає `MAX_ATTEMPTS=3` retry-цикл (delays 200 / 1000 / 3000 ms) — orthogonal до transport-retry і покриває cross-message coordination (наприклад, race з token-rotation).

`apnsClient`/`fcmClient` мають аналогічну outcome-класифікацію; конкретно для FCM ми фільтруємо `UNREGISTERED` / `INVALID_ARGUMENT` як cleanup-сигнали.

### Consequences

**Позитивні:**

- Push fan-out не блокує pg-pool (timeout гарантує звільнення connection-а).
- Деградований FCM не з'їдає всю мережу.
- 4xx-помилки не retry-яться — це не лише productivity, але й correctness (повтор `invalid auth` крафтить додаткові токені для billing-у).

**Негативні:**

- Circuit breaker на single-instance Railway-контейнері не координується між інстансами (ми зараз horizontally scale-ємо). Кожен інстанс має свій breaker — це ОК, бо upstream сам lim ить, breaker-у тут роль лише як local resource-protection.

### Alternatives considered

— **Спиратись виключно на upstream-rate-limit-и.** Ризиковано: при mass-fanout (broadcast notification) ми б ddos-или upstream.

---

## ADR-9.4 — Контракт `PushPayload` у `@sergeant/shared`

### Status

accepted.

### Context

Web SW, mobile handler і server `sendToUser` мають читати один і той же payload. Drift type-у між трьома runtime-ами легко зловити — особливо коли додаєш `silent: true` для background push.

### Decision

`PushPayload` живе у `packages/shared/src/types/index.ts`. Імпортується server'ом, web/sw, mobile native handler-ом. Поля:

- `title: string` — обов'язкове (всі 3 канали).
- `body?: string` — порожній рядок валідний.
- `data?: Record<string, unknown>` — JSON-серіалізовуване.
- `badge?: number` — iOS (`0` скидає bezerk).
- `threadId?: string` — APNs grouping.
- `url?: string` — top-level deep-link, прокидається у `data.url`. Top-level має пріоритет.
- `silent?: boolean` — APNs `aps.content-available=1` + `apns-push-type=background` + `apns-priority=5`, FCM data-only payload з `android.priority=high`. Web ігнорує (SW сам вирішує, що показати).

**Зміна форми `PushPayload`** = одночасна правка серверного відправника + клієнтського SW + mobile handler-а в одному PR (analog до rule #3 з `AGENTS.md` для API-contract).

### Consequences

**Позитивні:**

- Один тип на 3 runtime — TS не дозволить використати `payload.foobar` без декларації.
- `silent: true` documented в одному місці; кожна платформа знає, які заголовки потрібні.

**Негативні:**

- Зміна payload-у тригерить три PR-edit-и одночасно. Перевіряємо ревʼю; CI ловить через `apps/server/src/push/send.test.ts` + Playwright smoke-e2e (web).

### Alternatives considered

— Per-platform тип (`WebPushPayload`/`ApnsPayload`/`FcmPayload`) + transformer. Овергіл; SAme поля, лише трохи відрізняється serialization. Spent-budget краще на shared-test, що assert-ить серіалізатор з payload-у на всі три формати.

---

## Implementation status

- ✅ `sendToUser` — в `apps/server/src/push/send.ts`, ~700 LOC, ~25 тестів у `send.test.ts`.
- ✅ `sendToUserQuietly` — fire-and-forget wrapper.
- ✅ `webpushSend` — timeout + circuit breaker + outcome enum.
- ✅ `apnsClient` / `fcmClient` — okремі модулі, тестовані.
- ✅ `push_subscriptions` (003) + `push_devices` (006) — з partial-індексом `WHERE deleted_at IS NULL`.
- ✅ `PushPayload` — у `@sergeant/shared`, документований.
- ✅ Web SW handler — `apps/web/src/sw.ts` (`push`, `notificationclick` з `data.url` routing).
- ✅ Playbook `add-push-notification.md` — pуточний how-to.
- ⏳ Уніфікація `push_subscriptions` → `push_devices` (rolling migration two-phase) — у roadmap.
- ⏳ Mobile native registration UI (зараз mobile-shell використовує web-push через WKWebView; native APNs — заплановано).

## Open questions

- **VAPID JWT rotation.** `VAPID_PRIVATE_KEY` живе в env-var Railway. Ротація = rotate ключа + invalidate всіх web-push subscriptions (перепідписка). Поки документуємо як hot-fix-операцію, без auto-rotation.
- **Localization.** `title`/`body` зараз приходять як final string (за замовчуванням укр.). Multi-locale потребує перекладу на серверній стороні (`i18n-key + params` у payload, replaceAt-render у клієнті). Окремий ADR коли вийдемо в EN/PL.
- **Quotas.** Anti-spam: коли scheduler нагадує юзеру 5 разів за день — зловживання. Поки rely on клієнтський SW, що `Notification.permission` revokes на user-level. Server-side quota table (`push_quota_daily`) — open question.
