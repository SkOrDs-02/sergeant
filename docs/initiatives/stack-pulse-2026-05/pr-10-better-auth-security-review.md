# PR-10: Better Auth security review + Safari/Webkit E2E

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Severity** | High (H4)                                                |
| **Owner**    | TBD                                                      |
| **Effort**   | 2–3 дні                                                  |
| **Risk**     | Medium (з'являться edge-кейси що раніше були не покриті) |
| **Touches**  | `apps/server/src/auth.ts`, тести Safari/Webkit, ADR      |

## Контекст

Sergeant використовує Better Auth v1.6.x — це новіша і менш зріла OAuth/session-альтернатива до Auth.js / Clerk / Lucia. Sergeant має кастомний adapter для:

- Token-encryption AES-256-GCM (`BETTER_AUTH_TOKEN_ENC_KEY` 64-hex chars = 32 bytes).
- Custom PBKDF2 + bcrypt hybrid (через bcryptjs).
- Custom session-cookie з HttpOnly + Secure + SameSite=Lax.

Чому high:

- Better Auth ecosystem ще young — багато bug-репортів за останній рік на cookie-handling, particularly у Safari (cross-site cookie-blocking, `__Host-` prefix).
- Custom-adapter код пише security-critical primitives (crypto). Self-rolled-crypto = найвища ймовірність bug-у.
- E2E tests (`apps/web/tests/e2e/auth.spec.ts`) запускаються на Chromium тільки. Safari/Webkit — не покритий, а саме там проявляються ITP / cookie issues.

## Scope

### 1. Crypto adapter audit

- Зовнішній review (або internal другим engineer-ом, після PR-04 secondary owners) на `apps/server/src/auth.ts`:
  - Чи `BETTER_AUTH_TOKEN_ENC_KEY` правильно generated (cryptographically random, не derived з пароля)?
  - Чи `iv` для AES-GCM генерується свіжим на кожен encrypt?
  - Чи tag-length 16 bytes?
  - Чи timing-attack-resistant compare на token-verify?
- Документ `docs/security/better-auth-crypto-review.md` зі знахідками.

### 2. Safari/Webkit E2E

- Розширити `playwright.config.ts` projects:
  ```ts
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ];
  ```
- Auth-flow specs:
  - Sign-up → sign-in → sign-out → re-sign-in → cookie persistence.
  - 3-rd-party cookie blocking (Safari ITP) — переконатись що Sergeant не залежить від cross-domain cookies.
  - `__Host-`-prefix on session cookie у production (Safari вимагає для maximum security).

### 3. CVE-tracking subscription

- `Renovate` групує `better-auth*` updates у окремий PR (security-priority).
- `Snyk` / GitHub Dependabot → Slack-notification на security-advisory для `better-auth`.

### 4. Fallback ADR

- `docs/adr/0046-auth-vendor-risk.md`:
  - Якщо Better Auth deprecated / abandoned — план міграції на Lucia / Auth.js.
  - Estimated effort + interface boundary, де нам найпростіше swap-нути.

## Out of scope

- Перехід на Auth.js (це окремий project, якщо ADR покаже потребу).
- WebAuthn / passkey support (окремий feature).

## Acceptance criteria (DoD)

- [ ] `docs/security/better-auth-crypto-review.md` створений з findings (severity-list).
- [ ] Кожен `severity: high` finding адресований у тому самому PR (з fixes у `auth.ts`).
- [ ] `playwright.config.ts` має `webkit` + `mobile-safari` projects.
- [ ] `pnpm e2e:auth` (новий script) запускає auth-flow на 3-х browsers.
- [ ] CI matrix `apps/web/.github/...` запускає E2E на 3 browsers (хоча б на nightly).
- [ ] ADR-0046 «Auth vendor risk and migration plan» — Accepted.

## Тести

- `apps/web/tests/e2e/auth-webkit.spec.ts` — Safari-specific cookie behavior tests.
- `apps/server/src/auth/__tests__/crypto.test.ts` — IV uniqueness, tag-verification, timing-safe-compare.

## Rollout

- 1 PR з audit + Safari E2E. Якщо crypto-audit виявить high-severity findings → split на 2 PR.

## Risks & mitigations

| Risk                               | Mitigation                                                  |
| ---------------------------------- | ----------------------------------------------------------- |
| WebKit E2E flaky → CI noise        | `retries: 2` для webkit project, опціонально на nightly     |
| Self-audit пропустить serious flaw | Попросити external security-review (HackerOne / contractor) |

## Touchpoints (file:line)

- `apps/server/src/auth.ts:1–319` — primary review surface
- `apps/server/src/env/betterAuthEnv.ts:34–80` — secret-strength validation
- `apps/web/playwright.config.ts` — projects expansion
- `docs/security/better-auth-crypto-review.md` — новий
- `docs/adr/0046-auth-vendor-risk.md` — новий

## Refs

- [Better Auth changelog](https://better-auth.com/changelog)
- [Safari ITP cookie policy](https://webkit.org/tracking-prevention/)
- [OWASP ASVS authentication chapter](https://owasp.org/www-project-application-security-verification-standard/)
