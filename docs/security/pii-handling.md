# PII handling — single source of truth

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active.
> **Scope:** Server logs (Pino), Sentry payloads (server **and** web SDK),
> Loki/Grafana retention, in-process error captures. Mobile/web log buffers — see
> [`docs/observability/frontend.md`](../observability/frontend.md).
>
> **Canonical implementation (since 2026-05-13):**
> [`packages/shared/src/lib/pii.ts`](../../packages/shared/src/lib/pii.ts) —
> `REDACT_KEY_NAMES` + `scrubPII` live there as a DOM-free shared utility
> consumed by Pino (server logs), `Sentry.beforeSend` (server **and** web
> SDK) and the OTel attribute denylist. Adding a new redacted field means
> editing **one** file. Audit
> [`docs/audits/2026-05-13-security-observability-roast.md`](../audits/2026-05-13-security-observability-roast.md) §P0-S1
> captures the rationale for the consolidation.

## Чому цей документ існує

GDPR / DSAR — це **legal liability**, не «nice-to-have». PII у логах =
sub-processor data sharing з Sentry/Loki/Railway, який не обумовлений
у DPA. Кожне поле, яке з'являється у production-логах, потенційно
залишається там 14 днів (Loki retention) і 90 днів (Sentry retention),
тож і одного помилкового `logger.info({ user })` достатньо, щоб тримач
цих даних став сторонньою стороною за GDPR Art. 28.

Документ описує:

1. Які поля **ніколи** не повинні з'являтися у логах ні у яких формах.
2. Який рівень редакції застосовується до кожного класу PII.
3. Як перевірити, що нове логування не вводить регресію.

## Класифікація полів

### Class A — секрети (always redacted, never appears anywhere)

Витік цих полів означає `sev:1` incident і ротацію secrets.

| Поле                                                                                        | Звідки                               | Контракт                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| `password` / `currentPassword` / `newPassword`                                              | login, register, change-password     | redactPaths root + `*.password` + `req.body.*`  |
| `token` / `accessToken` / `refreshToken` / `idToken`                                        | OAuth, Better Auth, CSRF, API tokens | redactPaths root + `*.token` + `req.body.token` |
| `sessionToken` / `session.token`                                                            | Better Auth session                  | redactPaths root + `session.token`              |
| `apiKey` / `secret` / `clientSecret` / `privateKey`                                         | provider keys, OAuth client config   | redactPaths root + `*.<key>`                    |
| `groqKey` / `anthropicKey` / `voyageKey`                                                    | AI providers (HubChat, embeddings)   | redactPaths root + `*.<key>` (M3)               |
| `connectionString` / `dsn`                                                                  | DB / Sentry config                   | redactPaths root                                |
| `signature`                                                                                 | webhook signatures (Mono, OpenClaw)  | redactPaths root                                |
| `x-mono-webhook-secret` / `x-openclaw-webhook-secret` / `x-api-secret` / `x-internal-token` | webhook headers                      | redactPaths `req.headers["x-..."]` (M3)         |
| `authorization` / `cookie` / `set-cookie` / `x-csrf-token` / `x-api-key` / `x-token`        | HTTP auth headers                    | redactPaths `req.headers.*` + `res.headers.*`   |
| `err.config.headers.Authorization` / `Cookie`                                               | axios upstream-failure capture       | redactPaths `err.config.headers.*` (M3)         |

Контракт реалізовано у:

- `packages/shared/src/lib/pii.ts` — `REDACT_KEY_NAMES` + `scrubPII()` (єдине джерело правди, DOM-free).
- `apps/server/src/obs/logger.ts` — `redactPaths` (Pino, path-based) + `redactKeyNames` (back-compat alias на shared).
- `apps/server/src/sentry.ts` — `scrubPII()` (re-export shared) + `applyBeforeSend` для Sentry SDK на Node.
- `apps/web/src/core/observability/sentry.ts` — `applyWebBeforeSend()` (browser SDK parity, використовує shared `scrubPII`).
- `apps/server/src/obs/sensitiveUrl.ts` — `redactSensitiveUrl()` для path-secrets (C1).

### Class B — особисті ідентифікатори (replaced with hash or deleted)

Витік не triggers `sev:1`, але створює GDPR-зобов'язання.

| Поле                                    | Звідки                              | Контракт                                                                                                       |
| --------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `email`                                 | login form, profile, friend-pickers | redactPaths root + `*.email` + `*.*.email` + `req.body.email` + `res.body.email` + `user.email` + `body.email` |
| `phone`                                 | OTP, sign-in via SMS, profile       | redactPaths root + `*.phone` + `*.*.phone` + `req.body.phone` + `res.body.phone` + `user.phone` + `body.phone` |
| `userId` (raw UUID)                     | будь-який ALS-context               | replaced with `userIdHash` (16-hex `sha256(userId)` prefix) у `mixin()` (L10)                                  |
| Sentry `event.user`                     | `Sentry.setUser(...)`               | `applyBeforeSend` стирає все крім `id`                                                                         |
| Sentry `event.request.data` / `cookies` | `requestDataIntegration`            | `applyBeforeSend` стирає (`delete event.request.data`)                                                         |

> **Чому email і phone мають аж стільки шляхів?** Pino redact wildcard
> матчиться рівно на одну глибину: `*.email` ловить `user.email` /
> `body.email` / `ctx.email`, але НЕ `req.body.email` (це 3 рівні).
> Тому додаються 2-level wildcards (`*.*.email`) + явні
> `req.body.email` / `res.body.email`, які покривають login/register/
> OTP API-flow-и і `me`-endpoint response. За межами `req`/`res`/`body`-
> ієрархії case-insensitive Sentry-скрабер ловить ці ключі рекурсивно
> через `redactKeyNames`.

### Class C — quasi-identifiers (allowed in logs, але НЕ повинні стояти поряд з Class A/B)

Самі по собі не PII, але у комбінації з іншими стають.

| Поле                                | Чому це quasi-identifier            | Що дозволено                                           |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `ip` / `req.ip` / `x-forwarded-for` | Identifier per GDPR Art. 4(1)       | Логуємо для security events; уникаємо у звичайних info |
| `user-agent`                        | Browser fingerprint                 | OK у access-log (для debug); НЕ комбінувати з `userId` |
| `requestId` / `traceId`             | Request correlation                 | Завжди логуємо — це не PII                             |
| `userIdHash`                        | Hash, не reversible без brute-force | Завжди логуємо замість raw `userId`                    |
| `displayName`                       | User-entered nickname               | OK у audit-log (короткий retention); уникаємо у info   |
| `dob` / `dateOfBirth`               | Особливо чутливі для minors         | Заборонено у логах; redact-key за потреби              |
| `address` / `geolocation`           | Точна локація = PII                 | Заборонено у логах; redact-key за потреби              |

Sergeant поки **не збирає** `dob`, `address`, `geolocation` — якщо
з'являться, додай явні шляхи у `redactPaths`.

### Class D — нейтральні поля (always allowed)

| Поле                                             | Звідки             |
| ------------------------------------------------ | ------------------ |
| `requestId` / `traceId` / `module`               | ALS-context        |
| `userIdHash`                                     | hashed від ALS     |
| `level` / `time` / `pid` / `hostname`            | стандарт pino      |
| `service` / `env` / `release`                    | `pinoOptions.base` |
| `msg` / `err.message` / `err.code`/ `err.status` | event payload      |

## Як редакція влаштована

```
┌─────────────────────────────────────────────────────────────────┐
│ logger.info({ req, user, body })                                │
│            │                                                    │
│            ▼                                                    │
│  Pino redact (path-based) ─── apps/server/src/obs/logger.ts     │
│            │                                                    │
│            ▼ JSON to stdout                                     │
│  Railway / Loki / Grafana — retention 14 days                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Sentry.captureException(err, { extra })                         │
│            │                                                    │
│            ▼                                                    │
│  applyBeforeSend(event) ─── apps/server/src/sentry.ts           │
│  ├── delete event.request.data / cookies                        │
│  ├── scrubPII(event.request.headers / extra / contexts /        │
│  │             breadcrumbs.data) — recursive, case-insensitive  │
│  ├── redactSensitiveUrl(event.request.url) — C1                 │
│  └── event.user = { id }   (no email/phone/ip from sendDefaultPii) │
│            │                                                    │
│            ▼ payload to ingest                                  │
│  Sentry — retention 90 days                                     │
└─────────────────────────────────────────────────────────────────┘
```

`REDACT_KEY_NAMES` (для Sentry-scrubber-у, браузерного і серверного) живе у
`@sergeant/shared/lib/pii.ts`; `redactPaths` (для Pino, path-based, підтримує
до 2 рівнів wildcard-у) — у `apps/server/src/obs/logger.ts`. При додаванні
нового ключа редагуй **тільки shared** — він автоматично підхопиться в обох
Sentry SDK; в `redactPaths` додавай відповідні wildcard-рівні тільки якщо
Pino-side log-и теж потребують цей самий ключ (звичайно потребують).

## Як перевірити, що нове логування не вводить регресію

### 1. Локально (швидко)

```bash
# 1. Додай тест-кейс у `apps/server/src/obs/logger.test.ts` →
#    `M3 — extended redactPaths coverage` table-driven:
{
  name: "<your-new-path>",
  payload: { yourFieldHere: "should-be-redacted" },
  readRedacted: (p) => p["yourFieldHere"],
}

# 2. Run logger tests
pnpm --filter @sergeant/server exec vitest run src/obs/logger.test.ts
```

### 2. На staging (manual)

```bash
# 1. Trigger an endpoint that emits the new field
curl -X POST https://staging.sergeant.app/api/v1/auth/sign-in \
     -H "Content-Type: application/json" \
     -d '{"email":"leak@example.com","password":"leak"}'

# 2. Tail Railway logs and confirm `[redacted]`
railway logs --service sergeant-api | grep '"email"\|"password"'
# expected:  ..."email":"[redacted]","password":"[redacted]"...
# regression: ..."email":"leak@example.com",...
```

### 3. На Sentry (manual)

1. Trigger a synthetic error: `Sentry.captureException(new Error("test"), { extra: { email: "test@example.com" } })` з staging-shell.
2. Open Sentry UI → знайти event → Tags + Extra panel → перевірити, що `email` показано як `[redacted]`, не plaintext.

## Інциденти / regressions

Якщо ти знайшов PII у production-логах:

1. **Не лінкуй** конкретний log-line у Slack публічно — тільки у `#security`.
2. Створи `docs/security/incidents/YYYY-MM-DD-<topic>.md` з timeline + impact + fix.
3. Розглянь rotation секретів, якщо випливли Class-A поля.
4. Додай regression-test у `logger.test.ts` (table-driven case з тим самим shape, що засвітився).
5. Розклади fix у hardening sprint, якщо потрібно більше ніж точкова правка `redactPaths`.

## Cross-references

- [`docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md) §6.5 (origin)
- [`docs/security/hardening/M3-pino-redact-paths.md`](./hardening/M3-pino-redact-paths.md) (round 14 closure)
- [`docs/security/hardening/L10-user-id-hash-in-logs.md`](./hardening/L10-user-id-hash-in-logs.md) (userId hashing)
- [`docs/security/hardening/C1-mono-webhook-secret-in-url.md`](./hardening/C1-mono-webhook-secret-in-url.md) (URL redaction)
- [`docs/observability/logging.md`](../observability/logging.md) (logging conventions)
- [`packages/shared/src/lib/pii.ts`](../../packages/shared/src/lib/pii.ts) (canonical `REDACT_KEY_NAMES` + `scrubPII`)
- [`apps/server/src/obs/logger.ts`](../../apps/server/src/obs/logger.ts) (Pino config + back-compat alias)
- [`apps/server/src/sentry.ts`](../../apps/server/src/sentry.ts) (server Sentry beforeSend)
- [`apps/web/src/core/observability/sentry.ts`](../../apps/web/src/core/observability/sentry.ts) (web Sentry beforeSend, since 2026-05-13)
