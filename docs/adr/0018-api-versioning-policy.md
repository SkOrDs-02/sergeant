# ADR-0018: API versioning policy (`/api/v1`)

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/app.ts`](../../apps/server/src/app.ts#L24-L50) — `API_V1_PREFIX`, `apiVersionRewrite` middleware.
  - [`apps/web/src/shared/lib/apiUrl.ts`](../../apps/web/src/shared/lib/apiUrl.ts) — `getApiPrefix()` web-side resolution.
  - [`packages/api-client/src/`](../../packages/api-client/src/) — `apiPrefix` config у HTTP client-і.
  - [`docs/architecture/api-v1.md`](../architecture/api-v1.md) — operational reference.
  - [`docs/adr/0017-better-auth-choice-and-session-model.md`](./0017-better-auth-choice-and-session-model.md) — чому `/api/auth/*` поза версіонуванням.

---

## 0. TL;DR

Sergeant API має два префікси, що ходять у той самий код:

- `/api/*` — original, web continues to work без змін.
- `/api/v1/*` — нове канонічне для мобілки, дефолт у `@sergeant/api-client`.

Обидва префікси зведені до одного router-а через `apiVersionRewrite`
middleware (rewrite `req.url`, не дублювання routes). Ця ADR фіксує:

- **URL-versioning, не header-versioning.** Простіше для clients, mobile-friendly, debug-friendly.
- **Один router, два entry-points.** Жодного `v1Router` / `legacyRouter`-дублювання.
- **`/api/auth/*` не версіонується.** Better Auth `basePath` зашитий і
  міняти його — кастом-форк, який ми не хочемо.
- **Що запускає `v2`:** breaking change у contracts, не нові endpoints.
- **Sunset policy для `/api/*`:** не раніше mobile-rollout-у + 90 днів observability,
  що `/api/*`-traffic на нулі.

| Аспект                    | Decision                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| Versioning style          | URL prefix (`/api/v1/`)                                                      |
| Single source of truth    | Один router на `/api/*`; rewrite middleware на app-edge                      |
| Default for new endpoints | Mount on `/api/<path>`; `/api/v1/<path>` mirror auto-enabled                 |
| Default web client prefix | `/api/v1`, override via `VITE_API_VERSION=none` → `/api/`                    |
| Default mobile client     | `/api/v1` (required)                                                         |
| Excluded paths            | `/api/auth/*` (Better Auth `basePath`); `/api/webhooks/*` (зовнішні sources) |
| When to bump to `v2`      | Breaking change у contracts, який не можна заімпортити в `v1`                |
| Sunset of `/api/*`        | Не раніше mobile-rollout + 90d observability                                 |

---

## ADR-8.1 — URL versioning, не header / accept-version

### Status

accepted.

### Context

Industry-стандартні підходи:

1. **URL prefix (`/api/v1/...`).** GitHub, Stripe (legacy), більшість публічних API.
   Плюси: видно у network-tab, зручно для curl, route-based proxying / caching.
   Мінуси: URL-шум; «major version» вбудована у path.

2. **Header-based (`Accept: application/vnd.sergeant.v1+json`).** GitHub
   (новіше), Microsoft Graph. Плюси: чисті URL-и; технічно пуристіше («the URL
   identifies the resource, the header identifies the representation»). Мінуси:
   важче debug-ити (curl потребує `-H`); не cache-friendly без custom Vary;
   mobile network logs не показують version.

3. **Query-param (`?api-version=2024-01-01`).** Azure REST. Плюси: явний,
   піддається default-ом. Мінуси: misuse-prone (забув query-param → silent fallback на default).

4. **Date-based (`/api/2024-01-01/`).** Stripe new API. Плюси: чіткий таймлайн;
   pinning конкретної дати. Мінуси: завелика complexity для малого API; потребує version
   negotiation infra.

### Decision

**URL prefix `/api/v1/...` — формат вибраний.**

Базові правила:

- `v1`, `v2`, `v3` — лише major-версії. Жодних `v1.1` / `v1.2`.
- Minor backward-compatible зміни (additive поля, нові endpoints) — у тій
  самій версії. Клієнт має бути толерантним до unknown-полів (стандартний
  RESTful-підхід).
- `v2` починається лише при breaking change. Деталі — у ADR-8.4.

### Consequences

**Позитивні:**

- Network-tab показує `/api/v1/me` — debug instant.
- Reverse-proxy / CDN кешування на route-level прозоре.
- Curl-friendly: `curl https://api.sergeant.app/api/v1/me`.
- Не вимагає version-negotiation infra (Date-based потребує state).

**Негативні:**

- При `v2` URL тих самих ендпоінтів роздвоюється; `/api/v1/me` і `/api/v2/me`
  співіснують. Mitigation: `/api/v1/*` буде явно frozen у момент `v2`-запуску
  (лише security-fixes); сlean migration шлях документуємо.
- Date-based versioning міг би бути elegantly-er, але overkill для сольного
  API без public v2 у roadmap-і.

### Alternatives considered

- **Header-based:** відкинуто через гіршу debug-friendliness.
- **No versioning at all:** з мобільним long-tail (юзер не оновлює
  додаток рік) це «fail-як-не-вирішив». Версія обов'язкова для mobile.
- **Date-based:** overkill для нашого масштабу.

---

## ADR-8.2 — Один router, два entry-points через rewrite

### Status

accepted.

### Context

Naive implementation версіонування:

```ts
// ❌ Дублюємо registerRoutes
app.use("/api", legacyRouter);
app.use("/api/v1", v1Router);
```

Через 6 місяців `legacyRouter` і `v1Router` дрейфують. Один забуваємо
оновити. Tests дублюються. CI час росте.

### Decision

**Rewrite `req.url` на канонічний `/api/...` ще до маршрутизації:**

```ts
// apps/server/src/app.ts:38-50
function apiVersionRewrite(req: Request, _res: Response, next: NextFunction) {
  const url = req.url;
  if (url === API_V1_PREFIX) {
    req.url = API_PREFIX;
  } else if (url.startsWith(`${API_V1_PREFIX}/`)) {
    req.url = API_PREFIX + url.slice(API_V1_PREFIX.length);
  }
  next();
}

// app.use чергу:
app.use(apiVersionRewrite);                  // ← rewrite на edge
// ... всі інші middleware та router
app.use(registerRoutes(...));                 // ← один router на /api/*
```

Один router, дві URLs. Middleware `apiVersionRewrite`:

1. На `/api/v1/users/me` пише `req.url = /api/users/me`.
2. `req.originalUrl` зберігає оригінал (`/api/v1/users/me`) — це бачить
   `pino-http` access-log і auth-metrics, тож ми знаємо version-rate без
   додаткової логіки.
3. Inner middleware (CORS на `/api`, body-parsers на конкретних шляхах,
   роутери) бачать вже канонізований path → працюють без змін.

`server/smoke.test.ts` для ключових routes перевіряє, що обидва префікси
повертають однаковий response. Якщо future PR ламає `v1`-mirror — fail.

### Consequences

**Позитивні:**

- Zero-duplicate. Один code-path.
- Migration trivial: PR з новим endpoint = `/api/foo` mounted, `/api/v1/foo`
  автоматично mirrored.
- `req.originalUrl` зберігає version-info — для observability видно
  частку traffic-у через v1-prefix.

**Негативні:**

- Subtle behavior gotcha: handler може помилково використати `req.originalUrl`
  для constructing URLs (e.g. для redirects). Mitigation: convention "use
  `req.url` everywhere у handler-ах"; coverage у `server/smoke.test.ts`.
- Якщо коли-небудь треба буде дати `v1` і `v2` різну логіку для одного path —
  rewrite не вистачає. Тоді: окремий router монтуємо явно (стандартний
  pattern, відомий момент розгалуження). Поки що не маємо такої потреби.

### Alternatives considered

- **Two routers (naive):** drift-prone, see context.
- **Express subrouters з shared handlers:** реалізація розгалужується у двох
  місцях, складніше тестувати. Rewrite простіший.
- **Reverse-proxy (Nginx) rewrite перед app:** додає operational dependency;
  Railway не дає flexible nginx-config out-of-box. Rewrite у app-code
  pure portable.

---

## ADR-8.3 — `/api/auth/*` НЕ версіонується

### Status

accepted.

### Context

Better Auth handler (`apps/server/src/routes/auth.ts:24`):

```ts
r.all("/api/auth/*", toNodeHandler(auth));
```

Better Auth client-сторонні плагіни (`better-auth/react`,
`@better-auth/expo`) hardcoded на `basePath: "/api/auth"`. Змінити це без
custom-fork-у неможливо. Тому `apiVersionRewrite` свідомо **не** торкається
`/api/auth/*`:

```ts
// Rewrite у app.ts тільки для /api/v1/* → /api/* (як string-prefix-rewrite).
// /api/auth/sign-in проходить як є; /api/v1/auth/sign-in не існує (404).
```

Друге виключення: `/api/webhooks/*` (Stripe, Mono) — це endpoints, що звуть
зовнішні системи з фіксованим URL у їхніх dashboards. Якщо мы добавимо `/v1`
у webhook URL і потім `v2`, треба буде reconfigure dashboard на `/v2`. Ми
`/api/webhooks/*` тримаємо без version-prefix-у; breaking change webhook-у
рідкі і обробляються через payload-version (Stripe `stripe-signature`,
`api_version`).

### Decision

**Excluded paths:**

| Path                          | Reason                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| `/api/auth/*`                 | Better Auth `basePath` hardcoded; cross-package contract.   |
| `/api/webhooks/*`             | Зовнішні URL у dashboards; breaking change rare & per-event |
| `/api/health`, `/api/metrics` | Observability infra; пробрані Railway / Prometheus          |

Ці paths обходять `apiVersionRewrite`, бо path не починається з `/api/v1/`.

### Consequences

**Позитивні:**

- Better Auth ecosystem-плагіни працюють без forks.
- Webhook-URLs стабільні; не потрібно reconfigure dashboards при майбутньому
  `v2`-bump.

**Негативні:**

- Якщо коли-небудь будемо breaking-change-ити auth-flow, потрібно зробити
  через нові methods (e.g. `/api/auth/v2/sign-in`), не через `/api/v2/auth/...`.
  Documented у `docs/architecture/api-v1.md` § FAQ.
- Inconsistency у API-shape: usual endpoints версіоновані, auth/webhooks ні.
  Acceptable trade-off за simplicity.

### Alternatives considered

- **Fork Better Auth для `/api/v1/auth`-basePath:** maintenance burden
  величезний. Відкинуто.
- **Dual-mount Better Auth під обидва prefix-и:** session cookies set-aware
  про `path`-attribute; cookie з `Path=/api/auth/` не бачиться під
  `/api/v1/auth/` → session loop. Відкинуто.

---

## ADR-8.4 — Коли запускати `v2`: breaking change policy

### Status

accepted.

### Context

Без чіткого triggering-criteria для `v2`-bump-у ми ризикуємо: (а) ніколи
його не запустити (вічно "will fix у v1.5"), або (б) робити `v2` за кожного
рефактора (junk inflation).

### Decision

**`v2` — лише при breaking change у contracts:**

Breaking changes (тригерять bump):

- Видалення поля з response.
- Зміна типу поля (e.g. `id: number` → `id: string`).
- Перейменування поля без deprecation period.
- Зміна authentication mechanism (cookie → bearer-only).
- Зміна error-payload shape (e.g. `{ error: string }` → `{ errors: [{...}] }`).
- Видалення endpoint без depcrecation.
- Зміна semantics endpoint-у (e.g. POST `/orders` стало sync → async).

Не-breaking changes (без bump):

- Додавання поля у response (clients commit'd to ignoring unknown fields).
- Додавання optional поля у request.
- Новий endpoint.
- Покращення error-messages.
- Bug fixes у data integrity.

Якщо ми хочемо breaking change у одному endpoint — два пути:

1. **Soft-deprecate у `v1`:** додаємо новий endpoint (e.g. `/api/foo-v2`)
   без version-bump. Старий лишається. Через 90+ днів — видаляємо у `v2`.
2. **Hard-bump до `v2`:** зайняти при ≥3 breaking-changes одночасно. PR
   ставить весь `v2`-router як другий entry, `v1` лишається frozen.

### Consequences

**Позитивні:**

- Чіткий contract з мобільними клієнтами: `v1` won't break under your feet.
- Більшість змін на MVP — additive → жодного `v2`-presure.

**Негативні:**

- При несвідомій зміні shape (e.g. typo у serializer-і) ми порушимо `v1`
  contract без `v2`-bump. Mitigation: snapshot-tests у
  `apps/server/src/modules/*` (rule #1 з AGENTS.md), які break-ять CI на
  shape-drift.

### Alternatives considered

- **`v2` на кожен mvp-цикл:** junk version inflation; mobile clients
  втрачають value перевірок при кожному додатку.
- **Ніколи не bump:** `v1`-soup forever, deprecation pile-up.

---

## ADR-8.5 — Sunset для `/api/*`-prefix-у

### Status

proposed.

### Context

`/api/*` — original entry. Зараз він працює "просто так": web історично
ходить туди, ніяких клієнтів-out-of-our-control немає (нащо хтось би
викликав наш API без `@sergeant/api-client`?). Технічно ми могли б
викликнути його — лише `/api/v1/*` лишається.

Аргументи за залишити обидва:

- Web fallback escape hatch (`VITE_API_VERSION=none`).
- Backward compat для будь-кого, хто scripted curl-запити (на MVP — нікого,
  але "what if").

Аргументи за видалити `/api/*`:

- Чистіша observability (`/api/v1/*` — єдиний канонічний).
- Менше testing-permutations (smoke-test перевіряє обидва).

### Decision

**Тримаємо `/api/*` доти, доки:**

1. Mobile fully rolled out на ≥90% юзерів. Mobile завжди шле `v1`.
2. Web build фіксований на `VITE_API_VERSION=v1` без override option.
3. Pinetum-нагляд за access-log-ами 90 днів показує 0 hits на `/api/<x>`,
   де `<x>` не префіксовано `v1`.

Тоді — окремий PR видаляє `apiVersionRewrite`-fallback на `/api`-monut
(якщо буде потрібно), залишається лише `/api/v1`-mount. На MVP **це не
відбудеться у наступні 12 місяців**.

### Consequences

**Позитивні:**

- Backward-compat надовго; жодного surprise-breakage.
- Sunset gated на observability, не за timeline-ом.

**Негативні:**

- Smoke-tests дублюються (один path — два префікси). 50ms на test-run.
- Cognitive overhead: розробники мусять знати про обидва префікси.
  Mitigation: `docs/architecture/api-v1.md` як onboarding.

### Alternatives considered

- **Sunset через 6 місяців з timeline-deadline:** ризиковано якщо mobile
  rollout повільніший за expected.
- **Видалити `/api/*` миттєво:** ламає старі веб-bundle-и, які можуть
  бути cached в SW.

---

## ADR-8.6 — Що НЕ робимо (out of scope)

### Status

accepted.

### Decision

Цей ADR **не** покриває:

- **API spec / OpenAPI generation.** Phase 4. Зараз TypeScript-types
  у `@sergeant/api-client` — single source of truth (manually mirrored).
  OpenAPI auto-generation з Zod schemas — задача великого scope-у.
- **Rate limiting policies per API version.** Express rate-limit-middleware
  застосовується pre-rewrite, отже одинаковий для обох префіксів.
- **Public API access (third-party developer-tokens).** На MVP API
  internal-only.
- **GraphQL chez REST.** Не на roadmap-і.
- **API documentation portal.** Phase 5+.
- **API analytics / per-endpoint pricing.** Не B2B-API; не треба.

---

## Open questions

1. **Auto-detect breaking changes у CI.** OpenAPI diff-tool міг би alert-ити
   при PR-зміні response-shape без bump-у. Не маємо OpenAPI specs зараз
   — TBD в Phase 4.
2. **Version у access-log як explicit label.** Зараз ми бачимо version
   через `req.originalUrl`-rewrite (для traffic-shaping). Але Prometheus
   `http_requests_total` не має `api_version` label. Додати окремий
   middleware-counter `api_version_requests_total{version="v1|none"}` для
   sunset-rationality.
3. **CDN caching configuration для `/api/v1/*` vs `/api/*`.** Поки traffic
   non-cached, не питаємо. При public API — `Vary: X-Api-Version` доцільніше
   за дублювання cache keys.
