# PR-план — Security & Observability follow-up з roast 2026-05-13

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active

> **Скоуп:** виключно відкриті пункти **S2–S11** з
> [`docs/audits/2026-05-13-security-observability-roast.md`](../audits/2026-05-13-security-observability-roast.md).
> S1 (Web Sentry PII scrub parity) вже закритий у тому ж PR, що ландив сам
> roast — не плануємо повторно. План розрахований на 1 квартал
> (sprint-by-sprint, не на квартальний biggie-release).

## Cross-refs

- **Audit / джерело пунктів:**
  [`docs/audits/2026-05-13-security-observability-roast.md`](../audits/2026-05-13-security-observability-roast.md)
  — section IDs `S2..S11` нижче зберігаються 1-в-1 із roast-документом.
- **Споріднені аудити (P0/P1 контекст):**
  [`docs/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`](../audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md),
  [`docs/audits/2026-05-07-app-audit.md`](../audits/2026-05-07-app-audit.md),
  [`docs/audits/2026-05-07-full-app-regression-ux-audit.md`](../audits/2026-05-07-full-app-regression-ux-audit.md),
  [`docs/audits/archive/2026-05-04-csp-disable-retrospective.md`](../audits/archive/2026-05-04-csp-disable-retrospective.md)
  (A1–A5 closed 2026-05-06).
- **Security policy / canonical:**
  [`docs/security/pii-handling.md`](../security/pii-handling.md),
  [`docs/security/logging-redaction-policy.md`](../security/logging-redaction-policy.md),
  [`docs/security/threat-model.md`](../security/threat-model.md),
  [`docs/security/vulnerability-sla.md`](../security/vulnerability-sla.md),
  [`docs/security/audit-exceptions.md`](../security/audit-exceptions.md).
- **Observability runbooks / dashboards:**
  [`docs/observability/metrics.md`](../observability/metrics.md) (Prometheus
  довідник, single source of truth для `apps/server/src/obs/metrics.ts`),
  [`docs/observability/runbook.md`](../observability/runbook.md) (алерт-runbook),
  [`docs/observability/sentry-sampling.md`](../observability/sentry-sampling.md),
  [`docs/observability/csp-monitoring.md`](../observability/csp-monitoring.md),
  [`docs/observability/frontend.md`](../observability/frontend.md),
  [`docs/observability/log-retention.md`](../observability/log-retention.md),
  [`docs/observability/SLO.md`](../observability/SLO.md).
- **Runbooks (operations-side):**
  [`docs/runbooks/operations-runbook.md`](../runbooks/operations-runbook.md),
  [`docs/runbooks/encryption-key-rotation.md`](../runbooks/encryption-key-rotation.md),
  [`docs/runbooks/database-backup-restore.md`](../runbooks/database-backup-restore.md).
- **ADR-and-Hard-Rules baseline:**
  [`docs/adr/0015-observability-stack.md`](../adr/0015-observability-stack.md)
  (Pino + Prometheus + Sentry — три незалежні шари; жоден PR нижче не змінює
  цей розклад),
  [`AGENTS.md`](../../AGENTS.md) Hard Rules #20 (no OpenClaw PATs у проді),
  #21 (Pino redaction enforced), #22 (Skill body security scan).
- **Сусідній план для секвенсингу:**
  [`docs/planning/pr-plan-2026-05.md`](./pr-plan-2026-05.md) — 48-PR
  revenue/ops план. Дублів немає; security/obs тут не перетинається з
  revenue-track-ом.

## Глосарій / умовні позначення

- **P-level:** P0 = найближчий sprint (closing window 14 днів), P1 = квартал,
  P2 = можна тримати у backlog без SLA-pressure.
- **Effort:** S = ≤ 0.5 day end-to-end (PR + review), M = 1–2 days, L = > 2 days
  (зазвичай із multi-file refactor або новим depandency).
- **Threat-model impact:** мапиться на колонки STRIDE з
  [`docs/security/threat-model.md`](../security/threat-model.md) — S(poofing),
  T(ampering), R(epudiation), I(nformation disclosure), D(enial of service),
  E(levation of privilege).
- **Owner — placeholder:** `TBD (<role>)` — поки delegation не зафіксована
  у `CODEOWNERS`, ставимо роль. Real GitHub handles мають з'явитися до
  моменту відкриття відповідного PR (інакше `pnpm lint:codeowners` фейлить
  — див. [AGENTS.md § Module ownership map](../../AGENTS.md#module-ownership-map)).

## Зведена таблиця

| #   | Title                                          | Effort | P   | Threat-model | Dependency        | Owner (placeholder)     |
| --- | ---------------------------------------------- | ------ | --- | ------------ | ----------------- | ----------------------- |
| S2  | ESLint `no-console-pii` rule                   | M      | P0  | I            | —                 | TBD (frontend-engineer) |
| S3  | ESLint SRI-guard на `<script src=https://…>`   | L      | P1  | T, I         | —                 | TBD (frontend-engineer) |
| S4  | Pino redact wildcard depth → 5 рівнів          | M      | P1  | I, R         | —                 | TBD (backend-engineer)  |
| S5  | OTel attribute denylist parity test            | M      | P1  | I            | S4 landed first   | TBD (backend-engineer)  |
| S6  | PBKDF2 ramp-up 200k → 600k + migration         | M      | P1  | S, E         | —                 | TBD (frontend-engineer) |
| S7  | Contract-test coverage: auth/csp-report/recov. | M      | P1  | T, R         | —                 | TBD (backend-engineer)  |
| S8  | Web-vitals / analytics PII guard               | S      | P1  | I            | S2 landed first   | TBD (frontend-engineer) |
| S9  | Sentry init tags (`cspMode`, outbox, vitals)   | S      | P2  | R            | —                 | TBD (frontend-engineer) |
| S10 | `pii-handling.md` drift-guard lint             | S      | P2  | I            | none (S4 helpful) | TBD (backend-engineer)  |
| S11 | CSP `<meta>` ↔ `vercel.json` parity test       | M      | P2  | T, I         | —                 | TBD (frontend-engineer) |

> 10 PR-карток (у межах 8–12 за вимогою). Detalізація — нижче.

---

## PR-картки

### S2 — ESLint `no-console-pii` rule

- **Title (commit):** `feat(eslint): add no-console-pii rule blocking PII in console.* calls`
- **Scope:**
  - Нове правило у `packages/eslint-plugin-sergeant-design/src/rules/no-console-pii.ts`.
  - AST-visit на `CallExpression` із `console.log/error/warn/info/debug`:
    - flag, якщо будь-який arg — string literal матчить
      `/email|phone|password|token|secret|authorization/i`;
    - flag, якщо `TemplateLiteral` має substitution з identifier-ім, що
      закінчується на `email|phone|password|token|secret|authorization`
      (case-insensitive) — eg `${user.email}`, `${tokenValue}`;
    - flag, якщо arg — object expression із key з того ж списку
      (статичний key + literal value).
  - Реєстрація у `packages/eslint-plugin-sergeant-design/src/index.ts`,
    severity `error` у `eslint.config.mjs`.
  - Unit-тести у `packages/eslint-plugin-sergeant-design/src/rules/__tests__/no-console-pii.test.ts`
    (good/bad cases + fixture з `apps/web/src/core/observability/analytics.ts:56`).
- **Acceptance:**
  - `pnpm lint` фейлиться на штучному прикладі
    `console.log({ email: user.email })` і на template literal
    ``console.log(`token=${value}`)``.
  - `pnpm lint` чистий на main після введення правила (для існуючого коду —
    або auto-fix, або `// eslint-disable-next-line` з audit-exception-у
    у `docs/security/audit-exceptions.md`).
  - Документ-стаб у
    [`docs/security/logging-redaction-policy.md`](../security/logging-redaction-policy.md)
    оновлено посиланням на правило.
- **Threat-model impact (STRIDE):** **I** — закриває канал
  «Information disclosure через DevTools screen-share + Sentry `console`-breadcrumb +
  Logpipe-екстеншни». Це той самий threat-vector, що STRIDE-row
  _Information disclosure → mobile/web log buffers_ (див.
  [`threat-model.md`](../security/threat-model.md) розділ web-app).
- **Effort:** M (1 day — правило + тести + автограф у CONTRIBUTING).
- **P:** **P0** (audit §6.5 — carry-over з 2026-05-03, прострочено понад
  10 днів; найближчий sprint).
- **Dependencies:** —. Незалежний; ніщо інше не блокує і не блокується ним
  напряму (S8 — наступний rasm-step із runtime-guard-ом — стане легшим
  після S2, але не блокує).
- **Owner placeholder:** TBD (frontend-engineer).

### S3 — ESLint SRI-guard на сторонні `<script src>`

- **Title:** `feat(eslint): require SRI integrity= on third-party <script src> in index.html`
- **Scope:**
  - Нове правило `packages/eslint-plugin-sergeant-design/src/rules/sri-on-third-party-script.ts`
    із `parse5`-based парсером (новий dev-dep).
  - Lints файли `apps/**/index.html` (`mobile-shell`, `web`, `console`).
  - Виявляє `<script src="https://...">` без `integrity="sha(256|384|512)-..."` або
    без `crossorigin="anonymous"` — error.
  - Тестова фікстура: `apps/web/index.html` + штучний bad-case.
  - Документ-стаб у новому
    `docs/security/hardening/sri-on-third-party-scripts.md` (cross-link із
    [`docs/security/threat-model.md`](../security/threat-model.md) `T`-row).
- **Acceptance:**
  - `pnpm lint` фейлить штучний `<script src="https://cdn.example.com/x.js">`
    без `integrity=`.
  - `pnpm lint` чистий на main (наразі такі `<script>`-теги відсутні у
    `apps/web/index.html`; PostHog / Sentry йдуть через npm-bundle).
  - Документ описує, як саме generate SHA-384 (`openssl dgst -sha384 -binary | openssl base64 -A`),
    і як bumпати при оновленні CDN-версії.
- **Threat-model impact:** **T, I** — CSP allowlist (`apps/web/vercel.json`)
  пускає `https://*.posthog.com`, `https://*.sentry-cdn.com`,
  `https://js.sentry-cdn.com`. Без SRI компроміс будь-якого з цих CDN-ів =
  одношаговий XSS у frontend, що bypass-ить наш CSP report-only/enforce
  pipeline. Закриває STRIDE-row _Tampering → CDN supply-chain_ у
  [`docs/security/threat-model.md`](../security/threat-model.md).
- **Effort:** L (parse5 + правило + 2 fixture-файли + перевірка
  cross-app-у `apps/console/index.html` / `apps/mobile-shell/`).
- **P:** **P1** (CSP allowlist + поточна відсутність статичних third-party
  тегів = ризик ще не активний, але треба зафіксувати до того, як хтось
  додасть PostHog snippet inline).
- **Dependencies:** —. Може ландитися паралельно з S2 (різні файли).
- **Owner placeholder:** TBD (frontend-engineer).

### S4 — Pino redact wildcard depth до 5 рівнів

- **Title:** `fix(server-obs): expand pino redact wildcards beyond depth 2`
- **Scope:**
  - У `apps/server/src/obs/logger.ts:155-169` — або (i) розширити статичний
    масив `redact.paths` генератором, що додає `*.*.<key>`, `*.*.*.<key>`,
    `*.*.*.*.<key>`, `*.*.*.*.*.<key>` для кожного імені з
    `REDACT_KEY_NAMES` із `@sergeant/shared/lib/pii.ts`; або (ii, краще)
    додати `redactor`-helper, що ловить ключі рекурсивно. Якщо
    рекурсивний — переконатися, що bench-overhead на hot-path
    (`logger.info(req)`) — < 5% (см. `apps/server/src/obs/__bench__/`).
  - Новий unit-тест `apps/server/src/obs/logger.test.ts`:
    `logger.info({ a: { b: { c: { password: 'secret-xyz' } } } })` → у
    stringify-output не зустрічається substring `'secret-xyz'`.
  - Sync-перевірка з
    [`docs/security/pii-handling.md`](../security/pii-handling.md):
    канонічний список ключів живе тільки у
    `packages/shared/src/lib/pii.ts`.
- **Acceptance:**
  - Тест із 5-рівневим nesting проходить.
  - Bench (якщо рекурсивний підхід) — < 5% regression на
    `apps/server/src/obs/__bench__/redact.bench.ts` (створити, якщо не існує).
  - Hard rule [#21 — Pino redaction policy enforced](../../AGENTS.md#21-pino-redaction-policy-enforced)
    лишається пройденим (`pnpm lint:redaction-policy`, якщо такий є — або
    еквівалентний gate).
- **Threat-model impact:** **I, R** — закриває channel
  «Loki access-logs ловлять `req.body.nested.user.password`-валуй із 3+
  глибини». STRIDE _Information disclosure → server logs_ і
  _Repudiation → audit trail з PII_ у
  [`threat-model.md`](../security/threat-model.md).
- **Effort:** M.
- **P:** **P1**.
- **Dependencies:** має ландитися перед S5 (бо OTel parity-test опирається
  на той самий `REDACT_KEY_NAMES`-контракт; якщо порядок розширення
  поміняти, S5-тест treba буде перепрацьовувати на проміжний state).
- **Owner placeholder:** TBD (backend-engineer).

### S5 — OTel attribute denylist parity test

- **Title:** `test(server-obs): assert OTel attribute denylist matches REDACT_KEY_NAMES`
- **Scope:**
  - Новий тест `apps/server/src/obs/tracing.test.ts`.
  - Інстансіювати `NodeSDK` у dry-run mode (in-memory exporter), створити
    span, setAttribute з кожним ключем з `REDACT_KEY_NAMES`
    (`@sergeant/shared/lib/pii.ts`), переконатися, що exporter бачить
    тільки redacted-маркери (`<redacted>`).
  - Якщо denylist у `apps/server/src/obs/tracing.ts` — captured-statement
    замість виклику helper-а, треба cross-refactor: запозичити список з
    shared.
- **Acceptance:**
  - Додавання нового ключа у `@sergeant/shared/lib/pii.ts` без оновлення
    OTel-config-а фейлить новий тест.
  - `pnpm --filter @sergeant/server test` lokal не реджектиться (потребує
    `OTEL_*` env-vars-disable для тесту — task документувати у
    `apps/server/AGENTS.md`).
- **Threat-model impact:** **I** — STRIDE _Information disclosure → OTel
  span attributes у trace backend_. Зараз denylist синхронізується manual
  code-review, що = silent drift.
- **Effort:** M.
- **P:** **P1**.
- **Dependencies:** S4 ландить раніше — щоб не мати mid-flight state, де
  shared list розширений, а Pino — ні (тимчасова інконсистентність
  гарантовано спрацює як false-positive у S5).
- **Owner placeholder:** TBD (backend-engineer).

### S6 — PBKDF2 ramp-up 200k → 600k + migration plan

- **Title:** `fix(web-security): bump lockStorage PBKDF2 iterations to 600k with versioned migration`
- **Scope:**
  - `apps/web/src/core/security/lockStorage.ts:44` — `iterations: 200_000`
    → `600_000`.
  - Додати `version: 2`-поле у IDB-credential record (default = 1 для
    існуючих); при наступному unlock — re-derive із новою ітераційністю
    і записати `version: 2`.
  - Snapshot-тест у `apps/web/src/core/security/lockStorage.test.ts` —
    `iterations === 600_000`.
  - Документ-стаб у `docs/security/hardening/` (нова картка) +
    оновлення [`docs/security/pii-handling.md`](../security/pii-handling.md)
    cross-ref-ом, якщо існує розділ про lockStorage; інакше — у
    [`docs/security/access-policy.md`](../security/access-policy.md).
- **Acceptance:**
  - Snapshot-test passes (`iterations === 600_000`).
  - Migration-path-тест: існуючий IDB record (`version: 1`) → unlock →
    запис із `version: 2` і новим `derivedKey`.
  - Manual QA: cold-unlock latency на typical mobile (Pixel 6) — < 600 ms
    (документувати у PR description, не в `docs/`).
- **Threat-model impact:** **S, E** — STRIDE _Spoofing → 4-digit PIN
  brute-force_ і _Elevation of privilege_ через offline-крек IDB dump.
  OWASP 2023 recommendation для SHA-256 PBKDF2 — мін. 600 000.
- **Effort:** M.
- **P:** **P1** (4-digit PIN — слабкий floor сам по собі, тому ramp-up
  важливий, але не P0 — atak-vector потребує physical access до пристрою
  з IDB dump-ом).
- **Dependencies:** —.
- **Owner placeholder:** TBD (frontend-engineer).

### S7 — Contract-test coverage для security-critical endpoints

- **Title:** `test(api): contract coverage for /api/auth/session, /api/account/recovery/*, /api/csp-report`
- **Scope:**
  - Нові тести `apps/server/src/routes/auth.contract.test.ts`,
    `apps/server/src/routes/csp-report.contract.test.ts`,
    `apps/server/src/routes/account-recovery.contract.test.ts`.
  - Reuse fixture-pattern із
    `packages/shared/src/contract-fixtures/me/` (створити sibling-папки
    `auth/`, `csp-report/`, `account-recovery/`).
  - Перевірити shape-сумісність між server-response і
    `@sergeant/api-client` (Hard Rule #3).
- **Acceptance:**
  - Кожен endpoint має один contract-тест із happy-path-response-shape-ом.
  - Розширення payload-у на сервері без оновлення `api-client` → тест
    фейлить (negative-case fixture).
  - [Hard rule #3 — API contract](../../AGENTS.md#hard-rules-do-not-break)
    залишається пройденим (`pnpm lint:codeowners` + contract-suite зелені).
- **Threat-model impact:** **T, R** — STRIDE _Tampering → response-shape
  drift на security-critical endpoint-ах_ (auth session, password
  recovery, CSP report). _Repudiation → silent shape changes без аудит-сліду_.
- **Effort:** M.
- **P:** **P1**.
- **Dependencies:** —. Не залежить від інших S-карток; може ландити
  паралельно.
- **Owner placeholder:** TBD (backend-engineer).

### S8 — Web-vitals / analytics PII guard

- **Title:** `fix(web-obs): gate analytics console.log behind DEBUG_ANALYTICS + containsPII check`
- **Scope:**
  - `apps/web/src/core/observability/analytics.ts:56` — обернути
    `console.log("[analytics]", event)` у
    `if (import.meta.env.DEV && DEBUG_ANALYTICS && !containsPII(event)) { ... }`.
  - `containsPII` — proste утиліта у `apps/web/src/core/observability/`,
    regex over Object.values (`/email@|^\+\d{6,}/`-style).
  - Тест `apps/web/src/core/observability/analytics.test.ts` — payload із
    `email: 'a@b.com'` не логиться.
- **Acceptance:**
  - Test passes.
  - Sentry `console`-breadcrumb integration лишається увімкненою — але
    тепер у її payload не може потрапити email/phone через цей канал.
- **Threat-model impact:** **I** — STRIDE _Information disclosure через
  Sentry `console`-breadcrumb_. Той самий канал, що §6.5 у попередньому
  audit-і.
- **Effort:** S.
- **P:** **P1**.
- **Dependencies:** S2 (ESLint-rule) ландить раніше — тоді цей PR одночасно
  «зачищає існуючий call-site» + правило не дає регресувати.
- **Owner placeholder:** TBD (frontend-engineer).

### S9 — Sentry init tags (`cspMode`, `outboxBootOutcome`, `webVitalsEnabled`)

- **Title:** `chore(web-obs): tag Sentry init with cspMode, outbox boot outcome, webVitals flag`
- **Scope:**
  - `apps/web/src/core/observability/sentry.ts:163` — після
    `setTag('platform', ...)` додати:
    - `setTag('cspMode', cspReportOnly ? 'report-only' : 'enforce')` —
      читати з `import.meta.env.VITE_CSP_REPORT_ONLY`;
    - `setTag('outboxBootOutcome', initialOutboxStatus)` (initial value,
      на моменті init — `'pending' | 'ok' | 'failed'`);
    - `setTag('webVitalsEnabled', String(webVitalsEnabled))`.
  - Документ-стаб у
    [`docs/observability/sentry-sampling.md`](../observability/sentry-sampling.md)
    додає рядок про нові теги (вони не змінюють sampling, але впливають
    на пошук).
- **Acceptance:**
  - У Sentry-search query `cspMode:enforce AND directive:script-src` дає
    непорожній результат через 24h після rollout (manual QA — у PR
    description, не у docs).
  - Тест у `apps/web/src/core/observability/sentry.test.ts` (вже існує):
    додати асерт, що `setTag` викликається із кожним з 3-х нових ключів.
- **Threat-model impact:** **R** — STRIDE _Repudiation → відсутність
  retrospective-аналізу CSP-rollout-у_. Не закриває нову загрозу, але
  відновлює forensic-чітабельність regressions (e.g. silent CSP
  loosening під час hotfix).
- **Effort:** S.
- **P:** **P2** (no active leak, тільки forensic-ergonomics).
- **Dependencies:** —.
- **Owner placeholder:** TBD (frontend-engineer).

### S10 — `pii-handling.md` drift-guard lint

- **Title:** `feat(governance): lint guard against pii-handling.md drift from @sergeant/shared/lib/pii.ts`
- **Scope:**
  - Новий скрипт `scripts/lint-pii-handling-drift.mjs` — парсить
    [`docs/security/pii-handling.md`](../security/pii-handling.md) для списку
    «redacted keys», порівнює з `REDACT_KEY_NAMES` із
    `packages/shared/src/lib/pii.ts`. Якщо різниця — fail.
  - Реєстрація у `package.json` під `lint:pii-handling-drift` і у
    `pnpm lint`-agg-command.
  - Документ-апдейт у самому `docs/security/pii-handling.md` — додати
    machine-readable секцію (`<!-- pii-keys-start -->` … `<!-- pii-keys-end -->`)
    для парсера.
- **Acceptance:**
  - Тест-fixture: тимчасово видалити рядок з shared → lint фейлить.
  - `pnpm lint` зелений на main.
- **Threat-model impact:** **I** — STRIDE _Information disclosure через
  drift у документації, який вводить розробників в оману_ (e.g. хтось
  додає новий redacted-ключ у shared, але документація показує старий
  список; інший розробник реверс-додає API без redact-у, бо «у списку
  його ще не було»).
- **Effort:** S.
- **P:** **P2**.
- **Dependencies:** none. Помічно після S4 (бо тоді shared-список
  стабілізований), але не блокує.
- **Owner placeholder:** TBD (backend-engineer).

### S11 — CSP `<meta>` ↔ `vercel.json` parity test

- **Title:** `test(web-security): full CSP directive parity between index.html meta and vercel.json header`
- **Scope:**
  - Розширити `apps/web/src/test/cspMonitoringAllowlist.test.ts` — зараз
    він гарантує parity тільки на `Reporting-Endpoints` хедер. Додати
    повний directive-set із `apps/web/vercel.json:31`-headers vs
    `<meta http-equiv="Content-Security-Policy">` із
    `apps/web/index.html:66-69`.
  - Normalizing helper — `parseCsp(header) → Map<directive, Set<source>>`
    у `apps/web/src/test/helpers/parseCsp.ts`.
  - Документ-апдейт у
    [`docs/observability/csp-monitoring.md`](../observability/csp-monitoring.md)
    — додати рядок «parity test є частиною CI-gate-у».
- **Acceptance:**
  - Test passes на main.
  - Штучний drift у `<meta>` (e.g. додати домен у `script-src`, забути в
    Vercel) — фейлить.
- **Threat-model impact:** **T, I** — STRIDE _Tampering / Information
  disclosure → defense-in-depth fallback розходиться з production
  response-header_. Без parity-тесту silent regression при додаванні
  нового allowlist-у можлива.
- **Effort:** M.
- **P:** **P2**.
- **Dependencies:** —.
- **Owner placeholder:** TBD (frontend-engineer).

---

## Sequencing

> **Принцип:** P0 (S2) — у найближчий sprint. P1 (S3–S8) — упродовж
> кварталу. P2 (S9–S11) — у наступному кварталі або як «filler»-PR-и
> між revenue-track-карткою з
> [`docs/planning/pr-plan-2026-05.md`](./pr-plan-2026-05.md).

### Sprint 1 (current, 14 днів)

1. **S2** (P0) — `no-console-pii`. Незалежний.
2. **S8** (P1, follow-up до S2) — analytics PII guard.

### Sprint 2 (наступні 14 днів)

3. **S4** (P1) — Pino redact wildcard depth. Має ландити **перед** S5.
4. **S5** (P1) — OTel parity test. Після S4.
5. **S7** (P1) — contract tests для auth/csp-report/recovery.
   Незалежний від S4/S5; можна паралелити.

### Sprint 3 (квартал, weeks 5–6)

6. **S3** (P1) — SRI ESLint guard. Окремий effort через `parse5`
   integration; не блокує жодну іншу картку.
7. **S6** (P1) — PBKDF2 ramp-up з migration. Незалежний.

### Backlog (P2, без SLA)

8. **S9** (P2) — Sentry init tags.
9. **S10** (P2) — `pii-handling.md` drift-guard.
10. **S11** (P2) — CSP `<meta>` ↔ vercel.json parity.

### Граф залежностей

```
S2 ──► S8
S4 ──► S5
S2, S3, S6, S7 — незалежні (sibling-tasks)
S9, S10, S11 — незалежні backlog
```

---

## Sensitive items — НЕ публікувати у PR description

> Нижче — конкретики, які корисні для **внутрішнього** трекеру (issue
> tracker, цей файл, security-channel у Telegram), але **не** мають
> зʼявлятися у публічних PR-описах на GitHub до моменту, поки відповідний
> fix не зальотний на main + не пройде 30-day vulnerability-SLA
> ([`docs/security/vulnerability-sla.md`](../security/vulnerability-sla.md)).
> Це не «security through obscurity», це baseline-розумна затримка, щоб
> не давати атакувальнику готовий exploitable map.

- **Конкретні file:line locations невикритих гепів** до моменту їхнього
  закриття. Зокрема:
  - S2: `apps/web/src/core/observability/analytics.ts:56` — наявний
    `console.log("[analytics]", event)` без PII-guard. У PR description
    «fixing analytics PII leak» — ок; вказувати рядок-точку входу до
    landing-у — ні.
  - S4: точна структура wildcard-патернів у
    `apps/server/src/obs/logger.ts:155-169`, що показує, до якого рівня
    глибини nesting **не** редактиться.
  - S6: значення `iterations: 200_000` як floor + structure
    IDB-credential-у з полем `version`. Будь-який offline-attacker з
    IDB dump-ом виграє години compute, якщо знає точну ітераційність.
  - S11: повний directive-set CSP у текстовому вигляді (його легко
    знайти і так, але робити «вже агреговану картку» у PR description —
    непотрібний convenience атакувальникові).
- **Marketing-чутливі formulations:**
  - Не вживати «massive PII leak» / «authorization tokens going to
    Sentry» у заголовках PR-ів і коміт-меседжах. S1 був закритий у
    попередньому PR, але для S2/S4/S6 — тримати нейтральне
    «PII handling parity», «redaction coverage», «PBKDF2 hardening».
    Це уникає ситуації, коли GitHub-search-у видає phrase, з якої
    зрозуміло, що «у нас тут було».
  - Не публікувати в PR description запити в Sentry-search-у виду
    `Authorization:Bearer*` чи `email:*@*.com` — навіть як приклад
    «що тепер не leakається». Для прикладів — анонімізовані шаблони.
  - Не лінкити на цей `pr-plan-security-obs-2026-05.md` із публічного
    blogpost / changelog / external-issue до моменту, поки всі P0/P1
    закриті. План — internal artifact; на нього посилаємось із сусідніх
    audit/planning docs, але не «звідки завгодно».
- **Не дублювати у PR description:** конкретні значення
  `REDACT_KEY_NAMES` / зміни до них. Замість «added `recoveryCode` to
  REDACT_KEY_NAMES» — «expanded redaction allowlist; see
  `@sergeant/shared/lib/pii.ts` for canonical list». Це дає mainтейнерам
  read-the-code-doctrine, замість того щоб служити прес-релізом «отак
  ми redact-имо tokens».
- **CODEOWNERS / Secondary placeholder-и:** доки `TBD (<role>)` стоїть
  замість real handle, не лінкити цей файл у CODEOWNERS-protected
  PR-templates без розуміння, хто бачить його. Це не secret, але
  internal hiring-roadmap.
- **Загальне правило:** якщо опис змін допоможе атакувальникові швидше
  знайти **активний** атак-vector — переноситимо details у internal
  Security-Advisory (GitHub Security Advisories: див.
  [`SECURITY.md`](../../SECURITY.md)) і в PR описі залишаємо тільки
  reference-номер.

---

## Notes for the next iteration

- Якщо протягом sprint-1 з'ясується, що S2 потребує більше rule-cases
  (наприклад, нові PII-ключі з продуктового pipeline), оновити section
  «Acceptance» цього файлу — не плодити окремих документів.
- Якщо `pnpm lint:codeowners` зловить TBD-placeholder після того, як
  delegation зафіксована — `TBD (<role>)` замінити на real handle у
  цьому файлі і в `CODEOWNERS` (Hard Rule про порожні Secondary).
- Окремий S-rang не пропонується для архіву CSP-disable retrospective
  ([`archive/2026-05-04-csp-disable-retrospective.md`](../audits/archive/2026-05-04-csp-disable-retrospective.md)) —
  A1–A5 closed 2026-05-06; план перепокривати закриті пункти не має.
