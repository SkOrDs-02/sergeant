# PR-16: Pino redaction policy + ESLint guard

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed — merged [#2125](https://github.com/Skords-01/Sergeant/pull/2125). Hard Rule #21 + `sergeant-design/no-raw-req-in-pino-log` ESLint guard + [`docs/security/logging-redaction-policy.md`](../../security/logging-redaction-policy.md) зареєстровані.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Severity** | High (H10)                                                     |
| **Owner**    | @Skords-01                                                     |
| **Effort**   | 1 день                                                         |
| **Risk**     | Low (additive: захищає, не ламає існуюче)                      |
| **Touches**  | `apps/server/src/obs/logger.ts`, ESLint config, кожен callsite |

## Statuses

- **2026-05-03** — Initiative заведено зі статусом `Planned`. Pino-redact-paths уже частково існували в `apps/server/src/obs/logger.ts`; гап був у ESLint-guard + governance.
- **2026-05-06** — Implementation: додано `sergeant-design/no-raw-req-in-pino-log` (severity `error`, scope `apps/server/**`), створено [`docs/security/logging-redaction-policy.md`](../../security/logging-redaction-policy.md), зареєстровано Hard Rule #21 у [`AGENTS.md`](../../../AGENTS.md#21-pino-redaction-policy-enforced) + [`docs/governance/hard-rules.json`](../../governance/hard-rules.json) + [`CONTRIBUTING.md`](../../../CONTRIBUTING.md). Server-lint: `0 errors` після додавання правила (raw-req логування не виявлено у поточному коді — guard fixates clean baseline).

## Контекст

```ts
// apps/server/src/obs/logger.ts (приблизно)
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // redact: <empty or partial>
});
```

Pino підтримує `redact: { paths: [...], censor: "[REDACTED]" }`. Sergeant має багато sensitive-полів:

- `Authorization` header
- `Cookie` / `Set-Cookie`
- `password`, `token`, `apiKey`, `secret`, `dsn`, `connectionString`
- `email` (PII за GDPR)
- Better Auth session tokens
- Anthropic API key

Якщо logger.info(req) — без redaction — ці поля **попадають у Sentry breadcrumbs + Pino-output**. Sentry має server-side scrubbing, але:

1. Локальні logs (Railway) не scrubb-ляться.
2. Не всі полів охоплює default Sentry-список.

## Scope

### 1. Configure pino-redaction

```ts
import pino from "pino";

export const logger = pino({
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.body.password",
      "req.body.token",
      "req.body.apiKey",
      "*.password",
      "*.token",
      "*.apiKey",
      "*.secret",
      "*.dsn",
      "*.connectionString",
      "*.privateKey",
      "user.email",
      "session.token",
    ],
    censor: "[REDACTED]",
    remove: false,
  },
  level: env.LOG_LEVEL,
  base: { service: "sergeant-server", commit: env.COMMIT_SHA },
});
```

### 2. ESLint guard

- Custom rule (extension `packages/eslint-plugin-sergeant-design/`):
  - Disallow `console.log` у `apps/server/src/` (вже є?).
  - Disallow `logger.info(req)` без destructure — змусити явно вказати fields для logging.
  - Або: warn на будь-якому `logger.x(<variable з типом Request | Response | Headers>)` — потенційний leak.

### 3. Audit + sweep

- grep `logger\.(info|warn|error|debug)` у `apps/server/src/` → перевірити, які з них можуть включити sensitive payload.
- Спершу автоматичний sweep, потім manual review high-risk files (`auth.ts`, `webhooks/*.ts`).

### 4. Sentry parity

- `apps/server/src/sentry.ts` — `beforeSend` hook видаляє чорний-список полів у extra/contexts. Sync з pino-redaction-list.

### 5. Documentation

- `docs/security/logging-redaction-policy.md` — явні правила, ownership-line, як додати нове поле.
- `docs/governance/hard-rules-registry.json` — нове правило «Logging-redaction-required».

## Out of scope

- Перейти на structured-logging libraries beyond pino (winston / bunyan) — не виграш.
- Video / image redaction (не logger-related).

## Acceptance criteria (DoD)

- [ ] `apps/server/src/obs/logger.ts` має enforced `redact:` config з ≥15 paths.
- [ ] Pino unit-test: `logger.info({ password: "x" })` → output має `[REDACTED]`, не `"x"`.
- [ ] ESLint rule active + 0 warnings у server-tree.
- [ ] `docs/security/logging-redaction-policy.md` описаний.
- [ ] Hard rule зареєстрований.
- [ ] Sentry `beforeSend` синхронізований.

## Тести

- `apps/server/src/obs/__tests__/logger.test.ts` — для кожної path-rule, перевірити redaction.
- ESLint test (snapshot-based): негативний приклад `logger.info(req)` має fail.

## Rollout

- Single PR. Якщо ESLint rule блокує занадто багато existing code → split на 2 PR (rule first as warning, fix sweep, then promote to error).

## Risks & mitigations

| Risk                                                | Mitigation                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `req.body` має арбітрарну shape, redaction промахне | Wildcard paths (`*.password`, `*.token`) ловлять довільну вкладеність |
| Performance impact на gigabyte-логах                | Pino redaction native, ~5% overhead — acceptable                      |

## Touchpoints (file:line)

- `apps/server/src/obs/logger.ts`
- `apps/server/src/sentry.ts` — beforeSend sync
- `packages/eslint-plugin-sergeant-design/` — нове правило
- `docs/security/logging-redaction-policy.md` — новий
- `docs/governance/hard-rules-registry.json` — додати rule

## Refs

- [Pino redaction docs](https://github.com/pinojs/pino/blob/main/docs/redaction.md)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- ADR (якщо є) на observability strategy
