# ADR-0053: API versioning policy — `/api/*` ↔ `/api/v1/*` mirror

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/architecture/api-v1.md`](../architecture/api-v1.md)
  - [`docs/initiatives/stack-pulse-2026-05/pr-08-api-versioning-consolidation.md`](../initiatives/stack-pulse-2026-05/pr-08-api-versioning-consolidation.md)
  - [`docs/notes/spikes/2026-05-api-v1-usage.md`](../notes/spikes/2026-05-api-v1-usage.md)

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.

## Context

Поточна реалізація — single express-router, виставлений на `/api/*`, і
`apiVersionRewrite` middleware (`apps/server/src/app.ts:43-55`), що переписує
`/api/v1/*` → `/api/*` ще до маршрутизації. У результаті обидва префікси
повертають однаковий response — це 1:1 mirror.

Stack-pulse-2026-05 PR-08 пропонував видалити shim, припускаючи, що клієнти
ніколи не використовують `/v1/`. Research-фаза показала, що це **не так**:

- Web (за замовчуванням), mobile (примусово), mobile-shell і `@sergeant/api-client`
  усі шлють у `/api/v1/*`. Деталі — у [spike `2026-05-api-v1-usage.md`](../notes/spikes/2026-05-api-v1-usage.md).
- Видалення shim сьогодні = breaking change для всіх клієнтів.
- Видалення `/api/*`-префікса мало б більше сенсу (всі клієнти вже на `/v1`),
  але ми не хочемо ламати rollback-шлях через `VITE_API_VERSION=none`.

Потрібно зафіксувати, **коли і як** ми все-таки рухаємось до one-prefix-а.

## Decision

1. **Лишаємо `/api/*` ↔ `/api/v1/*` mirror як стабільний контракт.** Жодне
   PR не видаляє `apiVersionRewrite` без виконання критеріїв нижче.
2. **Канонічний шлях для нових routes — `/api/<path>`.** Mirror під
   `/api/v1/<path>` вмикається автоматично через `apiVersionRewrite`.
3. **`v2` тільки за наявності реальної розбіжності контрактів.** Прості
   eager-rewrite-и (типу зміни payload-структури) не вимагають окремого
   роутера: bump-имо OpenAPI revision, лишаємо routes на тому ж префіксі.
4. **Видалення legacy `/api/*`-префікса** дозволено лише після:
   - mobile beta-rollout-у завершено (`docs/architecture/api-v1.md` #FAQ);
   - усі web-клієнти на `VITE_API_VERSION=v1` (default) — підтверджено через
     access-log або Sentry breadcrumb;
   - відсутність активних інтеграцій, що ходять у `/api/*` напряму.
5. **Видалення `/api/v1/*` mirror** дозволено лише разом із появою `v2`,
   коли `/api/v1/*` буде заморожено та має окремий маршрутний шар.

## Consequences

**Позитивні:**

- Backward-compat web (`VITE_API_VERSION=none`) лишається working escape-hatch.
- Нові routes не дублюються; Zod-схеми в `packages/shared` валідні для обох префіксів.
- Чітко описані тригери, коли допустимо чистити префікс.

**Негативні:**

- Plain `/api/*` ↔ `/api/v1/*` mirror створює оманливе враження про
  «справжнє» версіонування. Mitigation: жирний disclaimer у
  `docs/architecture/api-v1.md` + ADR-цей.
- Технічний борг shim-а лишається, доки не закриється mobile beta.

**Нейтральні:**

- При появі `v2` потрібно одразу узгодити `@sergeant/api-client.DEFAULT_API_PREFIX`
  - `apiUrl.DEFAULT_API_VERSION` + ADR-update.

## Альтернативи

**A. Видалити shim прямо зараз (PR-08 original plan).**
Відхилено: ламає prod-mobile (всі native push-flow-и шлють `/api/v1/*`
— `apps/mobile-shell/src/pushNative.ts`). Migration cost > benefit.

**B. `Accept: application/vnd.sergeant.v2+json` header-based versioning.**
Відхилено: потребує форку Better Auth-плагінів, не сумісно з простими
`fetch(apiUrl)` викликами. Path-based уже знайомий fetch-кешу і CDN-у.

**C. Видалити `/api/*`-префікс, лишити тільки `/api/v1/*`.**
Відкладено: вимагає одночасного оновлення (a) `apiUrl` web без default; (b)
всіх ad-hoc `fetch("/api/...")` викликів у webview-shell-ах; (c) WebSocket
upgrade-path-у (`/api/sync/*`). Зробимо після mobile-beta.

## Trigger to revisit

- Поява `v2`-плану з реальним contract-divergence.
- Завершення mobile beta-rollout-у (target 2026-Q4 за `docs/architecture/api-v1.md`).
- Quantitative log-evidence, що `/api/*` без `v1`-префікса має нульовий traffic
  від сторонніх інтеграцій (тоді можна видалити legacy-prefix).

## Refs

- [`apps/server/src/app.ts:29-55`](../../apps/server/src/app.ts) — `apiVersionRewrite` middleware.
- [`apps/server/src/routes/apiV1.test.ts`](../../apps/server/src/routes/apiV1.test.ts) — supertest-покриття обох префіксів.
- [Stripe API versioning guide](https://stripe.com/docs/api/versioning) — інспірація для header-based стратегії (rejected here).
- [HTTP `Sunset` header — RFC 8594](https://datatracker.ietf.org/doc/html/rfc8594) — потрібно буде, якщо в майбутньому видалятимемо префікс.
