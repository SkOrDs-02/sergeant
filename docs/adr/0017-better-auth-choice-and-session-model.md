# ADR-0017: Better Auth choice and session model

- **Status:** accepted (session TTL revised 2026-05-13 — PR-48 round 2)
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/auth.ts`](../../apps/server/src/auth.ts) — Better Auth config (`bearer()`, `expo()`, session settings).
  - [`apps/server/src/env/betterAuthEnv.ts`](../../apps/server/src/env/betterAuthEnv.ts) — startup-validations для production-mode.
  - [`apps/server/src/routes/auth.ts`](../../apps/server/src/routes/auth.ts) — `/api/auth/*` mount + rate limit.
  - [`apps/server/src/http/authMiddleware.ts`](../../apps/server/src/http/authMiddleware.ts) — `requireSession` middleware.
  - [`apps/server/src/migrations/003_baseline_schema.sql`](../../apps/server/src/migrations/003_baseline_schema.sql) — таблиці `user`/`session`/`account`/`verification`.
  - [`docs/adr/0016-user-deletion-and-pii-handling.md`](./0016-user-deletion-and-pii-handling.md) — взаємодія з deleteUser-flow.
  - [`docs/adr/0018-api-versioning-policy.md`](./0018-api-versioning-policy.md) — чому `/api/auth/*` поза версіонуванням.

---

## 0. TL;DR

Sergeant вибрав **Better Auth** (open-source TypeScript-first auth library) як
єдиний auth-stack для web + mobile + Expo. Альтернативи (Auth0, Clerk, Supabase
Auth, custom JWT) відкинуті за cost / lock-in / complexity. Цей ADR фіксує
вибір, конкретну session-model (cookie + bearer dual-channel), TTL-policy і
що НЕ покриваємо.

| Аспект                 | Decision                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Auth library           | Better Auth (open-source, self-hosted, $0)                              |
| Database               | Postgres (той самий `pool`, що і для domain-data)                       |
| Strategy               | Email + password (`emailAndPassword: { enabled: true }`)                |
| Min password length    | 10 chars (NIST SP 800-63B рекомендує мінімум 8)                         |
| Session TTL            | 7 days (`expiresIn: 60*60*24*7`) — tightened 2026-05-13 від 30d         |
| Session refresh        | 1 day rolling (`updateAge: 60*60*24`)                                   |
| Cookie cache           | 5 minutes (`cookieCache.maxAge: 60*5`) — uses signed JWT cookie         |
| Cross-site cookies     | `SameSite=None; Secure` коли base URL HTTPS (Vercel ↔ Railway)          |
| Mobile auth channel    | `bearer()` plugin → `Authorization: Bearer <token>` (`/api/v1/me`)      |
| Expo deep-link origins | `expo()` plugin + `sergeant://`, `exp://` у `trustedOrigins`            |
| OAuth providers        | None on MVP. Phase 2 — Google/Apple через Better Auth provider plugins. |
| 2FA                    | Out of scope. Phase 4+ при появі Pro-юзерів з high-value акаунтів.      |
| Email verification     | Optional (`sendOnSignUp: false`) — verification on demand               |
| Password reset email   | Через Resend (`queueAuthTransactionalEmail`, ADR не покривається)       |

---

## ADR-7.1 — Чому Better Auth, не Auth0 / Clerk / Supabase

### Status

accepted.

### Context

Auth — це повний stack: реєстрація, логін, password reset, email verification,
session management, OAuth, 2FA, magic links, organization membership, SAML,
audit log. Build-from-scratch — мінімум 4-6 тижнів роботи + ongoing cost
безпеки. Альтернативи на ринку:

| Опція              | Cost (1k MAU)        | Self-host? | TS-first? | Mobile (Expo)?      | Кастомізація           |
| ------------------ | -------------------- | ---------- | --------- | ------------------- | ---------------------- |
| **Better Auth**    | $0                   | yes        | yes       | yes (Expo plugin)   | повна (OSS)            |
| Auth0              | $240/mo (B2C Basic)  | no         | partial   | yes (universal)     | обмежена               |
| Clerk              | $25/mo (Pro)         | no         | yes       | yes                 | UI tightly coupled     |
| Supabase Auth      | $0 (вкл. в Supabase) | yes        | yes       | yes                 | прив'язано до Supabase |
| Firebase Auth      | $0                   | no         | partial   | yes                 | прив'язано до Firebase |
| NextAuth (Auth.js) | $0                   | yes        | yes       | partial (web-first) | повна                  |

Sergeant — single-founder, single-region, low-volume у перші 6 місяців.
Ми хочемо: $0 на MVP, повний контроль на даними (GDPR, see ADR-0016),
TypeScript-native, Expo-friendly, Postgres self-hosted.

### Decision

**Better Auth.** Прямо відповідає всім criteria:

- $0 для будь-якого MAU (open-source MIT).
- Self-hosted: бере той самий Postgres `pool` (`apps/server/src/db.ts`) —
  no extra service, no extra env, no extra cost.
- TypeScript-first: типи `auth.api.signIn`, `auth.api.deleteUser` first-class.
- `bearer()` plugin для мобілки. `@better-auth/expo` plugin для deep-link
  origin handling (`sergeant://`, `exp://`).
- `deleteUser: { enabled: true }` (auth.ts:64) — base GDPR Art. 17 з коробки.
- Plugin ecosystem (Phase 2): `oAuthProxy`, `passkey`, `twoFactor`, `organization`.

### Consequences

**Позитивні:**

- $0 на MVP. Save-up на Stripe/Anthropic.
- Postgres = single source of truth для user/session — ADR-0016 cascade-cleanup
  тривіальний.
- Mobile Bearer-token + Web Cookie з одного `auth`-instance — нічого
  додаткового.
- Better Auth схема стабільна (v0.13 → v1.0 у 2026-Q1, без breaking).

**Негативні:**

- Self-host = self-monitor. Сесія-storage у нашій PG — якщо PG down,
  весь auth down. Не cloud-multi-region.
- Менше high-volume battle-testing ніж Auth0. Якщо побачимо bug у Better
  Auth — patch upstream / fork. На MVP volume — низький ризик.
- Немає UI-builder-а (Clerk-style). Login/signup сторінки пишемо самі —
  на бренд це краще.

### Alternatives considered

- **Auth0**: $240/mo вже на 1k MAU — ціна одного Stripe-customer-a з MVP
  Pro-плану. Lock-in на їхні API. Відкинуто.
- **Clerk**: 5k MAU free tier ОК, але UI tightly coupled і кастомізація
  складніша. Mobile flow через Universal Login — bad UX для Expo. Відкинуто.
- **Supabase Auth**: вимагає весь Supabase stack (Postgres, Edge functions);
  ми вже маємо Railway PG. Поверхнева migration to Supabase — Phase 8+.
- **Build-from-scratch**: 4-6 тижнів + perpetual security maintenance.
  Founder-time дорожчий за будь-який SaaS. Відкинуто.

---

## ADR-7.2 — Session model: 7-day stateful + 5-min cookie cache

### Status

accepted.

### Context

Session-storage trade-off:

1. **Stateless JWT.** `userId` + `expiresAt` у signed JWT, БД-row немає.
   Pro: stateless API, scale-out trivial. Con: revoke (logout, password change,
   admin-ban) неможливий до expiry. **Не підходить** — у нас delete-account
   потребує миттєвого session-invalidation.

2. **Stateful session row.** Кожен sign-in — рядок у `session` table з
   `token`, `expiresAt`, `userId`. Pro: revoke = `DELETE FROM session WHERE id`.
   Con: один SELECT-запит на session-check на кожен API-call. На low-volume
   API ~10ms; на high-traffic — bottleneck.

3. **Hybrid: stateful row + signed cookie cache.** Session-row у БД +
   short-lived signed cookie з cached subset (`userId`, `expiresAt`).
   `requireSession` спочатку verify-ить cookie (no DB), якщо cookie
   expired — fall back на DB-lookup. Better Auth `cookieCache` робить це з
   коробки.

### Decision

**Hybrid: 7-day session row + 5-minute signed cookie cache:**

```ts
// apps/server/src/auth.ts
session: {
  expiresIn: 60 * 60 * 24 * 7,    // 7 days hard-expiry (tightened 2026-05-13)
  updateAge: 60 * 60 * 24,         // Rolling refresh after 1 day of activity
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5,                // 5-min signed cookie cache
  },
},
```

`expiresIn` = 7 days. До 2026-05-13 використовувалося 30 днів (consumer-SaaS
норма як Notion / Linear). PR-48 round-2 audit
([`docs/security/better-auth-audit-2026-05.md`](../security/better-auth-audit-2026-05.md))
скоротив до 7 днів: Сergeant — daily-habit app, активний user (≥1 request/day)
ніколи не бачить logout завдяки `updateAge=1d` rolling refresh, а stolen-cookie
window скорочується 4× (30d → 7d). Неактивні cold sessions >7 днів змушені re-login.

`updateAge` = 1 day rolling. Якщо юзер активний (хоч один request на день) —
сесія продовжується ще на 7 днів. Запит знятий зі screen-time-у юзера через
`req.user.id` look-up.

`cookieCache.maxAge` = 5 хв. У межах 5-хв вікна `requireSession`
verify-ить підпис cookie без DB-look-up — це ~30× швидше за SELECT
(cache.ts implements це через signed JWT-style cookie, signature перевіряється
в `auth.api.getSession`).

Trade-off `cookieCache`: revoke-затримка до 5 хв. Якщо юзер логаут-нувся,
сервер видалив `session` row, але cookie ще валідне — наступні 5 хв його
запити проходять. На delete-account це може бути невпевнюючим, але:

- Soft-delete з ADR-6.1 інвалідує всі sessions одразу
  (`DELETE FROM session WHERE "userId" = $1`). Cookie проходить ще 5 хв,
  але `requireSession` після cache-miss-у на DB не знайде user-row → 401.
- Для security-critical actions (password change, billing) додаємо
  `auth.api.revokeSession()` після операції — це `userSessions` flush у
  Better Auth.

### Consequences

**Позитивні:**

- 95%+ requests pass через cookie-verify (sub-ms). DB-load на
  `session`-таблицю — мінімальний.
- 7-day rolling — низький login-friction для daily-habit users.
- Revoke working (з 5-хв latency, acceptable).

**Негативні:**

- Stateful storage = full table scan або index scan на кожному cache-miss.
  Mitigation: `session.token UNIQUE` index уже є.
- 5-хв revoke-latency теоретично дозволяє compromised cookie бути використаним
  ще 5 хв після detection. Для soft-launch acceptable; для high-value Pro —
  Phase 4 уведемо force-revoke flag.

### Alternatives considered

- **JWT-only (option 1):** revoke-проблеми (cleanup-flow ADR-0016 не працює).
- **Stateful only (option 2):** 10-30ms session-check на кожен hit — на 100
  RPS = 1-3s/sec БД-time, 10% capacity використано лише на auth.
- **30-second cookie cache:** маленьке вікно, високий cache-miss rate.
  5 хв — стандартний baseline.
- **24-hour cookie cache:** надмірно довгий revoke-window.

---

## ADR-7.3 — Dual-channel: cookie (web) + bearer (mobile)

### Status

accepted.

### Context

Web-клієнт легко зберігає httpOnly cookie. Мобільний (React Native / Expo)
не має cookie API — в WebView частково так, у native fetch — ні. Без
spec-методу мобілка б змушена була шарити сесію через Authorization-header
з токеном, який вона зберігає в SecureStore.

### Decision

**Both channels через Better Auth `bearer()` plugin:**

```ts
// apps/server/src/auth.ts:118
plugins: [bearer(), expo()],
```

`bearer()` додає альтернативний канал: при кожному запиті Better Auth
перевіряє headers у такому порядку:

1. `Authorization: Bearer <token>` (мобілка).
2. `Cookie: better-auth.session_token=<token>` (web).

Mobile flow:

```
POST /api/auth/sign-in/email → response має Set-Cookie И body містить
                                 { token: "...", userId: "..." }
Mobile зберігає token у SecureStore (Expo) / Keychain (iOS) / EncryptedSharedPreferences (Android).
Subsequent requests: Authorization: Bearer <token>
```

`expo()` plugin додатково:

- Розширює `trustedOrigins` deep-link-схемами (`sergeant://`, `exp://`).
- Коригує origin-validation: Better Auth за замовчуванням блокує запити з
  origin не у trustedOrigins; для Expo в dev-mode origin = `exp://`,
  без plugin це б тригерило 403.

### Consequences

**Позитивні:**

- Один auth-instance, один code-path. Тести `auth.test.ts` перевіряють
  обидва канали.
- Mobile + web можуть існувати у тій самій сесії (рідкий кейс,
  але e.g. при testing — useful).

**Негативні:**

- Bearer-token у мобільному SecureStore — стандарт; risk = root-jailbreak
  device може exfiltrate token. Acceptable industry baseline.
- Token-rotation на mobile вимагає invoking signOut + signIn — нема "silent
  refresh" як у OAuth. Phase 2 — додамо refresh-token plugin.

### Alternatives considered

- **Cookie-only:** не працює для native mobile.
- **Окремий bearer-only API для мобілки:** дублює endpoint-и; non-DRY.
- **OAuth Bearer tokens (короткі) + refresh tokens:** додає complexity на
  MVP. Phase 2.

---

## ADR-7.4 — Cross-site куки: SameSite=None для спліта Vercel↔Railway

### Status

accepted.

### Context

Sergeant deploy: web — Vercel (sergeant.app), API — Railway (api.sergeant.app).
Це cross-site з точки зору cookie. Без `SameSite=None; Secure` web не може
читати сесійну cookie API-сервера.

### Decision

```ts
// apps/server/src/auth.ts:41-56
function getAdvancedCookieOptions(): AdvancedCookieOptions | null {
  if (process.env.BETTER_AUTH_CROSS_SITE_COOKIES === "0") return null;
  const base = getBaseURL();
  if (!base.startsWith("https://")) return null;
  return {
    useSecureCookies: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  };
}
```

Activates автоматично коли `BETTER_AUTH_URL` (або резолв через
`REPLIT_DOMAINS`) — HTTPS. Опціональний opt-out через
`BETTER_AUTH_CROSS_SITE_COOKIES=0` — для self-hosted setup, де frontend і
API на одному origin.

### Consequences

**Позитивні:**

- Vercel-deploy працює з box, без manual cookie config.
- Locally (HTTP localhost) — SameSite=Lax (Better Auth default), теж OK.

**Негативні:**

- `SameSite=None` означає cookie шлеться на every cross-origin request
  (CSRF-vector). Mitigation: Better Auth `trustedOrigins`-check
  блокує state-changing requests з не-whitelisted origin.

### Alternatives considered

- **Subdomain під одним origin (sergeant.app + api.sergeant.app):**
  з технологічної точки зору — sub-domain SameSite=Strict достатній.
  На MVP не control DNS-mapping для api.\* (Railway автоматичний); акцептуємо
  cross-site.
- **CORS-enabled fetch без credentials:** ламає Better Auth, бо session
  потребує cookie.

---

## ADR-7.5 — Що НЕ робимо (out of scope)

### Status

accepted.

### Decision

Цей ADR **не** покриває:

- **OAuth providers (Google, Apple).** Phase 2 — додамо через Better Auth
  `genericOAuth` plugin. Окремий ADR (TBD).
- **2FA / TOTP / passkeys.** Phase 4 при появі high-value Pro-юзерів. Better
  Auth `twoFactor` / `passkey` plugins готові.
- **Magic-link sign-in.** Не на MVP. Email-deliverability через Resend
  (auth-endpoint-и Better Auth викликаються напряму через Better Auth client; на момент написання
  окремого `packages/api-client/src/endpoints/<auth>.ts` wrapper-а немає — `/api/auth/*` оминає api-client)
  дає повільний flow для юзерів, які забули пароль.
- **Organization / team membership.** Sergeant — single-user product. Phase 8+
  для shared family-budget use-case.
- **Audit log авторизаційних подій.** Better Auth не зберігає `auth_event`
  таблицю; ми зберігаємо metric-counter (`auth_attempts_total{op, outcome}`)
  у Prometheus. Audit log як окремий ADR — після ADR-0018.
- **Account merging (sign-up з email, що вже є з OAuth).** Edge case;
  TBD коли OAuth активний.
- **CSRF token rotation на every state-change.** Better Auth handles
  `Origin`-перевірка для CSRF-mitigation; ми додаємо ще `helmet()` у
  `app.ts`. Phase 4 при появі форм-submit-flow для критичних дій.

---

## Open questions

1. **Increase min password length to 12?** NIST SP 800-63B каже мінімум 8;
   ми тримаємо 10. Якщо побачимо credential-stuffing у Sentry — підіймемо
   до 12. Trade-off між UX і security.
2. **Refresh-token rotation для mobile.** Сьогодні mobile bearer-token
   живе 7 days (`session.expiresIn`). У Phase 2 додамо `refresh-token`
   plugin з 7-day refresh + 24h access-token TTL, що дасть rotation
   semantics на access-leve.
3. **Session list UI.** Юзер бачить "ваші активні сесії: web (Chrome,
   Київ), iPhone, …" + revoke-кнопка. Better Auth API готовий
   (`auth.api.listSessions`); не побудовано UI. Phase 3.
4. **Migrate session storage до Redis?** Якщо PG-load на `session` table
   стане bottleneck (>500 RPS auth-checks), мігруємо у Redis. На MVP не
   потрібно.
