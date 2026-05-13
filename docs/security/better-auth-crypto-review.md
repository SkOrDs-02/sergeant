# Better Auth crypto review (PR-48 / stack-pulse PR-10)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

| Field        | Value                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | High (H4 in `docs/initiatives/stack-pulse-2026-05/00-overview.md`)                                                                                                                                     |
| **Owner**    | platform                                                                                                                                                                                               |
| **Source**   | [`pr-10-better-auth-security-review`](../initiatives/stack-pulse-2026-05/pr-10-better-auth-security-review.md)                                                                                         |
| **Related**  | [ADR-0042](../adr/0042-password-hashing-strategy.md), [ADR-0049](../adr/0049-auth-vendor-risk.md), [H4](./hardening/H4-encryption-key-rotation.md), [H3](./hardening/H3-session-revoke-and-binding.md) |

## Контекст

Sergeant використовує Better Auth v1.6.x з кастомним AES-256-GCM
encrypting-adapter-ом для шифрування OAuth-токенів у `account` table

- multi-key key-ring для on-line key rotation (H4). Stack-pulse-2026-05
  позначив це як H4 finding: «Better Auth ecosystem ще young; custom-adapter
  код пише security-critical primitives → найвища ймовірність bug-у».

Цей документ — formal review усіх crypto / cookie / session-fingerprint
шляхів аутентифікації. Метрика — severity-list зі знайденими питаннями і
вирок: чи треба виправляти у тому самому PR. PR-48 також додає Safari/
Webkit lane у smoke-E2E (`apps/web/playwright.smoke.config.ts` projects),
щоб ITP-related cookie regressions не доходили до прода непомітно.

## Scope

| Surface                                      | Що review-иться                                |
| -------------------------------------------- | ---------------------------------------------- |
| `apps/server/src/auth.ts`                    | Better Auth bootstrap + cookie/session config  |
| `apps/server/src/auth/tokenCrypto.ts`        | AES-256-GCM encrypt/decrypt primitives         |
| `apps/server/src/auth/encryptingAdapter.ts`  | Drizzle adapter wrapper навколо crypto helpers |
| `apps/server/src/auth/sessionFingerprint.ts` | UA / IP-prefix drift detection                 |
| `apps/server/src/lib/keyRing.ts`             | Multi-version key-ring parser                  |
| `apps/server/src/env/betterAuthEnv.ts`       | Startup env validation                         |

Out of scope:

- Перехід на Auth.js / Lucia — окремий PR; ADR-0049 описує trigger.
- WebAuthn / passkey support — окремий feature.
- E2E flakiness budget і CI billing для webkit/mobile-safari — по факту
  pilot-у на nightly extended-e2e workflow рішення приймемо у follow-up.

## Findings

### F1 — AES-256-GCM primitive usage [INFORMATIONAL — OK]

`tokenCrypto.encryptString` / `decryptString`:

- IV = 12 bytes random per call (`crypto.randomBytes(12)`) — рекомендована
  довжина GCM nonce (NIST SP 800-38D § 8.2.2).
- Tag length = 16 bytes — explicit `getAuthTag()` / `setAuthTag()`; на
  decode валідується довжина (`tokenCrypto.ts:190`).
- Key length validated як 64 hex = 32 bytes (AES-256). Throws на
  non-hex / wrong length input
  (тести `tokenCrypto.test.ts:64-70`).
- Тампер-тест підтверджує fail-loud при відомінній auth-tag
  (`tokenCrypto.test.ts:77-90`); wrong-key throws теж покритий
  (`tokenCrypto.test.ts:72-75`).
- Random IV across two encryptions of same plaintext дає different
  ciphertexts (`tokenCrypto.test.ts:41-47`) — отже nonce-reuse defect
  виключений.

**Verdict:** standard correct usage. No fix.

### F2 — Versioned key-ring rotation (H4) [INFORMATIONAL — OK]

`parseKeyRing` + `enc:v2:kN:` prefix дозволяють dual-key rollout:

- Legacy `BETTER_AUTH_TOKEN_ENC_KEY` (single hex) → ring with v1 only.
- New `BETTER_AUTH_TOKEN_ENC_KEYS=v1:hex,v2:hex` +
  `_CURRENT_VERSION=v2` → reads both, writes under v2.
- `getKeyForVersion` throws коли row references key, що вже не у env
  (exit-rotation сценарій). Lazy re-encrypt на наступному OAuth refresh
  (`encryptingAdapter.update` rewrites під `current.version`).
- `authTokenLazyReencryptTotal` Prometheus counter exposes
  `row_version × field` — ops підтверджує rotation drained до retire-у
  старого ключа.

**Verdict:** correct rotation flow + повна backwards-compat. No fix.

### F3 — Plaintext fall-through на `decryptString` [LOW — DOCUMENTED]

`decryptString` повертає input unchanged, якщо немає `enc:v1:` /
`enc:v2:` prefix. Цей шлях навмисний: до підключення encrypting-adapter-а
старі OAuth-токени були plaintext. Без fall-through вектор був би: env-key
вмикнули → `findOne` падає → юзер не може залогінитись через Google.

**Risk model:** атакуючий, що отримав DB-write privilege, міг би замінити
ciphertext на plaintext рядок (наприклад, на свій refresh-токен). Better
Auth прийняв би його як «pre-encryption row».

**Mitigation:**

- Запис у `account.{accessToken,refreshToken,idToken}` потребує
  DB-write — це та сама threat model, що й data-tamper будь-якої колонки;
  AES-GCM-tag захищає від integrity-attacks _після_ encryption, не від
  initial plaintext insert. Перекриває ця площина іншими контролями
  (DB-RBAC, audit-trigger на `account` mutations).
- Якщо потрібен strict mode — додати feature flag
  `BETTER_AUTH_STRICT_DECRYPT=1`, який падає при plaintext row.
  Triggered коли `metric{event="auth.token.decrypted_plaintext"} == 0`
  стабільно тиждень підряд.

**Verdict:** не блокер для PR-48. Recorded як LOW-finding для майбутнього
hardening.

### F4 — `BETTER_AUTH_SECRET` entropy validation [LOW — WORTH IMPROVING]

`assertBetterAuthStartupEnv` валідує:

- length >= 32 chars
- not in `WEAK_BETTER_AUTH_SECRETS` placeholder set

**Gap:** secret типу `'a'.repeat(32)` пройде. Recommended: додати Shannon
entropy threshold (e.g., reject if `entropy / log2(charset) < 0.5`) або
char-class diversity check (літери + цифри + спецсимволи).

**Why not in this PR:** окремий мікро-PR (1 файл, тестується ізольовано)
— не змішувати з audit + Safari E2E. Tracked у follow-up картці H10
(буде відкрита якщо team agrees).

### F5 — `__Host-` cookie prefix not used [LOW — SAFARI-SPECIFIC]

Better Auth ставить session cookie як `better-auth.session_token` (без
prefix). `__Host-` prefix вимагає трьох умов:

- `Secure` flag — ✓ задано через `useSecureCookies: true` коли HTTPS.
- `Path=/` — ✓ Better Auth default.
- _no_ `Domain` attribute — ✓ Better Auth не сетить `Domain`.

Тобто всі передумови виконані; питання тільки додати prefix до cookie
name. Це non-trivial у v1.6.x (вимагає custom advancedCookieAttribute
override, який ще не задокументований у public API). Safari _не_ блокує
cookie без prefix — це captable hardening, не bugfix.

**Verdict:** open як ENH-001 follow-up; do not include у PR-48.

### F6 — `SameSite=None` increases CSRF surface [INFORMATIONAL — OK]

Current cross-site cookie config (`sameSite: "none"` + `Secure`) потрібен
для Vercel ↔ Railway origin-pair. Better Auth's CSRF protection — origin-
header check на POST endpoints — закриває CSRF gap, що SameSite=Lax
закрив би на cookie level.

**Verdict:** trade-off правильно зроблений; CSRF chain validated by Better
Auth's middleware. No fix.

### F7 — Session fingerprint warn-only on drift [INFORMATIONAL — OK]

`detectFingerprintDrift` логує WARN при UA / IP-prefix mismatch _без_
forced re-auth. Це свідомий trade-off (auto-update browser version і
mobile networks-roaming створюють false-positive force re-auth, що
дратує юзерів). Для production alert-у Sentry rule ловить
`auth.session.ua_drift` event; correlator може force-revoke при N
drift-ів з різних ASN-ів за час T (адаптивний rotation).

**Verdict:** balanced trade-off. Future-work — adaptive force re-auth
після 3 drift events у 1 hour.

### F8 — `MAX_PASSWORD_LENGTH=256` (DoS bound) [INFORMATIONAL — OK]

Сценарій: зловмисник шле password завдовжки 1 MB → scrypt CPU-burn → DoS.
Better Auth обмежений `maxPasswordLength: 256` — узгоджено з NIST SP
800-63B (≥64 recommended, no upper bound enforced). Менше 1 ms scrypt
time на password — OK для login-rate-limit.

ADR-0042 фіксує scrypt вибір (не bcrypt — те, що було згадано у PR-10
spec); 72-byte truncation там не релевантна.

**Verdict:** OK, not a bcrypt-72 bug.

### F9 — Safari ITP / cross-site cookies [LOW — DOCUMENTED]

Safari блокує third-party cookies за ITP. Sergeant API (Railway) і web
(Vercel) — на різних eTLD+1 origin-ах (`api.sergeant…` vs
`sergeant.app`). У Safari user-flow:

1. На `/sign-in` web викликає `POST <api>/api/auth/sign-in/email`.
2. Запит — _first-party_ з точки зору user navigation (top-level frame =
   `sergeant.app`, fetch до іншого origin) → cookie приймається, бо це
   `sec-fetch-site=cross-site` без iframe-context. ITP не блокує
   cross-site cookies для top-frame fetch-ів.
3. Subsequent `GET /api/v1/me` шле cookie назад до Railway → працює.

ITP блокує cookie тільки коли API був би у iframe / через storage-access-
API. Цього сценарію Sergeant не має.

**Verdict:** OK у поточній архітектурі. Webkit smoke-spec
(`apps/web/tests/smoke/auth-webkit.spec.ts`) перевіряє sign-up + cookie
persistence через page reload — це регрешн-захист, якщо хтось у
майбутньому винесе auth у iframe.

### F10 — Trusted origins / wildcard validation [INFORMATIONAL — OK]

`getTrustedOrigins` (auth.ts:406-436) формує дозволений список origin-ів
з `ALLOWED_ORIGINS` + `REPLIT_*` env-vars. Wildcards не дозволяються
(plain string compare). Custom URL schemes (`sergeant://`) для native
deep-links дозволені тільки при `BETTER_AUTH_NATIVE_SCHEMES` set
(prefix-allowlist). H5 закрита.

**Verdict:** OK.

## Acceptance summary

| Finding                  | Severity | Action                                      | Closes   |
| ------------------------ | -------- | ------------------------------------------- | -------- |
| F1 — AES-GCM primitive   | INFO     | None — code correct                         | —        |
| F2 — Key-ring rotation   | INFO     | None — H4 already implemented               | H4       |
| F3 — Plaintext fall-thru | LOW      | Documented; strict-mode flag is future work | —        |
| F4 — Secret entropy      | LOW      | Future micro-PR (H10-secret-entropy)        | —        |
| F5 — `__Host-` prefix    | LOW      | Future enh ENH-001                          | —        |
| F6 — SameSite=None CSRF  | INFO     | None — CSRF middleware compensates          | —        |
| F7 — Drift warn-only     | INFO     | Future adaptive logic                       | —        |
| F8 — Pwd length / scrypt | INFO     | None — ADR-0042 already fixed               | ADR-0042 |
| F9 — Safari ITP          | LOW      | Smoke webkit-spec covers regression risk    | —        |
| F10 — Trusted origins    | INFO     | None — H5 already implemented               | H5       |

**Жодного HIGH-severity finding-у; PR-10 acceptance criterion #2 («Кожен
severity: high finding адресований у тому самому PR») trivially задоволений
через відсутність таких findings.**

## CVE / advisory tracking

- `Renovate` (per ADR-0044) групує `better-auth*` updates у окремий PR
  через `packageRules` matchPackagePatterns `^better-auth` + label
  `security`. Для існуючої CI без Renovate `npm-version-mismatch` job у
  `nightly-audit.yml` ловить mismatched lockfile.
- GitHub Dependabot security advisories для `better-auth` приходять у
  Slack через webhook (organization-level, налаштований).
- Manual sweep: `pnpm audit --filter @sergeant/server --json` запускається
  щоночі через `nightly-audit.yml`.

## Verification

- **Unit tests:** `pnpm --filter @sergeant/server test src/auth/tokenCrypto.test.ts`
  — 18 cases (round-trip, IV-uniqueness, tampered-tag, wrong-key,
  malformed-prefix, multi-key rotation).
- **Smoke E2E:** `pnpm --filter @sergeant/web exec playwright test
-c playwright.smoke.config.ts --grep @critical` запускається у CI на
  `chromium`; nightly extended-e2e workflow додатково проганяє
  `webkit` + `mobile-safari` projects (PR-48).
- **Static analysis:** ESLint правило `no-direct-betterauth-import`
  (existing) забороняє bypass adapter-обгортки.

## Cross-references

- [ADR-0042 — password-hashing-strategy](../adr/0042-password-hashing-strategy.md)
- [ADR-0049 — auth-vendor-risk](../adr/0049-auth-vendor-risk.md)
- [H3 — session-revoke-and-binding](./hardening/H3-session-revoke-and-binding.md)
- [H4 — encryption-key-rotation](./hardening/H4-encryption-key-rotation.md)
- [H5 — trusted-origins-exp-scheme](./hardening/H5-trusted-origins-exp-scheme.md)
- [H6 — email-verification](./hardening/H6-email-verification.md)
- [`pr-10-better-auth-security-review`](../initiatives/stack-pulse-2026-05/pr-10-better-auth-security-review.md)
- [Better Auth changelog](https://better-auth.com/changelog)
- [Safari ITP cookie policy](https://webkit.org/tracking-prevention/)
- [OWASP ASVS authentication chapter](https://owasp.org/www-project-application-security-verification-standard/)
- [NIST SP 800-38D — GCM](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
