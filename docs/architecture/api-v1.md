# API v1 — версіонування

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Коротка довідка, як влаштоване версіонування Sergeant-API і коли куди ходити.

## TL;DR

- Усі існуючі маршрути доступні **одночасно** на `/api/*` і `/api/v1/*`.
- Bреб-клієнт (див. `apps/web/src/shared/lib/apiUrl.ts`) за замовчуванням шле в `/api/v1/*`.
- Mobile/Expo-клієнт — зобов'язаний шле в `/api/v1/*`.
- Жодного дублювання роутерів: сервер переписує `req.url` на канонічний
  `/api/...` ще до маршрутизації (див. `apiVersionRewrite` у `apps/server/src/app.ts`).

## Чому саме так

- **Zero-breaking-change для фронта.** `/api/*` лишається робочим префіксом
  — якщо треба відкотити фронтенд-реліз, старий код продовжує працювати.
- **Один код — дві точки входу.** Немає `v1Router`/`legacyRouter`-дубля, який
  розходиться за півроку. Middleware переписування дешевий (дві умови +
  slice рядка) і тестується окремо у `apps/server/src/smoke.test.ts` та `apps/server/src/routes/apiV1.test.ts`.
- **Гнучкий rollout для фронта.** `VITE_API_VERSION=none` повертає
  старий `/api/*` префікс без редеплою сервера — корисно як escape hatch.

## `@sergeant/api-client` — дефолтний префікс

Пакет `@sergeant/api-client` (який імпортує і web, і мобілка) переписує
шляхи вигляду `/api/<rest>` на `${apiPrefix}<rest>` у середині `httpClient`:

- За замовчуванням `apiPrefix === "/api/v1"`, тож виклик
  `apiClient.push.subscribe(...)` фактично йде у `/api/v1/push/subscribe`.
- `/api/auth/*` виключено — Better Auth-плагіни зашиті під
  `basePath: "/api/auth"`.
- Шляхи, що вже починаються з `apiPrefix` (напр. явний `/api/v1/foo`), —
  ідемпотентні, префікс двічі не додається.
- Escape hatch — передати `apiPrefix: "/api"` у `createApiClient(...)`
  повертає легасі-поведінку без змін в endpoint-обгортках.

Web прокидає `apiPrefix` через `getApiPrefix()` (див. `apps/web/src/shared/lib/apiUrl.ts`),
щоб і прямі `fetch(apiUrl(...))`, і виклики через api-client одночасно
перемикалися однією змінною `VITE_API_VERSION`.

## Авторизація — не версіонується

`/api/auth/*` свідомо **не** переписується у `/api/v1/auth/*`:

- Better Auth-плагіни (react client, Expo client) зашиті під фіксований
  `basePath: "/api/auth"` — змінити його без кастом-форків неможливо.
- `apiUrl("/api/auth/...")` у фронтенді пропускає шлях як є.

Якщо треба зламати compatibility у auth-flow — робимо це через нові методи
(`/api/auth/...` лишається, з'являється, напр., `/api/v2/auth/...`), а не
через редагування існуючих.

## Нові endpoint-и v1

- `POST /api/v1/push/register` — див. `docs/mobile/overview.md`.
- `GET /api/v1/me` — уніфікований "хто я" для web cookie і mobile bearer.

Усі решта endpoint-ів `v1` — це дзеркало існуючих `/api/*` без змін у
контрактах. Додавати нові endpoint-и — ЗАВЖДИ одразу під `/api/...`; дзеркало
під `/api/v1/...` вмикається автоматично.

## Як ми це тестуємо

- `apps/server/src/smoke.test.ts` та `apps/server/src/routes/apiV1.test.ts` — для ключових роутів перевіряють, що обидва префікси
  повертають однакову відповідь (status, тіло, ключові заголовки).
- `apps/server/src/routes/me.ts` реалізує `/api/v1/me` (cookie-сесія або `Authorization: Bearer`);
  покриття — в тих же v1-смоуках.

## FAQ

**Чи можна в `/api/v1` додавати нове, чого нема в `/api/`?**
Технічно так (умовно через власний router, змонтований на `/api/v1`), але
для поточного сервера ми свідомо тримаємо дзеркало 1:1. Різні контракти для
двох версій з'являться лише, коли нам знадобиться `v2` — тоді `v1` заморожуємо.

**Коли прибирати `/api/*`?**
Не раніше, ніж закінчиться rollout мобільного клієнта І жоден ендпоінт у
фронтенді не ходить через `VITE_API_VERSION=none`. Зараз приблизний таргет —
після тесту мобільного beta-релізу.
