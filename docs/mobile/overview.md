# Mobile client — API contract

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Референс для Expo/React Native клієнта Sergeant. Сервер уже підготовлений
(ця сесія: API v1, bearer-auth, push/register). Сам мобільний код —
наступна сесія.

## Auth

- Базовий URL: той самий, що й для web. Мобілка шле всі запити у `/api/v1/*`.
- Сесія: `Authorization: Bearer <token>`, де `<token>` отримується з
  відповіді `POST /api/auth/sign-in/email` (Better Auth віддає токен у
  `set-auth-token` header, клієнт `@better-auth/expo/client` збирає його
  в `expo-secure-store` автоматично).
- Cookie на мобілці НЕ використовуються — Better Auth bearer-плагін
  конвертує токен у in-memory "сесію" на сервері, тому усі хендлери, що
  історично покладаються на `getSessionUser`, працюють прозоро.
- Sign-out: `POST /api/auth/sign-out` з тим самим `Authorization` header;
  сервер інвалідує сесію, клієнт видаляє токен зі SecureStore.

## Deep links

Мобільний клієнт мусить підтримати наступні URL-схеми:

| Scheme                             | Куди веде                                           |
| ---------------------------------- | --------------------------------------------------- |
| `sergeant://`                      | Головний хаб (equivalent to tab root)               |
| `sergeant://workout/{id}`          | Екран конкретного тренування (fizruk)               |
| `sergeant://workout/new`           | Створення тренування                                |
| `sergeant://food/log`              | Щоденник їжі (nutrition, поточний день)             |
| `sergeant://food/scan`             | Barcode-сканер для nutrition                        |
| `sergeant://food/pantry`           | Комора (pantry)                                     |
| `sergeant://food/recipe/{id}`      | Детальна карточка рецепта (MMKV, імпорт JSON з web) |
| `sergeant://finance`               | Finyk — дашборд фінансів                            |
| `sergeant://finance/tx/{id}`       | Конкретна транзакція                                |
| `sergeant://routine`               | Routine — список звичок                             |
| `sergeant://routine/habit/{id}`    | Конкретна звичка                                    |
| `sergeant://settings`              | Налаштування (профіль, push, sync)                  |
| `sergeant://auth/callback?token=…` | OAuth/password-reset callback (Better Auth Expo)    |

Expo `scheme: "sergeant"` у `app.json`. Dev-клієнт додатково обробляє
`exp://` (Expo Go) і `http://localhost:8081` (Metro web) — обидва вже
в `trustedOrigins` сервера, щоб Better Auth не різав 403.

## Push notifications

### Register (клієнт → сервер)

```
POST /api/v1/push/register
Authorization: Bearer <token>
Content-Type: application/json

// Web (PWA, service worker):
{ "platform": "web",
  "token": "https://fcm.googleapis.com/wp/xxx",
  "keys": { "p256dh": "...", "auth": "..." } }

// iOS (APNs device token):
{ "platform": "ios", "token": "64-hex-chars" }

// Android (FCM registration token):
{ "platform": "android", "token": "FCM-token-up-to-4KB" }
```

Відповідь: `200 { ok: true, platform }`. Upsert ідемпотентний — повторна
реєстрація того самого токена просто оновлює `updated_at` (див.
`apps/server/src/migrations/006_push_devices.sql`).

### Клієнтський виклик (Expo)

Мобільний клієнт НЕ шле прямий `fetch` — усі виклики йдуть через
`@sergeant/api-client`. Після логіну `PushRegistrar`
(`apps/mobile/src/features/push/PushRegistrar.tsx`) автоматично:

1. питає дозвіл через `expo-notifications`;
2. бере native APNs/FCM токен (`getDevicePushTokenAsync()`); у Expo Go
   — fallback на `getExpoPushTokenAsync()` з попередженням у консолі;
3. кладе його у `AsyncStorage` під ключем `push:lastToken:<userId>`
   (scoped на юзера — щоб після зміни акаунта на тому самому пристрої
   знову відбулась реєстрація) і шле:

```ts
import { useApiClient } from "@sergeant/api-client/react";

const api = useApiClient();
await api.push.register({ platform: "ios", token: devicePushToken });
// → POST /api/v1/push/register, валідовано PushRegisterResponseSchema
```

Повторні логіни з тим самим токеном не тригерять повторний запит —
`registerPush` перевіряє `AsyncStorage`-кеш.

### Сервер → пристрій

Сервер-сайд fan-out живе в `apps/server/src/push/send.ts::sendToUser(userId, payload)`
і викликається з `POST /api/v1/push/test` (ручка «пульнути тестовий пуш на всі
мої пристрої») та з бізнес-флоу (coach nudges, reminders) через
`sendToUserQuietly`. `sendToUser` читає обидві таблиці — `push_devices`
(native iOS/Android) і `push_subscriptions` (web) — і паралельно доставляє
payload трьома каналами:

- **Web** — `sendWebPush` (`apps/server/src/lib/webpushSend.ts`) через VAPID.
  Внутрішній `POST /api/push/send` (з `X-Api-Secret` для cron/worker-ів) —
  web-only, використовує той самий шлях.
- **iOS** — APNs HTTP/2 через `@parse/node-apn` з JWT-аутентифікацією
  (`apps/server/src/push/apnsClient.ts`). Конфіг — env:
  - `APNS_P8_KEY` — вміст `.p8` PEM-ключа (підтримує `\n`/`\r\n` escapes для
    shell-env-ів; сервер нормалізує).
  - `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` — з Apple Developer.
  - `APNS_PRODUCTION=true` → `api.push.apple.com`, інакше
    `api.sandbox.push.apple.com` (TestFlight/dev-build).
- **Android** — FCM HTTP v1 (`https://fcm.googleapis.com/v1/projects/{id}/messages:send`)
  з OAuth2 Bearer через `google-auth-library` (`apps/server/src/push/fcmClient.ts`).
  Конфіг — env:
  - `FCM_SERVICE_ACCOUNT_JSON` — base64-encoded JSON service-account-а
    (поля `project_id`, `client_email`, `private_key`). Сервер декодує base64
    і парсить на boot; невалідний JSON → warn-log + FCM sender disabled,
    але решта (APNs/web) продовжує працювати.

`sendToUser` повертає агрегований `{ delivered: { ios, android, web }, cleaned, errors[] }`:

- `delivered` — скільки пристроїв на кожній платформі отримали 2xx.
- `cleaned` — скільки мертвих токенів/підписок сервер видалив у цьому
  виклику. APNs 410 / BadDeviceToken / Unregistered → `DELETE FROM push_devices`.
  FCM UNREGISTERED / SENDER_ID_MISMATCH / NOT_FOUND → `DELETE FROM push_devices`.
  FCM `INVALID_ARGUMENT` навмисно НЕ тригерить cleanup (однаковий payload
  на fan-out-і міг би знести всі Android-токени юзера разом — детальніше у
  коментарі в `send.ts`). Web 404/410 → soft-delete у `push_subscriptions`.
- `errors[]` — per-device помилки без cleanup (транзієнтні 5xx/429 після
  вичерпання retry-лімітів, мережеві таймаути тощо). Retry policy — 3 спроби
  з exponential-backoff-ом 200/1000/3000 мс для APNs 5xx/429 та FCM 5xx/429;
  4xx без dead-коду (401/403/400) ретраїти безсенсу — сервер зупиняється
  і реєструє error.

Якщо обов'язкові env-и відсутні — сенд-шлях цієї платформи стає no-op
(warn-log на boot, `error: "apns_disabled"` / `"fcm_disabled"` per-call).
Це навмисно: так один відсутній Firebase service-account не валить увесь
процес, і web/ios продовжують працювати.

#### Payload-контракт

`PushPayload` (`packages/shared/src/types/index.ts`) — один shape для всіх
трьох каналів, сервер сам мапить у APNs/FCM/web-push формати:

| Поле       | iOS (APNs)                                                                                       | Android (FCM v1)                                                                                   | Web                                             |
| ---------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `title`    | `aps.alert.title`                                                                                | `notification.title`                                                                               | `{title}` у JSON                                |
| `body`     | `aps.alert.body`                                                                                 | `notification.body`                                                                                | `{body}` у JSON                                 |
| `data`     | top-level поля поруч з `aps`                                                                     | `message.data` (stringified)                                                                       | `{data}` inline у JSON                          |
| `badge`    | `aps.badge`                                                                                      | `apns.payload.aps.badge` (через FCM→APNs)                                                          | —                                               |
| `threadId` | `aps.thread-id`                                                                                  | —                                                                                                  | —                                               |
| `url`      | `payload.url` (top-level)                                                                        | `data.url`                                                                                         | `data.url`                                      |
| `silent`   | `aps.content-available=1`, `apns-push-type: background`, `apns-priority: 5`, без `alert`/`sound` | data-only (без `notification`), `android.priority=high`, `apns.headers.apns-push-type: background` | не інтерпретується (service-worker сам вирішує) |

Top-level `url` перезаписує `data.url`, якщо юзер передав обидва — щоб контракт
APNs (де `url` завжди у top-level payload) та FCM/web (де `url` у `data.url`)
збігався на клієнті.

Silent-push (background delivery) на APNs вимагає всі три заголовки одночасно:
без `apns-push-type: background` Apple поверне `BadDeviceToken`, без `priority 5` —
`InvalidPushType`. На FCM (який проксує APNs для iOS-шару, якщо токен
походить з `@capacitor/push-notifications` і не з нативного APNs) ми дублюємо
ці самі заголовки у `message.apns.headers`.

## Rate limiting

Усі мобільні запити мають `Authorization: Bearer`, тому:

- `apps/server/src/modules/chat/aiQuota.ts` — ключ `u:{userId}` (не IP). Переключення з Wi-Fi на
  мобільну мережу НЕ скидує квоту.
- `apps/server/src/http/rateLimit.ts` — теж `u:{userId}` за умови, що
  `requireSession()` відпрацював до rate-limit-middleware. Для публічних
  роутів (напр., `/api/push/vapid-public` — воно і так поза лімітером)
  ключ лишається `ip:{...}`.

## CORS

Production сервер читає `ALLOWED_ORIGINS` (comma-separated) і
`ALLOWED_ORIGIN_REGEX` з env. Hardcoded defaults:

- `http://localhost:5173/4173/5000/8081` — dev
- `https://sergeant.vercel.app`, `https://sergeant.2dmanager.com.ua` — prod

Нативні клієнти (Expo native build) Origin не шлють, тому CORS на них не
спрацьовує — але Expo web (`http://localhost:8081`) вже в allow-list.

## Що мобільний клієнт НЕ мусить робити

- Самому переписувати `/api/...` → `/api/v1/...`. Просто хардкодити v1 одразу.
- Відправляти `X-Api-Secret` — це внутрішній cron-header для
  `/api/push/send`, мобілка його ніколи не бачить.
- Дублювати push-реєстрацію — endpoint upsert-ом сам розбереться.
