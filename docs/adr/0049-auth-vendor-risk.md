# ADR-0049: Auth vendor risk and migration plan (Better Auth → Auth.js / Lucia fallback)

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0042 — password-hashing-strategy](./0042-password-hashing-strategy.md)
  - [`docs/security/better-auth-crypto-review.md`](../security/better-auth-crypto-review.md)
  - [`docs/initiatives/stack-pulse-2026-05/pr-10-better-auth-security-review.md`](../initiatives/stack-pulse-2026-05/pr-10-better-auth-security-review.md)
  - [`docs/security/hardening/H4-encryption-key-rotation.md`](../security/hardening/H4-encryption-key-rotation.md)

---

## Context and Problem Statement

Sergeant ставить ставку на Better Auth (`better-auth@1.6.x`) як єдиний
auth-provider — це менш зріла альтернатива до Auth.js / Lucia / Clerk.
Stack-pulse-2026-05 (H4) флагнув це як ризик: проєкт young, кастомний
adapter пише security-critical primitives, ecosystem ще не консолідований.

Окремий ADR потрібен, щоб зафіксувати:

1. Чому ми все одно лишаємось на Better Auth у короткостроковій перспективі.
2. **Trigger-и для re-open-у і запуску міграції** (без них рішення лежить
   у вакуумі і коли Better Auth deprecated — буде паніка).
3. Estimated effort + interface boundary, де нам найпростіше swap-нути.
4. Які саме контракти (cookie, session, social-OAuth flow) фіксуються як
   стабільний _адаптер-fasade_, щоб майбутній swap не торкався
   call-site-ів у `apps/server/src/{routes,middleware}`.

## Considered Options

| Option                                                       | Effort                    | Risk                                                          | Fit      |
| ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------- | -------- |
| Stay on Better Auth, add fallback ADR (this)                 | 0 days                    | Medium — H4 audit вже проведений у PR-48                      | ✓ chosen |
| Migrate to Auth.js _now_                                     | 8–12 person-days          | Medium-high — переписати OAuth, session, mobile-bearer plugin | reject   |
| Migrate to Lucia _now_                                       | 6–10 person-days          | Medium-high — менше adapters з коробки                        | reject   |
| Build custom adapter on top of `oslo` (low-level primitives) | 12–20 days                | High — re-implement OAuth state machine                       | reject   |
| Outsource to Clerk / Auth0                                   | 1–3 days code, $$ ongoing | Low code risk, high vendor lock-in + GDPR/PII flow            | reject   |

## Decision

**Stay on Better Auth.** Запис цього ADR — це formal hold з explicit
re-open trigger-ами:

### Re-open triggers

1. **Maintainer signal:** `better-auth` package has _no_ npm release for
   12 months OR primary maintainer announces deprecation.
2. **Security advisory:** unpatched HIGH/CRITICAL у `better-auth` >7 днів
   після disclosure.
3. **Functional defect:** OAuth-flow / session-cookie defect, що блокує
   Sergeant production-flow і не може бути обійдений через адаптер.
4. **Ecosystem signal:** ≥2 з трьох (downloads/місяць проседає 50%+,
   GitHub stars/місяць проседає 50%+, активних PR/місяць → 0).
5. **Strategic shift:** Перехід на passkey-only auth (WebAuthn) — Better
   Auth purpose-built для emial+password, not WebAuthn-first.

Будь-який trigger відкриває мікро-RFC, де ми обираємо між Auth.js/Lucia
залежно від contemporary state.

### Adapter fasade

Щоб майбутній swap не торкався call-site-ів, фіксуємо мінімальний
internal contract у `apps/server/src/auth.ts`:

```ts
export interface AuthFasade {
  getSessionUser(req: Request): Promise<User | null>;
  signIn(opts: SignInOpts): Promise<SignInResult>;
  signUp(opts: SignUpOpts): Promise<SignUpResult>;
  signOut(req: Request): Promise<void>;
  // OAuth callback handler
  handleOAuthCallback(provider: "google", req: Request): Promise<AuthUser>;
}
```

Все, що поза цим інтерфейсом (cookie store, scrypt details, key-ring
rotation), — implementation detail Better Auth, який міграція має право
переписати.

Поточний `getSessionUser` (`auth.ts:446-522`) уже відповідає цьому
контракту; інші точки або мають бути acted-on у міграційному PR-і (a)
write-test pinning behaviour, (b) ESLint правило заборонити прямий
`betterAuth(...)` import поза `auth.ts`.

## Rationale

- **Audit clean (PR-48):** crypto-review знайшов 0 HIGH-severity findings;
  AES-256-GCM правильно використаний, key-ring rotation працює, cookie
  config адекватний для Vercel↔Railway origin-pair. Міграція _зараз_ — це
  speculative work без триггера.
- **Stability lock-in:** Sergeant у solo-команді з low bus-factor (стек-
  пульс C4). Кожен auth-перехід додає 8–12 днів міграційної роботи + risk
  заломити OAuth для existing users. Виправдано тільки під real trigger.
- **Adapter fasade обсяг:** ~5 функцій (`AuthFasade` вище) — досить тонкий,
  щоб майбутня міграція торкнулась 1 файлу `auth.ts` + email-templates.
  Routes / middleware / mobile-bearer plugin не зачіпаються.
- **Key-ring portable (H4):** AES-256-GCM з key-ring-versioning — формат
  не залежить від Better Auth. На міграції ми просто перетягуємо
  `tokenCrypto.ts` як standalone-modul у новий adapter.
- **Mobile + native scheme support:** Better Auth у v1.6.x єдиний з
  mainstream-providers, що офіційно підтримує
  expo deep-links + native `sergeant://` scheme через `@better-auth/expo`
  плагін. Auth.js потребує custom adapter; Lucia — повний rewrite.

## Consequences

### Positive

- 0 days migration effort у короткостроковій перспективі.
- Adapter fasade фіксується вже зараз → майбутня міграція оцінюється
  як 5-day surface change, а не 12-day rewrite.
- Re-open trigger-и записані → коли Better Auth deprecated, Sergeant не
  буде шокований, а матиме готовий plan.

### Negative

- Sergeant залишається на vendor-у з smaller community (порівняно з
  Auth.js 100k+ DLs/тиждень → Better Auth ~25k DLs/тиждень станом на
  2026-05).
- При detected defect-і fix буде у Sergeant code-base через monkey-patch
  / wrapper, поки upstream не reagunie. Buffer-time = re-open trigger #3.

### Neutral

- Поточні `tokenCrypto.ts` + `keyRing.ts` лишаються як стабільні модулі;
  їх форма (input/output, format `enc:vN:kM:...`) не змінюється під
  міграцію.

## Compliance

- **PR-48** додає `docs/security/better-auth-crypto-review.md` з періодичним
  re-validate (next 2026-08-04).
- **Renovate** (per ADR-0044) групує `better-auth*` updates у dedicated
  security-tagged PR.
- **ESLint guard (TBD):** правило `no-direct-betterauth-import` (working
  name) забороняє `import { ... } from "better-auth/..."` поза `auth.ts`
  - `auth/encryptingAdapter.ts`. Опціонально — додаткова перевірка у
    `scripts/check-hard-rules-registry.mjs`.
- **Re-validation cadence:** цей ADR re-checked раз на квартал
  (`docs-freshness.yml` ловить через `last validated` header).

## Links

- [Better Auth GitHub](https://github.com/better-auth/better-auth)
- [Better Auth changelog](https://better-auth.com/changelog)
- [Auth.js](https://authjs.dev/) — primary fallback candidate
- [Lucia](https://lucia-auth.com/) — alternate fallback (lighter,
  expects more glue code)
- [`pr-10-better-auth-security-review`](../initiatives/stack-pulse-2026-05/pr-10-better-auth-security-review.md)
