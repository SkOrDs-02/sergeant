# Spike: чи активний `/api/v1/*` префікс

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Done — research complete

## TL;DR

Початкова гіпотеза `pr-08-api-versioning-consolidation.md` («shim існував just in case,
клієнти ніколи не вказували `/v1/`») **спростована**. Усі активні клієнти за
замовчуванням ходять у `/api/v1/*`; це задокументовано в
[`docs/architecture/api-v1.md`](../../architecture/api-v1.md). Видалити
`apiVersionRewrite` зараз **не можна без breaking change** для мобільного клієнта.

Рішення: лишити mirror `/api/*` ↔ `/api/v1/*` чинним, формалізувати правила в
[ADR-0053](../../adr/0053-api-versioning-policy.md), а PR-08 закрити по
research-фазі.

## Що ми перевіряли

PR-08 ставив гарантію (DoD):

> 30-day Vercel/Railway log analysis report.
> Якщо usage == 0 → shim видалений, OpenAPI clean.
> Якщо usage > 0 → 90-day deprecation plan з `Sunset:` header.

Перш ніж збирати логи, ми перевірили **базову передумову**: чи дійсно жоден
клієнт не ходить у `/v1/`. Передумова виявилась хибною — переходимо на
code-evidence-driven decision (логи лише підтвердили б очевидне).

## Evidence: клієнти за замовчуванням шлють у `/api/v1/*`

Усі точки входу до сервера **уже** додають `/v1/` префікс на стороні клієнта:

| Клієнт                                               | Файл                                       | Default                                                        |
| ---------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Web (`fetch(apiUrl(...))`)                           | `apps/web/src/shared/lib/api/apiUrl.ts:18` | `DEFAULT_API_VERSION = "v1"` → `/api/v1/*`                     |
| Web/Mobile/Mobile-Shell через `@sergeant/api-client` | `packages/api-client/src/httpClient.ts:62` | `DEFAULT_API_PREFIX = "/api/v1"`                               |
| Mobile (Expo)                                        | `apps/mobile/src/api/apiUrl.ts:9-11`       | «ЗАВЖДИ шлемо у `/api/v1/*`» — без escape-hatch                |
| Mobile-Shell (native push)                           | `apps/mobile-shell/src/pushNative.ts`      | Прямі URL-и `/api/v1/push/register`, `/api/v1/push/unregister` |

Контракт для обох префіксів — один і той самий router, який віддається через
`apiVersionRewrite` (`apps/server/src/app.ts:43-55`); це дзеркало 1:1
протестовано в `apps/server/src/routes/apiV1.test.ts` (status, body, headers).

## Чому Vercel logs самі по собі недостатньо

Vercel хостить тільки **frontend** (`apps/web`). API живе на окремому домені
`https://api.sergeant.app` (див. CSP у `apps/web/vercel.json:23`,
`connect-src ... https://api.sergeant.app`). Тобто Vercel access logs
**не бачать** `/api/v1/*` запити — вони ідуть прямо в Railway-проксі.

Альтернативи (на майбутнє, якщо знадобиться кількісна оцінка):

- Railway HTTP-access logs (`railway logs`) — є вся історія per-route, але
  кардиналити `/api/v1/*` vs `/api/*` доведеться regex-ом.
- Sentry breadcrumbs у `apiVersionRewrite` (додати тег `api_v1_called`) —
  cheap monitoring, ~10 рядків коду.
- pino `requestLogMiddleware` — додати поле `apiVersionPrefix` → агрегувати у
  Loki/Datadog.

Зараз ми цього не робимо, бо decision уже видно з коду.

## Decision

**Лишити shim як stable contract** до моменту, коли:

1. з’явиться реальний `v2`-split (розбіжність контрактів) — тоді `v1`
   заморожується, `v2` отримує власний router; або
2. сонячно догорить mobile beta (target за `docs/architecture/api-v1.md` —
   2026-Q4): ми зможемо **видалити legacy `/api/*`-префікс**, лишивши тільки
   `/api/v1/*`.

Видаляти `/api/v1/*` shim сьогодні **категорично не можна** — це збиває
prod-mobile одним релізом сервера.

## Action items

- [x] [ADR-0053](../../adr/0053-api-versioning-policy.md) — політика
      версіонування + умови видалення shim.
- [x] [`pr-08-api-versioning-consolidation.md`](../../initiatives/stack-pulse-2026-05/pr-08-api-versioning-consolidation.md)
      — статус оновлений на «Closed — research, decision = keep mirror».
- [ ] (Future) Розширити `apiVersionRewrite` Sentry-breadcrumb-ом, коли треба
      буде кількісно міряти долю `/api/v1/*` traffic.

## Refs

- [`docs/architecture/api-v1.md`](../../architecture/api-v1.md) — як влаштоване версіонування.
- [`apps/server/src/app.ts:29-55`](../../../apps/server/src/app.ts) — `apiVersionRewrite`.
- [`apps/server/src/routes/apiV1.test.ts`](../../../apps/server/src/routes/apiV1.test.ts) — тести дзеркала.
