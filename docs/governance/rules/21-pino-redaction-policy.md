# Rule 21 — Pino redaction policy enforced

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #21. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/obs/logger.ts`
- `apps/server/src/**`

## Enforced by

- **eslint-rule** — sergeant-design/no-raw-req-in-pino-log (scope: apps/server/\*_/_.{ts,js,mjs})
- **test** — apps/server/src/obs/logger.test.ts (redactPaths + redactKeyNames coverage)
- **convention** — apps/server/src/obs/logger.ts → pinoOptions.redact (paths + censor) — додавай нове sensitive-поле сюди ДО того, як код почне його логувати
- **doc** — docs/security/logging-redaction-policy.md

## Why / What is enforced

> Why a hard rule? Pino-логи Sergeant-сервера течуть у Railway-stdout, Sentry breadcrumbs (через `obs/logger.ts → sentryStream`) і у локальні pretty-print devtools. Все, що потрапляє у `logger.x(...)` як raw-об'єкт, виходить плоским JSON-payload-ом до 3-х незалежних консьюмерів. Якщо хтось пише `logger.info(req)`, у payload летить `Authorization`-header, `Cookie` (з Better Auth session-token-ом), `req.body` для Telegram webhook-ів (де всередині bot-API-tokens), `req.signedCookies`, custom proxy-headers, які `redact-paths` не знають за іменем. Inцидент-ризик — повна сесія у Sentry breadcrumbs за 1 строчку коду, без миттєвих візуальних маркерів у diff.
>
> Pino `redact: { paths: [...] }` (зараз ~50 шляхів у [`apps/server/src/obs/logger.ts`](../../../apps/server/src/obs/logger.ts)) ловить **відомі** sensitive-ключі за іменем, але контракт «що логуємо» лишається неявним: ревьюер бачить `logger.info(req, "ok")` і не може швидко перевірити, які саме поля підуть у JSON. Hard-rule перетворює контракт на видимий destructure — будь-який новий sensitive-field з'являється у diff, а не тихо ллється у Sentry.

**Rule.** Pino-методи (`logger.info|warn|error|debug|trace|fatal`, `req.log.*`, `ctx.logger.*`, `pino.*`) у [`apps/server/**`](../../../apps/server) **не приймають raw-об'єкти запиту/відповіді**. Заборонені аргументи:

- Identifier: `req`, `request`, `res`, `response`, `headers`, `body`, `payload`, `cookies`, `ctx`, `context`.
- MemberExpression від цих identifier-ів: `req.headers`, `res.body`, `req.cookies`, `req.params`, `req.query`, `req.user`, `req.session`, `req.signedCookies`.
- Object-shorthand: `{ req }`, `{ res }`, `{ headers }`, … — pino розгортає shorthand у той самий raw-payload.

Замість цього — явний destructure тих полів, що дійсно потрібні для tracing:

```ts
// ❌ BAD — full Authorization/Cookie/body летять у Sentry
logger.info(req);
logger.error(req.headers, "request failed");
req.log.warn({ res }, "slow response");

// ✅ GOOD — контракт видимий у diff, ревьюер блокує PII у review
logger.info(
  { url: req.url, method: req.method, status: res.statusCode },
  "request completed",
);
req.log.error({ err, route: req.route?.path }, "handler failed");
```

**Що блокує:**

- ESLint rule `sergeant-design/no-raw-req-in-pino-log` (severity `error`) у scope `apps/server/**/*.{ts,js,mjs}` — `pnpm lint` локально й у CI.
- Тести `apps/server/src/obs/logger.test.ts` — фіксують `redactPaths` + `redactKeyNames` baseline; будь-яка регресія у redact-config валить unit-suite.

**What this rule does NOT block:**

- `logger.x(message, errorObject)` — pino-конвенція "Error-arg" (другий аргумент типу `Error`) лишається коректною.
- Object-літерали з explicit-fields (`logger.info({ urls: [req.url] }, "msg")`) — рулі цікавий **shorthand** і raw-identifier; explicit-name пропускається.
- `console.*` callsite-и — окреме правило `sergeant-design/no-anthropic-key-in-logs` ловить console-leaks для секретів; PII-payload з raw-req на `console` блокується server-wide `no-console` у `apps/server/**` через base-конфіг.

Procedure / посилання: [`docs/security/logging-redaction-policy.md`](../../security/logging-redaction-policy.md). Migration-план + acceptance criteria — [`docs/initiatives/stack-pulse-2026-05/pr-16-pino-redaction-policy.md`](../../initiatives/stack-pulse-2026-05/pr-16-pino-redaction-policy.md).

## Related

- **doc** — docs/initiatives/stack-pulse-2026-05/pr-16-pino-redaction-policy.md
- **agents** — #21
