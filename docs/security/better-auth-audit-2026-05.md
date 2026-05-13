# Better Auth security audit — round 2 (2026-05)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

| Field        | Value                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Owner**    | platform                                                                                                                                                           |
| **Source**   | [`pr-plan-2026-05.md` PR-48](../planning/pr-plan-2026-05.md) — round 2 (slim audit beyond crypto)                                                                  |
| **Previous** | [`better-auth-crypto-review.md`](./better-auth-crypto-review.md) — round 1 (crypto / cookies / fingerprint) by 2026-05-06                                          |
| **Related**  | [ADR-0017](../adr/0017-better-auth-choice-and-session-model.md), [ADR-0042](../adr/0042-password-hashing-strategy.md), [ADR-0049](../adr/0049-auth-vendor-risk.md) |

## Контекст

Round 1 (PR-48 by stack-pulse) — crypto review (`tokenCrypto.ts`,
encrypting-adapter, sessionFingerprint, keyRing) + Safari/Webkit E2E.
Висновок: 0 high-severity, 10 INFO/LOW findings, all documented.

Round 2 (цей документ) — операційна перевірка не-crypto поверхні:
session policy, rate-limit на credential flow, password storage policy,
INTERNAL API key leakage, magic-link expiry (за наявності), CSRF
enforcement. Це регулярний slim-audit, який можна повторювати щоквартально
без full crypto-review.

## Scope

| Surface                                                                                                 | Що review-иться                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`apps/server/src/auth.ts`](../../apps/server/src/auth.ts)                                              | Session `expiresIn` / `updateAge` / cookie cache, CSRF, magic-link |
| [`apps/server/src/config/rateLimit.ts`](../../apps/server/src/config/rateLimit.ts)                      | `api:auth:sensitive` policy values / env wiring                    |
| [`apps/server/src/http/authMiddleware.ts`](../../apps/server/src/http/authMiddleware.ts)                | Application-side rate-limit + auth-event metrics                   |
| [`apps/server/src/routes/internal/index.ts`](../../apps/server/src/routes/internal/index.ts)            | `INTERNAL_API_KEY` bearer guard, `safeStringEqual`                 |
| [`apps/server/src/obs/logger.ts`](../../apps/server/src/obs/logger.ts) `redactKeyNames` / `redactPaths` | Pino redaction для `authorization`, `x-internal-token` headers     |
| [`apps/server/src/obs/tracing.ts`](../../apps/server/src/obs/tracing.ts) ignored headers                | OpenTelemetry span attribute scrubbing                             |

Out of scope: crypto / cookie / session-fingerprint (round 1), WebAuthn,
SSO / IdP integration. Magic-link не enabled у Sergeant — verdict
documented but no fix scope.

## Findings

### F1 — Session expiry [MEDIUM — FIXED]

**Знайдено:** `session.expiresIn = 60 * 60 * 24 * 30` (30 діб). Це
canonical вибір з ADR-0017 («consumer-SaaS norm: GitHub/Linear/Notion
30-90d»).

**Threat model:** Sergeant — daily-habit app. Активний user робить ≥1
запит/день; для нього TTL 7d vs 30d прозорий (rolling refresh продовжує
сесію на чергові 7 днів при кожній активності). Stolen-cookie window
скорочується з 30 → 7 днів — це 4× менше часу для зловмисника, що
отримав persistent token (e.g. через malicious browser extension або
device-share scenario), без UX-регресу для legitimate user-а.

**Fix:** `expiresIn` 30d → 7d. `updateAge` залишений = 1 доба (active
users автоматично продовжують сесію). Зміна впливає тільки на cold
sessions (>7 днів простою), які і так становлять <1% активних сесій за
поточними обсягами product-у.

**Verification:**

- Unit test `auth.test.ts > "PR-48: session.expiresIn = 7 діб"` pin-ить
  значення; випадковий повернення до 30d буде червоніти CI.
- ADR-0017 §Decision оновлено з новим вибором + rationale.

### F2 — CSRF protection [INFORMATIONAL — OK]

Better Auth ставить `SameSite=None; Secure` для cross-site cookie
(Vercel ↔ Railway origin pair). На POST endpoints працює origin-header
check (через `trustedOrigins`), що закриває CSRF gap у тих самих умовах,
де SameSite=Lax закрив би його на cookie-рівні. Round 1 F6 уже
зафіксував це. Sergeant also має `requireCsrfHeader.ts` для
non-Better-Auth cross-origin POST endpoints (M12 hardening).

**Verdict:** OK. No fix.

### F3 — Rate-limit на credential flow [MEDIUM — FIXED]

**Знайдено:** `api:auth:sensitive` policy у `config/rateLimit.ts` мав
ліміт **20 спроб / 60s / IP**. Sergeant-server env-vars
`AUTH_RATE_LIMIT_MAX=5` + `AUTH_RATE_LIMIT_WINDOW_SEC=900` визначені у
`env.ts:579-581`, але **ніде не зчитувалися** — orphaned dead env-vars.

**Threat model:** 20 спроб/хв — це 1200 спроб/година з одної IP. Брут-форс
8-char numeric PIN (~10^8 combinations) при 1200 спроб/година фактично
неможливий, але для weak passwords (top-1000 list, ~10^3) — це ~50 хв
для повного walkthrough. OWASP ASVS V11.1.3 рекомендує 5–10 спроб /
хвилину для credential flow.

**Fix:**

- Policy default зменшено 20/60s → 5/60s; ліміт тепер береться з
  `env.AUTH_RATE_LIMIT_MAX` (default 5) і `env.AUTH_RATE_LIMIT_WINDOW_SEC`
  (default 60). Раніше orphan-вані env-vars стали справжніми runtime
  kill-switch-ами для ops.
- `RATE_LIMIT_FAIL_CLOSED_AUTH=true` (default) збережено — middleware
  повертає 503 при degraded limiter замість per-process in-memory
  bucket-у, що інакше дає N×limit-амплифікацію на multi-replica deploy.
- 5/60s залишає ~7000 запитів/доба з одного IP (5 спроб × 60 хв × 24 год)
  — достатньо для legitimate retry після forgot-password flow і
  недостатньо для практичного брутфорсу.

**Verification:**

- `config/rateLimit.test.ts` оновлено: assertion `limit=5`, `windowMs=60_000`.
- Existing `http/rateLimit.test.ts` continues to validate bucket
  semantics (no behavior change beyond constants).

### F4 — Password storage [INFORMATIONAL — OK]

Better Auth використовує scrypt (NIST SP 800-63B compliant). ADR-0042
фіксує вибір (не bcrypt, тому 72-byte truncation тут не релевантний).
`minPasswordLength=10` / `maxPasswordLength=256` — DoS upper bound для
обмеження scrypt CPU-burn на одному запиті. Round 1 F8 ще раз
підтвердив це.

**Verdict:** OK. No fix.

### F5 — `INTERNAL_API_KEY` leakage [INFORMATIONAL — OK]

**Перевірено:**

1. **Storage / scope:** ключ зберігається тільки в env (`env.INTERNAL_API_KEY`)
   і використовується bearer-guard у `routes/internal/index.ts` через
   `safeStringEqual` (timing-safe compare).
2. **Fail-closed:** якщо ключ не сконфігурований, middleware повертає
   503 «Internal API not configured» — не пропускає запити в open-mode.
3. **Pino redaction (`obs/logger.ts`):**
   - `redactKeyNames` ловить `authorization`, `apiKey`, `secret`,
     `x-internal-token`, `x-api-secret` на будь-якій глибині.
   - `redactPaths` явно покриває `req.headers.authorization`,
     `req.headers["x-internal-token"]`, `req.headers["x-api-secret"]`.
   - Tests `obs/logger.test.ts` (line 109) перевіряє маскування
     `authorization` header-а до `[redacted]` у dump-і req-объекта.
4. **OpenTelemetry tracing (`obs/tracing.ts`):** ignored headers list
   містить `authorization`, `x-internal-token`, `x-api-secret`,
   `proxy-authorization` — span-атрибути не пишуть ці заголовки.
5. **Sentry scrubber:** `redactKeyNames` доповнює Pino-redaction; Sentry
   `beforeSend` ходить рекурсивно і маскує `authorization` /
   `x-internal-token` у `extra/contexts/breadcrumbs.data`.

**Verdict:** OK. No fix. Existing test coverage адекватно валідує
non-leakage invariant. Sergeant Hard Rule #21 («never log raw secrets»)
тут viable і enforced.

### F6 — Magic-link expiry [N/A — NOT ENABLED]

**Знайдено:** Magic-link plugin не enabled. Auth-flow Sergeant:
email+password + Google OAuth + reset-password (через одноразовий
toke-link). `apps/server/src/auth.ts` не імпортує і не реєструє
`magicLink` plugin з `better-auth/plugins`.

**Threat model:** N/A. Якщо у майбутньому Sergeant enable-ить magic-link
для passwordless flow, target має бути ≤15 хв експайрі + одноразова
consumption (Better Auth default уже = 5 хв, тому fix не потрібен буде).

**Verdict:** N/A. Tracked як ENH-002 follow-up на випадок future
passwordless launch — без блокуючого впливу.

## Summary

| ID  | Severity      | Status       | Surface                                                     |
| --- | ------------- | ------------ | ----------------------------------------------------------- |
| F1  | MEDIUM        | FIXED        | session.expiresIn 30d → 7d                                  |
| F2  | INFORMATIONAL | OK           | CSRF (Origin-header через trustedOrigins)                   |
| F3  | MEDIUM        | FIXED        | rate-limit `api:auth:sensitive` 20/60s → 5/60s + env wiring |
| F4  | INFORMATIONAL | OK           | scrypt + min/max password length (ADR-0042)                 |
| F5  | INFORMATIONAL | OK           | INTERNAL_API_KEY — non-leakage validated                    |
| F6  | N/A           | NOT IN SCOPE | magic-link — plugin not enabled                             |

**Net effect:** 2 medium fixes applied у тому самому PR-і. 0
high-severity findings; 4 OK / N/A. Pinned-тести у CI:

- `auth.test.ts > "PR-48: session.expiresIn = 7 діб"`
- `config/rateLimit.test.ts > "api:auth:sensitive" → limit=5, windowMs=60_000`
- Existing: `obs/logger.test.ts > authorization header redaction`,
  `http/safeCompare.test.ts > safeStringEqual`,
  `routes/internal.test.ts > fails closed when INTERNAL_API_KEY is not configured`.

## Rollout

- 1 PR (`chore(server):` префікс) — code-change + audit-doc + ADR-0017
  bump.
- Active users не побачать впливу: rolling refresh кожні 24 год тримає
  сесію живою.
- Inactive >7 days користувачі — змушені re-login при наступному запиті.
  Quantification: за `auth_session_lookup_duration_ms_count{outcome="miss"}`
  у Datadog (PostHog `signed_in` рідше). Очікувано <1% подовжених
  cold-sessions; rollback (повернення до 30d) — feature-flag-free,
  один-рядковий revert у `auth.ts:208`.

## Re-open trigger

| Trigger                                                                           | Action                                                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Better Auth CVE-advisory affecting session/rate-limit                             | Внеплановий audit у тому ж файлі (round 3)            |
| Magic-link plugin enabled                                                         | F6 → перевести у scope з expiry tightening            |
| `auth_attempts_total{outcome="rate_limited"}` >5% від total                       | Розглянути bump 5 → 10/60s через env override         |
| `auth_session_lookup_duration_ms_count{outcome="miss"}` поодинокий day spike >50% | Розглянути bump 7d → 14d через rolling refresh tuning |
