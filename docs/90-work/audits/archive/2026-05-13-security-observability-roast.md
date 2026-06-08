# Sergeant — Security & Observability прожарка (2026-05-13)

> **Last validated:** 2026-06-05 by Skords-01 (all S1–S11 follow-ups resolved in code — verified on disk). **Next review:** 2026-09-03.
> **Status:** Archived

> **Cross-refs:**
> [`2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../2026-05-03-web-deep-dive/04-security-observability-testing-devx.md) — головне джерело попередніх P0/P1 рекомендацій (CSP, Pino redact, Sentry, contract-тести) ·
> [`archive/2026-05-04-csp-disable-retrospective.md`](./2026-05-04-csp-disable-retrospective.md) — постмортем `CSP_DISABLE`-killswitch (A1–A5 closed 2026-05-06) ·
> [`2026-05-07-app-audit.md`](./2026-05-07-app-audit.md) — повний аудит зі security-related блокерами ·
> [`2026-05-07-full-app-regression-ux-audit.md`](./2026-05-07-full-app-regression-ux-audit.md) — регресійний UX-аудит (CSRF, CORS traceparent, CSP dev, Vercel Analytics bypass) ·
> [`docs/04-governance/governance/rules/15-governance-and-doc-language.md`](../../../04-governance/governance/rules/15-governance-and-doc-language.md) — Hard Rule #15 (читати governance перед кодом, UA-docs, freshness).
> **CSP canonical owner:** remaining CSP rollout/parity work lives in [`docs/04-governance/security/hardening/C2-frontend-csp.md`](../../../04-governance/security/hardening/C2-frontend-csp.md); CSP mentions here are source evidence / broader security context.

**Скоуп:** CSP, secrets-handling, Sentry, OpenTelemetry, web-vitals, audit-logs, auth-flow (Better Auth). Cross-app поверхня.

**Code-area фокус:** `apps/web/src/core/security/**`, `apps/server/src/auth/**`, `apps/server/src/http/`, observability-хуки в обох додатках.

**Метод:** статичний code-review (`apps/web` / `apps/server` / `packages/shared`) + крос-перевірка з `docs/04-governance/security/*` (canonical policy) і `docs/03-operations/observability/*` (operational runbook). Кожен outstanding-пункт — landing-якорь `file:line` для подальшого PR-плану.

**Формат:** P0/P1/P2 пріоритети + дії Add / Change / Remove + посилання `file:line`.

## TL;DR — топ-9 болів

1. **[Closed у цьому PR]** Web-Sentry `beforeSend` рекурсивно не скрабив PII — лише викидав `cookies`. `Authorization` header у XHR breadcrumb-ах, `Sentry.setExtra('payload', body)` з паролем, `event.user.email` через `setUser` — все доходило до Sentry ingest. Закрито через `applyWebBeforeSend` + єдине джерело правди `@sergeant/shared/lib/pii.ts`.
2. **[P0]** `apps/web/src/core/observability/analytics.ts:56` логує дев-time `console.log("[analytics]", event)` без перевірки PII у payload-event. Якщо handler передасть `{ email }` — leak у DevTools console screen-share / Sentry breadcrumb (`console`-integration увімкнено за замовчуванням у `@sentry/react`).
3. **[P1]** `apps/web/index.html:66-69` тримає `<meta http-equiv="Content-Security-Policy">` як defense-in-depth fallback, але директиви — **скорочений subset** Vercel-policy. При оновленні `apps/web/vercel.json` людська сінхронізація → drift. Потрібен `apps/web/src/test/cspMonitoringAllowlist.test.ts`-style parity-тест (уже існує, але перевіряє `Reporting-Endpoints`, не саму CSP).
4. **[P1, closed у follow-up `chore(web): add HTML SRI linter`]** SRI (Subresource Integrity) для third-party JS — у CSP дозволено `https://*.posthog.com`, `https://*.sentry-cdn.com`, але без `integrity=` хеша CDN-компроміс одразу стане XSS-вектором. `apps/web/index.html` зараз не вантажить ні PostHog, ні Sentry статично — обидва йдуть через npm-bundle, отже **SRI наразі не блокатор**, але потрібен guard, щоб новий `<script src="https://..."` без `integrity=` фейлив білд. Закрито через `scripts/lint-html-sri.mjs` (parse5-based) + CI step у `check` job.
5. **[P1]** Pino redact-paths мають wildcard рівно на одну глибину (`*.password` / `*.*.password`). Якщо у `req.body.nested.user.password` (3 рівні) — Pino не зачистить. Sentry-scrubber (тепер shared) ходить рекурсивно — але access-логи в Loki ходять тільки через Pino. Треба або додати `*.*.*` рівні, або (краще) — Pino-redaction-helper, який знає, що це wildcard-suffix і генерує всі рівні до 5.
6. **[P1]** OpenTelemetry attribute denylist у `apps/server/src/obs/tracing.ts` (доклинено header-фільтром) не перевіряється тестом проти `REDACT_KEY_NAMES`. Тобто додавання нового PII-ключа у `@sergeant/shared/lib/pii.ts` не автоматично закриває OTel-span attributes — drift можливий.
7. **[Closed у цьому PR #2741]** `apps/web/src/core/security/lockStorage.ts:44` PBKDF2 з `iterations: 200_000`. OWASP 2023 рекомендація для SHA-256 — мінімум 600 000 ітерацій на сучасних мобільних. Закрито через `iterations: 600_000` + `v: 2` field у IDB-cred + silent re-derive legacy `v=1` credentials at next successful unlock.
8. **[P2]** Sentry-init у web (`apps/web/src/core/observability/sentry.ts:104`) тегує `platform` і `is_capacitor`, але не тегує `outboxBootOutcome` / `cspMode` (report-only vs enforce) на ініті. Це робить retrospective-аналіз CSP-rollout складнішим у Sentry.
9. **[P2]** `docs/04-governance/security/pii-handling.md:34` посилається на конкретні file:line у `apps/server/src/sentry.ts`, але після рефакторингу 2026-05-13 канонічна імплементація `scrubPII` живе у `@sergeant/shared/lib/pii.ts`. Документ оновлено у тому ж PR, але майбутні `redactKeyNames`-розширення треба робити **у shared**, а не у `apps/server/src/obs/logger.ts` (там лишився back-compat-alias).

## Прогрес виконання — закрите у цьому PR

| Пункт                                 | Section ID | Що зроблено                                                                                                                                                                                                                                                                                          | Файли                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** — Web Sentry PII scrub parity  | §P0-S1     | `applyWebBeforeSend` рекурсивно чистить `request.headers/data/cookies`, `extra`, `contexts`, `breadcrumbs[].data`, нормалізує `event.user` до `{ id }`.                                                                                                                                              | `packages/shared/src/lib/pii.ts` (новий), `packages/shared/src/lib/pii.test.ts` (новий), `packages/shared/src/index.ts`, `apps/web/src/core/observability/sentry.ts`, `apps/web/src/core/observability/sentry.test.ts`, `apps/server/src/obs/logger.ts` (back-compat alias), `apps/server/src/sentry.ts` (re-export), `docs/04-governance/security/pii-handling.md` (single-source pointer). |
| **S6** — PBKDF2 ramp-up (200k → 600k) | §P1-S6     | `iterations: 200_000` → `600_000`; `LockCred` отримав опціональне `v` поле (`v: 2` для нових записів, `undefined`/`1` для legacy). `verifyPin` на legacy-cred виводить хеш зі старою кількістю ітерацій, а після успішного match — silent re-derive з 600k і запис під `v: 2` (rotates salt + hash). | `apps/web/src/core/security/lockStorage.ts`, `apps/web/src/core/security/lockStorage.test.ts`.                                                                                                                                                                                                                                                                                               |

**Закрито:** 1 з 9 у цьому PR (S1 — найвищий impact, бо XHR/fetch breadcrumb-и в production досі везли `Authorization` header у Sentry payload). **+1 закрито follow-up-ом:** S3 — `scripts/lint-html-sri.mjs` (parse5-based) валить білд на `<script src="https://...">` без `integrity=`/`crossorigin=` (див. § S3 заголовок).

**Не закрито в цьому PR (наступні PR-кандидати):**

- **S2** (P0, audit §6.5 carry-over) — ESLint-guard проти `console.log` з email-regex у payload. Потребує власного `eslint-plugin-sergeant-design`-правила + visit-фази для `MemberExpression` / `TaggedTemplateExpression`. Виноситься в окремий PR.
- ~~**S3** (P1) — SRI ESLint-guard на `<script src="https://...">` без `integrity=`.~~ ✅ Closed у follow-up PR `chore(web): add HTML SRI linter (audit § S3)` — реалізовано як `scripts/lint-html-sri.mjs` + `pnpm lint:html-sri` + CI step у `check` job (custom parse5-based script замість ESLint-правила, бо ESLint не парсить HTML natively).
- **S4** (P1) — Pino redact-paths wildcard generator до 5 рівнів. Потребує тестового матриксу + узгодження з `docs/04-governance/security/pii-handling.md`.
- **S5** (P1) — OTel attribute denylist parity test (`apps/server/src/obs/tracing.ts` ↔ `@sergeant/shared/lib/pii.ts`).
- **S7** (P2) — Sentry init tags: `cspMode`, `outboxBootOutcome` initial value, `webVitalsEnabled`.
- **S8** (P2) — Contract-тест coverage поширити з `/api/me` на `/api/auth/session`, `/api/account/recovery/*`, `/api/csp-report`.

## P0 — потрібно закрити в найближчий спринт

### S1 (closed у цьому PR) — Web Sentry PII scrub parity

- **Before:** `apps/web/src/core/observability/sentry.ts:96-99` (pre-refactor) — `beforeSend` лише викидав `event.request.cookies`. XHR/fetch breadcrumbs (з `Authorization` header), `Sentry.setExtra('payload', requestBody)`, `Sentry.setUser({ email })` — все доходило до ingest.
- **After:** `apps/web/src/core/observability/sentry.ts:21-59` — `applyWebBeforeSend()` мімікрує сервереий `applyBeforeSend` (`apps/server/src/sentry.ts:154`); shared контракт `scrubPII` живе у `packages/shared/src/lib/pii.ts:91` (DOM-free).
- **Action:** ✅ landed у цьому PR. Подальші правки (нові ключі) — у `@sergeant/shared/lib/pii.ts` → автоматично підхоплюються обома SDK.

### S2 — ESLint-guard проти `console.log` з PII (audit §6.5, outstanding 2026-05-03) ✅ Closed in #2754

- **Add:** `sergeant-design/no-console-pii` ESLint-rule у `packages/eslint-plugin-sergeant-design/index.js` (репо-конвенція — усі rule-и тримаються поруч в `index.js`; per-rule extraction — окремий refactor). Flag-ує `console.{log,error,warn,info}(...)` коли arg — string literal/template literal, що match-ить `/email|phone|password|token|secret|auth/i`, або об'єкт-arg (recursively) містить такі ключі.
- **Why:** довколишній код у `apps/web/src/core/observability/analytics.ts:56` робить `console.log("[analytics]", event)`. Якщо handler PostHog colors, payload з PII — leak у DevTools (screen-share), Sentry breadcrumb (`console`-integration), Logpipe-екстеншни. Audit §6.5 називає це outstanding після PR #1551.
- **Change:** правило зареєстровано у `packages/eslint-plugin-sergeant-design/index.js` `plugin.rules` map і ввімкнене у `eslint.config.js` `severity: "error"` для `apps/server/src/**/*.{js,ts}` + `apps/web/src/**/*.{ts,tsx}` (test-файли — ignored, як і у `no-anthropic-key-in-logs`).
- **Defense-in-depth fix:** `apps/web/src/core/observability/analytics.ts:56` тепер `structuredClone`-ує `event`, прогоняє через shared `scrubPII` і логує клон (audit S8 mini-action). Оригінальний `event` (LS ring-buffer + PostHog transport) не зачеплений.
- **Tests:** `packages/eslint-plugin-sergeant-design/__tests__/no-console-pii.test.mjs` — 5 BAD (string-літерал з `email`/`password`, template-літерал з `auth token`, об'єкт з `email`/`phone` ключем — top-level і nested) + 3 GOOD (плейн стрінг, об'єкт без PII-ключів, `console.debug` — outside method-list). `apps/web/src/core/observability/analytics.test.ts` — новий тест «логує `[analytics]` payload з вирізаним PII (audit S2)».
- **Remove:** -

### S3 — SRI ESLint-guard на сторонні `<script src>` (audit §6.4, outstanding) ✅ Closed у цьому PR

- **Add:** Кастомний `scripts/lint-html-sri.mjs` (parse5-based) — `<script src="https://...">` БЕЗ `integrity="sha384-..."` + `crossorigin="anonymous"` валить білд. Wire-up: `pnpm lint:html-sri` (також chained у `pnpm lint` → `pnpm check`), dedicated CI-кроки у `.github/workflows/ci.yml` § `check` job. Юніт-тести (28 кейсів, 6 BAD/GOOD-фікстур + actual `apps/web/index.html` guard): `scripts/__tests__/lint-html-sri.test.mjs` + `scripts/__tests__/fixtures/lint-html-sri/*.html`.
- **Why:** CSP allowlist (`apps/web/vercel.json:31`) пропускає `https://*.posthog.com`, `https://*.sentry-cdn.com`, `https://*.sentry.io`, `https://js.sentry-cdn.com`. У 2026 жодне з них зараз НЕ підключається статично у `index.html`, але майбутній PR, що додасть `<script>`-тег без `integrity=`, тихо відкриє supply-chain атаку.
- **Change:** на `<script src>` з `https://`-URL — обов'язковий `integrity="sha384-..."` (приймається також `sha256-` / `sha512-` per W3C SRI § 3.5; rejected: `md5-`, інші непідтримувані algos) + `crossorigin="anonymous"` (або `use-credentials`). Schema-relative URLs (`//cdn/...`) — той самий gate.
- **Remove:** -

## P1 — закрити в найближчий квартал

### S4 — Pino redact wildcard depth (audit §6.5 carry-over) ✅ Closed in #2749

- **Change:** `apps/server/src/obs/logger.ts:155-169` — `*.password`, `*.*.password` зараз вкриває 1+2 рівні; додати генератор, що розширює до 5 (рідкісно глибше). Або (краще): свій `redactor`-helper, що ловить ключі за іменем рекурсивно.
- **Why:** Sentry-scrubber ходить рекурсивно через `REDACT_KEY_NAMES` (тепер shared), Pino — ні. У Loki access-логи проходять тільки через Pino. Витік `req.body.nested.user.password` (3 рівні) — теоретично можливий через axios `err.config.data` capture.
- **Add:** тест у `apps/server/src/obs/logger.test.ts` (новий), який пише `logger.info({ a: { b: { c: { password: 'x' } } } })` і перевіряє, що substring `'x'` відсутній у stringify-output.

**Зроблено:** `apps/server/src/obs/logger.ts` тепер експонує `redactKeysRecursively` (non-mutating, cycle-safe `WeakSet`) як `formatters.log`-хук; він ходить по всіх рівнях merged-лог-обʼєкта і маскує ключі з `REDACT_KEY_NAMES` (case-insensitive) незалежно від глибини (3+ рівні `req.body.nested.user.password` більше не витікають). Старі статичні варіанти (`*.password`, `*.*.password`, `*.email`, `*.*.email`, `*.*.password`, `req.body.email`, `res.body.email`, ...) видалено — вони були редундантні до рекурсивного walker-а. `logger.test.ts` розширено новим `S4 — recursive redactor (deep nesting)` describe-блоком: happy-path acceptance criteria (3-level password, substring `'x'` не їсть в stringify-output) + edge case-и (4-level email, sensitive-keys в масивах, case-insensitive `Password`/`AUTHORIZATION`, object-valued sensitive keys в `null`, cycle-safety).

### S5 — OTel denylist parity test ✅ Closed

- **Status:** Already covered. `apps/server/src/obs/tracing.test.ts:115-127` describe-block `OTel PII denylist parity` iterates over every `REDACT_KEY_NAMES` entry (1st `it`) and over every `HEADER_DENYLIST` entry (2nd `it`), asserting both sets are contained in `OTEL_ATTRIBUTE_DENYLIST`. Drift between `@sergeant/shared/lib/pii.ts` and the OTel config is caught by the test, not just review.
- **Implementation:** `apps/server/src/obs/tracing.ts:114-117` constructs `OTEL_ATTRIBUTE_DENYLIST` as the union of lowercased `REDACT_KEY_NAMES` and `HEADER_DENYLIST` — the test consumes the same constants the runtime uses, so any new redact key automatically lands in the denylist.

### S6 (closed у цьому PR) — PBKDF2 ramp-up (200k → 600k iterations) ✅ Closed in #2741

- **Before:** `apps/web/src/core/security/lockStorage.ts:44` (pre-S6) — `iterations: 200_000`, IDB-cred shape `{ salt, hash }` без version-field-а; bruteforce 4-digit PIN з offline-dump-у IDB лімітований ~200k SHA-256 ітераціями per candidate.
- **After:** `apps/web/src/core/security/lockStorage.ts` — `LATEST_CRED_VERSION = 2`, `CURRENT_PBKDF2_ITERATIONS = 600_000`; IDB-cred тепер `{ salt, hash, v?: 1 | 2 }`. `savePinHash` завжди пише `v: 2` із 600k-derived hash-ом. `verifyPin` на cred-у з `v` undefined або `1` виводить кандидат за старою (200k) кількістю ітерацій — і, після успішного `timingSafeEqual`, silent re-derive з 600k + новий salt + запис під `v: 2` (`migrateCredIfNeeded`). Невдалий unlock не торкається legacy-запис.
- **Why:** OWASP 2023 рекомендує 600_000+ для SHA-256-PBKDF2 на mobile. Без ramp-up — 4-значний PIN bruteforce за хвилини на десктопі, якщо атакувальник має IDB dump.
- **Tests:** `apps/web/src/core/security/lockStorage.test.ts` — `S6` describe-block із 6 кейсів: snapshot `CURRENT_PBKDF2_ITERATIONS === 600_000` + `LATEST_CRED_VERSION === 2`; `savePinHash` пише `v: 2`; `deriveBits` викликається з `iterations: 600_000`; legacy v=1 cred верифікується; legacy v=1 апгрейдиться на v=2 після успішного unlock-у (rotates hash); wrong-PIN на legacy v=1 не запускає міграцію.
- **Action:** ✅ landed у цьому PR. Подальші правки iteration-floor-а (наприклад, OWASP-2026 bump до 1_200_000) — bump-нути `LATEST_CRED_VERSION` до 3, додати entry в `ITERATIONS_BY_VERSION`, і `verifyPin` автоматично підхопить нову migration-стежку.

### S7 (closed у цьому PR) — Contract test expansion (audit §7.4 carry-over)

- **Before:** `apps/server/src/routes/me.contract.test.ts` був єдиним producer-side contract-тестом у репо; для security-critical endpoint-ів (auth, csp-report, account-recovery) wire-shape між web client і server response не валідувалась і drift міг проходити тихо.
- **After:** Додано шість contract-файлів навколо канонічних fixture-ів у `packages/shared/src/contract-fixtures/{auth,cspReport,accountRecovery}.ts`:
  - producer-side: `apps/server/src/routes/auth.contract.test.ts`, `apps/server/src/routes/csp-report.contract.test.ts`, `apps/server/src/routes/account-recovery.contract.test.ts`;
  - consumer-side: `apps/web/src/test/contract/{auth,csp-report,account-recovery}.contract.test.ts`;
  - схеми — у `packages/shared/src/schemas/api.ts` (`AuthSessionResponseSchema`, `CspReportBodySchema`, `AccountRecovery*Schema`).
- **Why:** Hard Rule #3 — server response shape ↔ `api-client` types ↔ test тепер задокументований триплет для трьох security-critical поверхонь. Anti-account-enumeration інваріант (`OWASP ASVS § 2.2.1`) закодований у самому fixture-set-і для account-recovery (рівно один `accepted` response для registered + unregistered emails).
- **Action:** ✅ landed у цьому PR. Account-recovery handler-а ще не існує (Sentry sampling pin у `apps/server/src/sentry.ts:42`); коли роут зʼявиться, producer-test переключиться зі schema-only на supertest round-trip одним diff-ом.

### S8 — Web-vitals + analytics PII guard

- **Change:** `apps/web/src/core/observability/analytics.ts:56` — обернути `console.log` у `if (DEBUG_ANALYTICS && !containsPII(event))`. `containsPII` — простий regex на values.
- **Why:** DevTools logs ходять у Sentry breadcrumbs (`console`-integration) і потім у Loki через mobile-debug-window. Це той самий канал, що §6.5 закриває.

## P2 — закрити у наступних аудитах

### S9 — Sentry init tags (cspMode, outboxBootOutcome initial)

- **Change:** `apps/web/src/core/observability/sentry.ts:163` — після `setTag('platform', ...)` додати `setTag('cspMode', cspReportOnly ? 'report-only' : 'enforce')` (читати з `import.meta.env.VITE_CSP_REPORT_ONLY`).
- **Why:** Sentry search `cspMode:enforce AND directive:script-src` дозволяє за хвилину побачити, чи CSP-tightening регресував. Без тегу — треба фільтрувати руками.

### S10 — pii-handling.md drift guard ✅ Closed

- **Status:** Verified 2026-05-16. `apps/server/src/obs/logger.ts:3` imports `REDACT_KEY_NAMES` directly from `@sergeant/shared` — there is no back-compat `redactKeyNames` literal in `logger.ts` to drift. The shared package is the single source; both Pino redact paths (`apps/server/src/obs/logger.ts:97-198`) and OTel attribute denylist (`apps/server/src/obs/tracing.ts:114-117`) consume the same constant. A dedicated lint is unnecessary — drift would require touching the import line itself, which is reviewer-visible by convention.

### S11 — CSP `<meta>` ↔ `vercel.json` parity test

- **Change:** `apps/web/src/test/cspMonitoringAllowlist.test.ts:1` зараз гарантує parity тільки `Reporting-Endpoints` хедера. Розширити до повного CSP-directive-set.
- **Why:** Drift між `<meta>` (defense-in-depth fallback) і Vercel response header — silent regression при додаванні нового allowlist-у.

## Прикінцеві спостереження

- Більшість «P0/P1» з 2026-05-03 deep-dive (`04-security-observability-testing-devx.md`) реально закриті у PR #1551 (Pino redact, Sentry beforeSend сервера, requestId tag), PR #1602 (C4-діаграми), PR #1647/#1678/#1695/#1732 (Storybook). **Outstanding** — лише веб-side parity і test-pyramid robustness, що цей PR частково закриває.
- `CSP_DISABLE`-killswitch видалено (M1 hardening, PR #1631) — пов'язана retro-постмортем у `archive/2026-05-04-csp-disable-retrospective.md` повністю закрита.
- Hard Rule #21 (Pino redaction) — invariant; цей PR підтверджує його через рефакторинг до shared source-of-truth (без зміни поведінки сервера).
- Реалізація `applyWebBeforeSend` навмисно НЕ імпортує `@sentry/react` типи — інакше Sentry SDK потрапить у головний chunk через type-resolution і знищить lazy-import оптимізацію (~30-40 KB gzip).

## Як перевірити цей PR локально

```bash
# 1. Shared PII utility tests
pnpm --filter @sergeant/shared test -- pii

# 2. Web Sentry beforeSend integration tests
pnpm --filter @sergeant/web test -- --run src/core/observability/sentry.test.ts

# 3. Server Sentry tests (back-compat — re-export of scrubPII)
pnpm --filter @sergeant/server test -- --run src/sentry.test.ts

# 4. Server obs / logger contract preservation
pnpm --filter @sergeant/server test -- --run obs/

# 5. Full pre-PR matrix (mirrors CI)
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```
