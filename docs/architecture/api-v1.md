# API v1 + v2 — версіонування і контракт

> **Last validated:** 2026-05-07 by @Skords-01. **Next review:** 2026-08-05.
> **Status:** Active

Коротка довідка, як влаштоване версіонування Sergeant-API, гарантії контракту і міграційна стратегія.

## TL;DR

- Усі існуючі маршрути доступні **одночасно** на `/api/*` і `/api/v1/*`
- Web-клієнт (div. `apps/web/src/shared/lib/api/apiUrl.ts`) за замовчуванням шле в `/api/v1/*`
- Mobile/Expo-клієнт — зобов'язаний шле в `/api/v1/*`
- Жодного дублювання роутерів: сервер переписує `req.url` на канонічний `/api/...` ще до маршрутизації (div. `apiVersionRewrite` у `apps/server/src/app.ts`)
- **`POST /api/sync` і `GET /api/sync` (v1 blob sync) — повертають `410 Gone`** (ADR-0047). Sync вибудовується виключно через v2: `POST /api/v2/sync/push` і `GET /api/v2/sync/pull`.

## 🎯 Чому саме так

- **Zero-breaking-change для фронта.** `/api/*` лишається робочим префіксом — якщо треба відкотити фронтенд-реліз, старий код продовжує працювати
- **Один код — дві точки входу.** Немає `v1Router`/`legacyRouter`-дубля, який розходиться за півроку. Middleware переписування дешевий (дві умови + slice рядка) і тестується окремо у `apps/server/src/smoke.test.ts` та `apps/server/src/routes/apiV1.test.ts`
- **Гнучкий rollout для фронта.** `VITE_API_VERSION=none` повертає старий `/api/*` префікс без редеплою сервера — корисно як escape hatch

## 📦 `@sergeant/api-client` — дефолтний префікс

Пакет `@sergeant/api-client` (який імпортує і web, і мобілка) переписує шляхи вигляду `/api/<rest>` на `${apiPrefix}<rest>` у середині `httpClient`:

- За замовчуванням `apiPrefix === "/api/v1"`, тож виклик `apiClient.push.subscribe(...)` фактично йде у `/api/v1/push/subscribe`
- `/api/auth/*` виключено — Better Auth-плагіни зашиті під `basePath: "/api/auth"` (не можна змінити без форків)
- Шляхи, що вже починаються з `apiPrefix` (напр. явний `/api/v1/foo`), — ідемпотентні, префікс двічі не додається
- Escape hatch — передати `apiPrefix: "/api"` у `createApiClient(...)` повертає легасі-поведінку без змін в endpoint-обгортках
- **Sync v2** endpoint-и (`/api/v2/sync/*`) не проходять через `apiVersionRewrite` і адресуються напряму — обгортки у `@sergeant/api-client` (`SyncEnginePushScheduler`, `SyncEngineFlushOnReconnect`) використовують абсолютні шляхи.

Web прокидає `apiPrefix` через `getApiPrefix()` (div. `apps/web/src/shared/lib/api/apiUrl.ts`), щоб і прямі `fetch(apiUrl(...))`, і виклики через api-client одночасно перемикалися однією змінною `VITE_API_VERSION`.

## 🔐 Авторизація — не версіонується

`/api/auth/*` свідомо **не** переписується у `/api/v1/auth/*`:

- Better Auth-плагіни (react client, Expo client) зашиті під фіксований `basePath: "/api/auth"` — змінити без кастом-форків неможливо
- `apiUrl("/api/auth/...")` у фронтенді пропускає шлях як є

Якщо треба зламати compatibility у auth-flow — робимо це через нові методи (`/api/auth/...` лишається, з'являється, напр., `/api/v2/auth/...`), а не через редагування існуючих.

## ✨ Каталог активних endpoint-ів

### v1 endpoints (дзеркало `/api/*` ↔ `/api/v1/*`)

| Endpoint                | Method   | Опис                                                         |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `/api/v1/me`            | GET      | Уніфікований "хто я" для web (cookie) і mobile (bearer)      |
| `/api/v1/push/register` | POST     | Реєстрація native push (APNs/FCM)                            |
| `/api/v1/chat`          | POST     | HubChat streaming (SSE) + tool-use                           |
| `/api/v1/coach/*`       | GET/POST | Weekly digest, coaching recommendations                      |
| `/api/v1/mono/*`        | GET/POST | Monobank: connect, accounts, transactions, backfill          |
| `/api/v1/ai-memory/*`   | GET/POST | AI memory ingest / recall                                    |
| `/api/v1/push/send`     | POST     | Internal push send (service-to-service, X-Api-Secret header) |
| `/api/v1/nutrition/*`   | GET/POST | Nutrition log, barcode, backup                               |
| `/api/v1/transcribe`    | POST     | Audio → text (Whisper). USD-cap per user/day                 |
| `/api/v1/billing/*`     | GET/POST | Stripe checkout, subscription status, webhooks               |
| `/api/v1/waitlist`      | POST     | Waitlist sign-up                                             |

### v2 endpoints (новий namespace, не через `apiVersionRewrite`)

| Endpoint            | Method | Опис                                                     |
| ------------------- | ------ | -------------------------------------------------------- |
| `/api/v2/sync/push` | POST   | Sync op-log batch push. Body: `{ops, device_id, cursor}` |
| `/api/v2/sync/pull` | GET    | Pull remote ops. Query: `?since=<cursor>`                |

### Знято (410 Gone)

| Endpoint         | Причина                                              |
| ---------------- | ---------------------------------------------------- |
| `POST /api/sync` | v1 blob sync знятий (ADR-0047). Повертає `410 Gone`. |
| `GET /api/sync`  | v1 blob pull знятий (ADR-0047). Повертає `410 Gone`. |

## 🧪 Як ми це тестуємо

- `apps/server/src/smoke.test.ts` та `apps/server/src/routes/apiV1.test.ts` — для ключових роутів перевіряють, що обидва префікси повертають однакову відповідь (status, тіло, ключові заголовки)
- `apps/server/src/routes/me.ts` реалізує `/api/v1/me` (cookie-сесія або `Authorization: Bearer`); покриття — в тих же v1-смоуках
- `apps/server/src/modules/sync/syncV2.test.ts` — push/pull контракт для v2
- Гарантії контракту тримаються через Zod-схеми у `packages/shared/src/schemas/api.ts` (діє для обох версій)

## ❓ FAQ

**Чи можна в `/api/v1` додавати нове, чого нема в `/api/`?**

Технічно так (умовно через власний router, змонтований на `/api/v1`), але для поточного сервера ми свідомо тримаємо дзеркало 1:1. Різні контракти для двох версій з'являться лише, коли нам знадобиться `v3` — тоді `v1` заморожуємо.

**Коли прибирати `/api/*`?**

Не раніше, ніж закінчиться rollout мобільного клієнта І жоден ендпоінт у фронтенді не ходить через `VITE_API_VERSION=none`. Зараз приблизний таргет — після тесту мобільного beta-релізу (Фаза 3 / 2026-Q4).

**Яке SLA на backward-compatibility для `/api/v1/*`?**

Мінімум 6 місяців (до наступної версії сервера). Breaking changes — тільки через ADR + оповіщення мобільним клієнтам за місяць.

**Чому v1 sync повертає 410 Gone, а не 404?**

`410 Gone` — HTTP-семантика для "ресурс свідомо видалений, клієнт не повинен retry". Це явний сигнал старим клієнтам (якщо такі є) зупинити polling. `404` був би двозначним.

---

## 📞 Related docs

- **Server implementation:** `apps/server/src/app.ts` — `apiVersionRewrite` middleware
- **Client usage:** `apps/web/src/shared/lib/api/apiUrl.ts` і `packages/api-client/src/httpClient.ts`
- **Shared schemas:** `packages/shared/src/schemas/api.ts`
- **Sync v2 architecture:** [`docs/architecture/diagrams/c3-cloudsync.md`](./diagrams/c3-cloudsync.md)
- **Mobile API:** [`docs/mobile/overview.md`](../mobile/overview.md)
- **Architecture overview:** [`docs/architecture/service-catalog.md`](./service-catalog.md)
