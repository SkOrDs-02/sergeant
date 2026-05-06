# API v1 — версіонування і контракт

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Коротка довідка, як влаштоване версіонування Sergeant-API, гарантії контракту і міграційна стратегія.

## TL;DR

- Усі існуючі маршрути доступні **одночасно** на `/api/*` і `/api/v1/*`
- Web-клієнт (див. `apps/web/src/shared/lib/api/apiUrl.ts`) за замовчуванням шле в `/api/v1/*`
- Mobile/Expo-клієнт — зобов'язаний шле в `/api/v1/*`
- Жодного дублювання роутерів: сервер переписує `req.url` на канонічний `/api/...` ще до маршрутизації (див. `apiVersionRewrite` у `apps/server/src/app.ts`)

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

Web прокидає `apiPrefix` через `getApiPrefix()` (див. `apps/web/src/shared/lib/api/apiUrl.ts`), щоб і прямі `fetch(apiUrl(...))`, і виклики через api-client одночасно перемикалися однією змінною `VITE_API_VERSION`.

## 🔐 Авторизація — не версіонується

`/api/auth/*` свідомо **не** переписується у `/api/v1/auth/*`:

- Better Auth-плагіни (react client, Expo client) зашиті під фіксований `basePath: "/api/auth"` — змінити без кастом-форків неможливо
- `apiUrl("/api/auth/...")` у фронтенді пропускає шлях як є

Якщо треба зламати compatibility у auth-flow — робимо це через нові методи (`/api/auth/...` лишається, з'являється, напр., `/api/v2/auth/...`), а не через редагування існуючих.

## ✨ Нові endpoint-и v1 (Phase 2+)

- `POST /api/v1/push/register` — реєстрація native push (APNs/FCM). Див. [`docs/mobile/overview.md`](../mobile/overview.md)
- `GET /api/v1/me` — уніфікований "хто я" для web (cookie) і mobile (bearer)
- `POST /api/v1/sync` — CloudSync push/pull контракт

Усі решта endpoint-ів `v1` — це дзеркало існуючих `/api/*` без змін у контрактах. **Правило:** додавати нові endpoint-и — ЗАВЖДИ одразу під `/api/...`; дзеркало під `/api/v1/...` вмикається автоматично.

## 🧪 Як ми це тестуємо

- `apps/server/src/smoke.test.ts` та `apps/server/src/routes/apiV1.test.ts` — для ключових роутів перевіряють, що обидва префікси повертають однакову відповідь (status, тіло, ключові заголовки)
- `apps/server/src/routes/me.ts` реалізує `/api/v1/me` (cookie-сесія або `Authorization: Bearer`); покриття — в тих же v1-смоуках
- Гарантії контракту тримаються через Zod-схеми у `packages/shared/src/schemas/api.ts` (діє для обох версій)

## ❓ FAQ

**Чи можна в `/api/v1` додавати нове, чого нема в `/api/`?**

Технічно так (умовно через власний router, змонтований на `/api/v1`), але для поточного сервера ми свідомо тримаємо дзеркало 1:1. Різні контракти для двох версій з'являться лише, коли нам знадобиться `v2` — тоді `v1` заморожуємо.

**Коли прибирати `/api/*`?**

Не раніше, ніж закінчиться rollout мобільного клієнта І жоден ендпоінт у фронтенді не ходить через `VITE_API_VERSION=none`. Зараз приблизний таргет — після тесту мобільного beta-релізу (Фаза 3 / 2026-Q4).

**Яке SLA на backward-compatibility для `/api/v1/*`?**

Мінімум 6 місяців (до наступної версії сервера). Breaking changes — тільки через ADR + оповіщення мобільним клієнтам за місяць.

---

## 📞 Related docs

- **Server implementation:** `apps/server/src/app.ts` — `apiVersionRewrite` middleware
- **Client usage:** `apps/web/src/shared/lib/api/apiUrl.ts` і `packages/api-client/src/client.ts`
- **Shared schemas:** `packages/shared/src/schemas/api.ts`
- **Mobile API:** [`docs/mobile/overview.md`](../mobile/overview.md)
- **Architecture overview:** [`docs/architecture/service-catalog.md`](./service-catalog.md)
