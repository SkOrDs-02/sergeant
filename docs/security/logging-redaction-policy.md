# Pino logging redaction policy

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active.
> **Hard rule:** [#21 — Pino redaction policy enforced](../../AGENTS.md#21-pino-redaction-policy-enforced).
> **Stack-pulse initiative:** [PR-16](../initiatives/stack-pulse-2026-05/pr-16-pino-redaction-policy.md).
> **Related:** [`docs/security/pii-handling.md`](./pii-handling.md) — single source of truth для класифікації полів.

## TL;DR

Sergeant-сервер використовує Pino для всіх structured-логів. Логи течуть у три незалежних консьюмери:

1. **Railway stdout** → Loki retention (14 днів).
2. **Sentry breadcrumbs** через `apps/server/src/obs/logger.ts → sentryStream` (90 днів).
3. **Local pretty-print** у dev (`LOG_PRETTY=1`).

Будь-який raw-аргумент типу `req` / `res` / `req.headers` / `req.body` у `logger.x(...)` миттєво розкриває `Authorization`, `Cookie`, `X-Mono-Webhook-Secret`, Better Auth `sessionToken`, бот-API-tokens у Telegram-webhook body та custom proxy-headers — у трьох консьюмерах одразу. Це GDPR-ризик (sub-processor data sharing без DPA) і incident-vector (повна сесія у Sentry breadcrumbs з 1 строчки коду).

Policy має **три шари**:

| Layer                                | Що ловить                                                 | Реалізація                                                                             | Severity |
| ------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| L1 — Pino `redact: { paths }`        | Відомі sensitive-ключі за іменем у JSON-output            | `redactPaths` у [`apps/server/src/obs/logger.ts`](../../apps/server/src/obs/logger.ts) | runtime  |
| L2 — Sentry `scrubPII()`             | Рекурсивна очистка `event.extra` / `breadcrumbs.data`     | `redactKeyNames` у тому ж файлі + `scrubPII()` у `apps/server/src/sentry.ts`           | runtime  |
| L3 — ESLint `no-raw-req-in-pino-log` | Compile-time блок на raw-`req`/`res` як аргумент logger-у | `packages/eslint-plugin-sergeant-design/index.js` (rule `no-raw-req-in-pino-log`)      | lint     |

L1 + L2 — **net** (захоплюють відоме). L3 — **forcing function** (робить контракт «що логуємо» видимим у diff).

## Rule contract

ESLint-правило [`sergeant-design/no-raw-req-in-pino-log`](../../packages/eslint-plugin-sergeant-design/index.js) (severity `error`, scope `apps/server/**/*.{ts,js,mjs}`) блокує наступні форми:

### Forbidden

```ts
// 1. Identifier — вся форма Express Request / Response / headers bag.
logger.info(req);
logger.error(res, "request failed");
logger.warn(headers);
req.log.fatal(body);

// 2. MemberExpression — окремий bag з відомою назвою.
logger.error(req.headers, "request failed");
logger.info(res.body);
logger.warn(req.cookies);
logger.debug(req.user); // Better Auth attached the full session
logger.trace(req.session);
logger.error(req.signedCookies);
logger.info(req.params);
logger.info(req.query);

// 3. Object-shorthand — pino розгортає shorthand у raw-payload.
logger.warn({ req }, "slow request");
logger.error({ res }, "5xx");
logger.info({ headers }, "incoming");
```

ESLint-receivers (`<R>.x()`), що матчаться як logger-style:

- `logger.*`, `log.*`, `pino.*` (case-insensitive).
- `childLogger.*`, `httpLogger.*`, `appLogger.*`, `reqLogger.*`, `baseLogger.*`.
- Member-chains: `<X>.log.*`, `<X>.logger.*`, `<X>.pino.*` (наприклад, `req.log.info(...)`, `ctx.logger.error(...)`).

Logger-методи: `info`, `warn`, `error`, `debug`, `trace`, `fatal`.

### Allowed

```ts
// 1. Explicit destructure — те, що дійсно потрібно.
logger.info(
  { url: req.url, method: req.method, status: res.statusCode },
  "request completed",
);

// 2. Error-arg — pino-конвенція, не raw-payload.
logger.error(err, "handler failed");
logger.error({ err }, "handler failed");

// 3. Computed/non-shorthand object literals.
logger.info({ urls: [req.url] }, "msg");
logger.warn({ traceId: ctx.traceId }, "ok");
```

## Як додати нове sensitive поле

Завжди — **спочатку поле потрапляє у redaction, потім код починає його логувати**, не навпаки. Інакше один pre-merge run у CI протече дані у Sentry / Loki ще до того, як рулі стане за замок.

1. **Класифікуй**. Подивись [`docs/security/pii-handling.md`](./pii-handling.md). Class A (секрети) → ротація при витоку. Class B (PII) → hash/redact. Class C (контент) → опціонально опт-аут.
2. **Додай у `redactKeyNames`** ([`apps/server/src/obs/logger.ts`](../../apps/server/src/obs/logger.ts) рядок ~31). Це покриває Sentry-скрабер на будь-якій глибині (case-insensitive).
3. **Додай у `redactPaths`** з конкретними шляхами + wildcard-варіантами (Pino redact матчить wildcard рівно на одну глибину):
   - Top-level: `"newSecret"`.
   - Wildcard 1-2 levels: `"*.newSecret"`, `"*.*.newSecret"`.
   - Якщо приходить як header: `'req.headers["x-new-secret"]'`.
   - Якщо приходить як body: `"req.body.newSecret"`.
4. **Якщо це HTTP-header** — додай також у `redactSensitiveUrl()` ([`apps/server/src/obs/sensitiveUrl.ts`](../../apps/server/src/obs/sensitiveUrl.ts)), якщо може з'явитися у URL-path / query.
5. **Розшир `apps/server/src/obs/__tests__/logger.test.ts`** — додай тест-сценарій з фейковим payload-ом, де поле виставлене, і перевір, що `[redacted]` присутнє у логах.
6. **Якщо потрібен новий receiver-name** для logger-у (наприклад, `myAppLogger.info(...)`) — розшир `PINO_LOGGER_RECEIVER_RE` у [`packages/eslint-plugin-sergeant-design/index.js`](../../packages/eslint-plugin-sergeant-design/index.js). Це окремий PR із обґрунтуванням, чому не використати канонічний `logger`.

## Як перевірити локально

```bash
# L1 + L2 runtime contract
pnpm --filter @sergeant/server test -- logger.test.ts

# L3 ESLint guard (щоб локально побачити, що нове raw-req логування ламає)
pnpm --filter @sergeant/server lint

# Усе разом перед PR
pnpm check
```

CI ганяє `pnpm lint` + `pnpm typecheck` + `pnpm test` на кожен push, тож регресія блокується pre-merge.

## Що ця policy НЕ покриває

- **Зовнішні sub-processors поза Sentry/Loki/Railway.** Якщо новий downstream (наприклад, Datadog, Honeycomb) додається — окрема ревізія цієї policy + DPA-апдейт.
- **Frontend / mobile log-buffers.** Окремий контракт у [`docs/observability/frontend.md`](../observability/frontend.md). Цей файл — про Pino-stack у `apps/server/`.
- **`console.*` callsite-и** у server-коді. Заборонені окремим базовим конфігом (`no-console` у `apps/server/**`); PII-payload через `console.log(req)` блокується тим правилом, не цим.
- **Body-логування через middleware** (наприклад, `morgan`, `pino-http` request-serializer). `pino-http` стандартний request-serializer (`pinoHttp({ serializers: { req: …}})`) — окрема поверхня; зміни у ньому ревьюються через owner-у `apps/server/src/obs/`.

## Operational notes

- **Розширення redact-arrays вимагає тесту.** Pino redact мовчки ігнорує невалідний path; додавай тест-кейс щоразу, інакше regression поверне field у логи без warning-у.
- **Sentry beforeSend** ([`apps/server/src/sentry.ts`](../../apps/server/src/sentry.ts)) — друга ланка захисту. Якщо щось проскочило L1 (Pino redact), L2 ловить рекурсивно. Не покладайся на L2 один — L1 дешевший, L2 дорогий per-event.
- **Round 17** (2026-04-XX) розширив purview redact-paths на email/phone у `req.body.*` / `res.body.*` для login/register/OTP flow-ів. Якщо додаєш новий auth-flow — перевір, що body-shape не вводить новий шлях, який не покритий `*.*.email` / explicit `req.body.<field>`.

## Зв'язок з іншими hard rules

- **#15** (governance + Ukrainian internal docs) — цей файл UA, як inv-policy.
- **#21** (this rule) — enforce contract.
- **PII / DSAR** — [`docs/security/pii-handling.md`](./pii-handling.md), [`docs/security/access-policy.md`](./access-policy.md).
- **Threat model** — [`docs/security/threat-model.md`](./threat-model.md) § Logging exposure.

## Changelog

- **2026-05-06** — Створено разом із PR-16 (stack-pulse 2026-05): доданий ESLint rule `no-raw-req-in-pino-log` + Hard Rule #21.
