# Independent Audit — Sergeant — 2026-06-11

> **Last validated:** 2026-06-11 by Fable 5 (independent auditor). **Next review:** 2026-07-11.
> **Status:** Active
> **Методологія:** 53 агенти у 4 фазах — 8 розвідників (recon fan-out по docs + code hotspots), 9 вимірних аудиторів, адверсарна верифікація CRITICAL/HIGH знахідок (виміри 1–6 верифіковані; 7–9 — частково, зрізано лімітом сесії), фінальний синтез. Кожна знахідка має evidence `file:line`. Знахідки з тегом `[VERIFIED]` пройшли незалежну спробу спростування; `[unverified]` — ні.

---

## Executive summary

**Продукт.** Білінгові рейки реально збудовані й добре протестовані — Stripe checkout/portal/webhook з ідемпотентністю, paywall UI, лендинг з EN-локаллю, legal-пакет, GDPR-export. Але продукт **не може взяти першу гривню сьогодні**: публічна сторінка цін рендерить літеральний placeholder «€X», ціна не вирішена (ADR-0051 «$7/міс» досі Accepted, але Phase-7 D3 від 2026-05-22 мовчки скинув її в «TBD»), ФОП не зареєстрований, публічного production URL нема. Теза ініціативи 0010 «лишились тільки founder-блокери» — **неправда**: обіцяний у копірайті 7-денний trial без картки не має жодної імплементації, річний план не підключений, internal-білінг-ендпоінти б'ють у неіснуючу таблицю.

**Технічно.** Якість коду і security engineering вище норми solo-founder (строгий TS, Pino-redaction, App-flow без PAT-ів, чистий secret scan). Але страхувальна сітка фактично вимкнена: **main CI червоний з 2026-06-01 без жодного зеленого прогону** (200 runs), PR-и мерджаться крізь червоні required checks (`enforce_admins=false`), а **весь integration-tier — 4 271 рядків Testcontainers-тестів sync-движка і єдиний guard від auth-bypass — не запускається ніде** (нуль згадок у 34 workflows).

**Операційно.** Docs/governance-меташар став другим продуктом: 593 доки, 158 bespoke-скриптів (42k рядків), ~17–19% комітів — на годування машини. При цьому метасистема бреше сама собі: freshness-штампи міряють churn, реєстр hard rules декларує неіснуючий enforcement (#18), pr-ledger мертвий 25 днів (#26), launch-checklist 0/56. 4 з 8 активних ініціатив — agent-tooling, тоді як P0-revenue стоїть на founder-діях з ~2026-05-24.

**Bottom line:** інженерія сильна, продукт за 1–2 тижні коду від готовності — але запуск гейтиться трьома founder-діями (ціна, ФОП, Apple env), яких ніхто не може зробити за власника, і CI-дисципліною, яку треба повернути до того, як з'являться реальні гроші користувачів.

---

## Audit findings by dimension

### 1. Revenue & product readiness 🔴

**Summary:** Рейки збудовані, але воронка мертва на останньому кроці: жива сторінка цін показує «€X», trial-обіцянка не імплементована, live Stripe неможливий без ФОП. Статус-репортинг ініціативи недостовірний в обидва боки.

**Findings:**

- CRITICAL — Публічна сторінка цін рендерить літеральний placeholder «€X»; два конфліктні «прийняті» рішення співіснують (ADR-0051 Accepted $7/міс vs Phase-7 D3 «ціна out of scope»), pricing-PR без власника й дати. `[VERIFIED]`
  > Evidence: `apps/web/src/core/PricingPage.tsx:54-56,124`; `docs/04-governance/adr/0051-pricing-v3-single-tier.md:3,36` vs `docs/05-design/design/redesign-v2/phase-7-product-decisions-2026-05-22.md:17,88,114`
- CRITICAL — Заголовна теза 0010 «pending: founder-блокери only» — хибна: no-card trial без коду, річний план без wiring, зламані internal-ендпоінти позначені shipped, untested STRIPE_ENABLED-фліп; launch-readiness checklist 0/56 включно з реально зробленими пунктами. `[VERIFIED]`
  > Evidence: `docs/90-work/initiatives/0010-revenue-first-launch.md:5-10,429`; `docs/01-product/launch/business/04-launch-readiness.md` (56×`[ ]`, 0×`[x]`)
- HIGH — «7 днів trial без картки» (Accepted ADR-0051 + shipped UA-копірайт `uk.ts:737`) не має імплементації: 0 hits `trial_period_days|payment_method_collection`, trialing-рядки можливі лише через webhook після checkout з карткою; `uk.ts:776` суперечить сам собі. `[VERIFIED]`
  > Evidence: `apps/web/src/shared/i18n/uk.ts:737` vs `:776`; `apps/server/src/modules/billing/stripe.ts:341-353,547,581`
- HIGH — Усі останні блокери founder-gated і стоять ~2,5 тижні: ФОП (5–10 днів, ₴2 000), Apple Developer ($99/рік) + 4 `APPLE_*` env (таблиця дій готова з 2026-05-24), рішення про ціну. Серверний Apple Sign-In код реально завершений. `[unverified]`
  > Evidence: `docs/90-work/initiatives/0010-revenue-first-launch.md:493-510`; `apps/server/src/auth.ts:94,161-226`
- MEDIUM (HIGH↓) — `POST /api/internal/billing/upgrade|downgrade` оновлюють неіснуючу таблицю `users` (Better Auth — `"user"`, без `plan`/`stripe_customer_id`) — гарантований 500; єдиний тест зелений через повністю замокану pool. Реальний revenue-шлях (m056/m057) не зачеплений. `[VERIFIED, знижено]`
  > Evidence: `apps/server/src/routes/internal/billing.ts:16-22,39-45`; `apps/server/src/migrations/003_baseline_schema.sql:4`
- MEDIUM — Річний план $49/рік з ADR-0051 без жодного wiring (`STRIPE_PRICE_ID_PRO_YEARLY` — 0 hits). `[unverified]`
- MEDIUM — Валютна історія неузгоджена між трьома поверхнями: ADR-0051 ($/₴), копірайт («$7/міс або ₴-еквівалент»), сторінка цін (€). Production-воронка PostHog ніколи не записала жодної реальної точки. `[unverified]`
- LOW (HIGH↓) — `STRIPE_ENABLED` — raw `process.env` поза Zod-схемою (typo мовчки вимикає гейти), але фактично гейтить лише 2 ai-memory роути; AI-квоти працюють безумовно, checkout живе від `STRIPE_SECRET_KEY`. Env-гігієна, не «вимикач усього paywall». `[VERIFIED, знижено]`
  > Evidence: `apps/server/src/modules/billing/requirePlan.ts:24`; `apps/server/src/routes/ai-memory.ts:44,50`

### 2. Architecture & scalability 🟡

**Summary:** Модульний Express-моноліт + модульна SPA на одному Postgres — адекватно для pre-PMF і вище типової solo-якості; syncV2 після декомпозиції — розумний trade-off, не бомба. Реальна проблема — мізалокація складності: CRDT-grade сховища і 122k-рядковий меташар для продукту з нуль користувачів, поки load-bearing діри стоять.

**Findings:**

- HIGH — Коректність sync-движка в CI порожня: 4 271-рядковий Testcontainers-suite (єдине місце, де тестуються LWW-конфлікти, tombstone-resurrection, PN-counters) запускається лише через `pnpm test:integration`, якого нема в жодному з 34 workflows; CI-нний `syncV2.test.ts` повністю мокає pg. Декомпозиція 2026-06-06 уже завозила червоний typecheck у main. `[VERIFIED]`
  > Evidence: `apps/server/vitest.config.ts:8`; `apps/server/package.json:13`; `apps/server/src/modules/sync/syncV2.integration.test.ts`
- HIGH — Dual-writer-порушення у фінансовому застосунку: всі AI-chat дії (create_transaction, budgets, meals…) пишуть тільки в localStorage; AI-написані грошові рядки обходять канонічний sync-pipeline і невидимі для SQLite-стану. Server endpoint (`POST /api/finyk/manual-expenses`) уже існує з 2026-06-06, але клієнт його не викликає. `[VERIFIED]`
  > Evidence: `apps/web/src/core/lib/hubChatActions.ts:79`; `apps/web/src/modules/finyk/storage/useFinykStorageSlots.ts:179`
- HIGH — Hard Rule #18 (600 LOC) для сервера — фікція: `max-lines` існує лише в `eslint.web.js`; сервер-блок **був доданий 2026-06-05 і мовчки видалений 2026-06-08** (f28d8d5ff, «no rules lost») — 3-денна enforcement-регресія, яку жоден gate не впіймав. Нові моноліти: `routes/internal/openclaw.ts` 1 819 рядків. `[VERIFIED]`
  > Evidence: `docs/04-governance/governance/rules/18-module-size-discipline-600.md:14-71` vs `grep max-lines` → лише `eslint.web.js:413,440`; коміти 023fd88f9, f28d8d5ff
- HIGH — Меташар over-engineered для zero-revenue solo: 593 доки (122k рядків), 158 .mjs-скриптів (42 359 рядків), 34 workflows, 5 180-рядковий ESLint-плагін, ~18% комітів на docs; pr-ledger мертвий 25 днів, 9 імпортних скілів без релевантності стеку. `[VERIFIED]`
- MEDIUM — syncV2-вердикт за мандатом: **розумний trade-off** — лінійний 473-рядковий оркестратор, SAVEPOINT-per-op, idempotency, clock-skew rejection, bounded input; але орфан `syncV2Types.ts` (251 рядок, 0 імпортерів) поруч зі справжнім `syncV2-types.ts` — wrong-import-пастка на грошовому hot path. `[unverified]`
- MEDIUM — Три конкурентні клієнтські сховища (localStorage + SQLite-WASM dual-write + sync outbox) до перших користувачів; production-вхід fire-and-forget, errored-count відкидається. `[unverified]`
- MEDIUM — `packages/db-schema` везе production-мертвий другий pg-migration-runner з іншою ledger-таблицею (`__migrations` vs `schema_migrations`) — майбутній розробник створить розбіжний migration ledger. `[unverified]`
- LOW — Onboarding-податок: `apps/web/src/core/` — 346 файлів grab-bag, коментарі закодовані внутрішнім лором (initiative/audit/PR-номери), усі owner-и @Skords-01, secondaries TBD. `[unverified]`

### 3. Code quality & tech debt 🟡

**Summary:** Якість реально вища за норму — `noUncheckedIndexedAccess` на весь monorepo з порожнім allowlist-ом, живі tech-debt доки з CI-freshness-gate, кілька allowlist-ів спалені в нуль. Але governance перебільшує власні зуби, а ~500 відомих lint-порушень сидять у baseline-ах без дедлайнів.

**Findings:**

- HIGH — Rule #18: 6 server-файлів понад 600 effective LOC без жодного механічного enforcement (`openclaw.ts` ~1 379, `tools.ts` ~994, `metrics.ts` ~673, `applySync.ts` ~623 — створений over-limit самим спліт-комітом, `chat.ts` ~612, `stripe.ts` ~609); 3-way sync gate валідує доки проти доків. `[VERIFIED]`
- HIGH — Орфан `syncV2Types.ts`: 0 імпортерів, дублює типи, закомічений на день ПІСЛЯ декомпозиції, видалення заблоковане @scaffolded-механікою у трьох місцях (header + `priority-1-executive.md` + `knip.json:75`); його @addedIn цитує неіснуючий ADR. `[VERIFIED]`
- MEDIUM — 6 react-hooks v7 правил вимкнені глобально з ~152 задокументованими порушеннями «queued for a dedicated cleanup initiative» без тікета й дати. `[unverified]`
  > Evidence: `eslint.baseline.js:144-178`
- MEDIUM — @scaffolded-код без механізму expiry: `StrategyPage.tsx` (332 LOC) свідомо незмонтований з 2026-05-14, `usePrivatbank.ts` (512 LOC) за hardcoded `false` з 2026-04-20; 26 файлів @scaffolded, на відміну від AI-LEGACY — без дедлайнів. `[unverified]`
- MEDIUM — Hard Rule #1 (bigint→number) — конвенція, не механізм: нема глобального pg `setTypeParser`; кожен новий роут поза contract-test поверхнею може мовчки шипнути stringly-typed числа (клас бага #708). `[unverified]`
- MEDIUM — i18n-борг блокує не-UA ринок: allowlist 243 файли, `en.ts` 215 рядків vs `uk.ts` 847 — EN-користувач бачить змішаний UI. `[unverified]`
- LOW — Що працює і має лишитись: Rule #19 реальний (tsconfig-guard, порожній allowlist), tech-debt доки чесні, web max-lines / localStorage / no-strict-bypass allowlist-и спалені в нуль. Відкритий P1: web-coverage 39%/32% проти цілі 50/40. `[unverified]`

### 4. Test coverage & CI 🔴

**Summary:** Тестові активи сильні на папері (глибокі Stripe-webhook тести, 23 sync-unit, 20 Monobank-webhook), але сітка вимкнена: main червоний 10 днів поспіль, мерджі йдуть крізь червоні required checks, найцінніший integration-tier не запускається ніде, а зламаний SQL у змонтованому білінг-роуті — доказ, що саме просочується.

**Findings:**

- CRITICAL — Main CI: **нуль успішних прогонів з 2026-06-01** (77 failure / 123 cancelled з 200); Critical-flow E2E (єдиний браузерний тест auth) падає на `auth.setup.ts` timeout; PR-и #3489/#3491/#3492 змерджені з required checks у failure — `enforce_admins=false` робить усі гейти advisory для solo-адміна. `[VERIFIED]`
  > Evidence: `gh run list ci.yml branch=main`; run 27246037205; `apps/web/tests/smoke/auth.setup.ts:29`
- CRITICAL — Цілий tier найцінніших тестів не виконується ніде: `test:integration` визначений лише в `apps/server/package.json:13`, 0 згадок у workflows/turbo/husky; default vitest їх виключає; suites самоскіпаються без Docker (`passWithNoTests:true` додатково). syncV2 unit-coverage ~0–1% — never-running suite є фактично ЄДИНИМ покриттям sync-движка; session-protection — єдиний guard від H8 login-oracle регресії. `[VERIFIED]`
- HIGH — Змонтований білінг-код квериться в неіснуючу таблицю і шипнувся зеленим (mocked pool); нуль браузерних E2E на revenue-шлях (checkout→webhook→status); production-фліп `STRIPE_ENABLED=true` ніколи не вправлявся. `[VERIFIED]`
- HIGH — Auth тестується формою конфігурації, не поведінкою: `auth.test.ts` асертить options-об'єкти, `auth.contract.test.ts` повністю мокає handler; єдина поведінкова перевірка — той самий червоний E2E. Better Auth bump зі зміною поведінки пройде всі тести. `[VERIFIED]`
- MEDIUM (HIGH↓) — Блокуючий `pnpm audit --audit-level=critical` без exception-path зробив main додатково червоним (shell-quote CVE; фікс — один рядок `pnpm.overrides`, патч існує з ~22 травня); repo має audit-exceptions ledger, але gate його не читає. `[VERIFIED, знижено]`
- MEDIUM — `ci.yml` тригериться на `push:` І `pull_request:` — повний 14-job pipeline двічі на кожен push у PR-гілку (~13 хв кожен). Дворядковий фікс. `[unverified]`
- MEDIUM — Coverage-пороги задубльовані у vitest-конфігах і hardcoded bash-масиві в `ci.yml:419-424` — гарантований майбутній дрейф. `[unverified]`
- MEDIUM — `visual-regression.yml`: header каже «runs on every PR», фактичний тригер — лише `workflow_dispatch`. `[unverified]`
- MEDIUM — Monobank statement backfill (`historyFetch.ts`, `privat.ts`) — єдині файли mono-модуля без тестів; регресія тихо псує фінансові дані. `[unverified]`
- LOW — Postgres-skew між тірами: Testcontainers pg16 vs CI service-container pg17. `[unverified]`

### 5. Security posture 🟡

**Summary:** Security engineering значно вище норми — boot-time hard-fails, AES-256-GCM з ротацією ключів, dual-layer Pino-redaction, timing-safe compares, GitHub App-flow без PAT-ів, чистий secret scan. Діри — процесні, не криптографічні; усі дешеві до фіксу зараз і дорогі після запуску.

**Findings:**

- HIGH — Auth-bypass regression guard (`session-protection.integration.test.ts`, 369 рядків — енумерує всі Express-роути й асертить requireSession) не виконується ніде і мовчки самоскіпається без Docker. Найкритичніший інваріант («жоден неавтентифікований роут не шипається») захищений тестом, який ніхто не запускає. `[VERIFIED]`
- MEDIUM (HIGH↓) — Живий production user ID + фінансова топологія Monobank (кількість рахунків і баланс) у ПУБЛІЧНОМУ репо (visibility перевірена; деталі прибрано з цього звіту — closed PR #3498). Це founder-ів власний догфуд-акаунт, ID не секрет — risk amplifier для майбутнього IDOR, не пряма вразливість. `[VERIFIED, знижено]`
  > Evidence: `AGENTS.md:205`; `docs/02-engineering/architecture/domain-invariants.md:24`
- MEDIUM — `trustedOrigins` безумовно містить `http://localhost:5000/:5173/:8081` у production; cookies SameSite=None+Secure; `/api/auth/*` виключений з CSRF-guard — будь-яка сторінка на victim-овому localhost проходить origin-check. Гейтнути на NODE_ENV, як уже зроблено для `exp://`. `[unverified]`
  > Evidence: `apps/server/src/auth.ts:557-560` vs `:543-546`
- MEDIUM — `STRIPE_ENABLED` fail-open поза Zod-схемою (деталі у вимірі 1). `[unverified]`
- MEDIUM — `SENTRY_DSN` відсутній у prod — лише warning, тоді як METRICS_TOKEN/VAPID hard-fail; зникнення var тихо вимикає головний error-сигнал. `[unverified]`
- LOW — SW-cache партиція падає в `__u=anon` на рестарті SW; cross-user e2e-тест відкладений через відсутність SW-харнесу. `[unverified]`
- LOW — Добра новина: AI tool-call firewall повніший, ніж кажуть власні доки (envelope + tool-name allowlist + строгі схеми на ~20 м'ютаторів); residual — ~25 м'ютаторів лише з envelope-перевіркою. `[unverified]`
- LOW — Hard Rule #20 (no PAT) реально enforced: boot-time відмова при `OPENCLAW_GITHUB_PAT`, App-flow only, без fallback. `[unverified]`

### 6. Observability & incident response 🟡

**Summary:** Інструментація вище норми (Sentry web+server з PII-скрабінгом, Pino + redaction + trace-кореляція, Sentry→n8n→Telegram з ack-lifecycle). Але найгірший failure mode — повний даун API — слабо детектиться, а весь задокументований SLO/Alertmanager-стек декоративний. Yellow лише тому, що продукт pre-launch; стає red у день реального трафіку.

**Findings:**

- HIGH (CRITICAL↓) — Outage-сліпота: ніщо зовнішнє не пробить `/health` (Railway healthcheck лише рестартить), heartbeat WF-99 моніторить сам n8n і шлеться silent, UptimeRobot «to add» з 2026-04 (5 хвилин роботи), n8n живе в тому самому Railway-проєкті, що й API — платформенний інцидент глушить застосунок і алертинг одночасно. Exception-driven crash дійде через Sentry; тихі failure-и і Railway-wide — ні. `[VERIFIED, знижено]`
- HIGH — Весь SLO/burn-rate стек — папір: 24 alert-правила в `docs/.../alert_rules.yml` не вантажить жоден runtime; єдиний Prometheus (ops compose) монтує інший каталог (9 n8n/voyage-правил) і скрейпить laptop-адресу; Alloy — scrape+remote_write без правил; Alertmanager не існує ніде. `[VERIFIED]`
- HIGH — Governance стверджує фантомний enforcement: AGENTS.md і apps/server/AGENTS.md посилаються на «Alertmanager ticket BackendHealthP95High», тоді як `alertmanager.yml` сам себе називає legacy sample, а правило ніколи не вантажиться. `[VERIFIED]`
- MEDIUM (HIGH↓) — `SENTRY_DSN` warn-only (є 17+ не-Sentry n8n-workflow-ів, тож не «єдиний» шлях; Railway env переживає redeploy — ймовірність нижча, ніж заявлено). `[VERIFIED, знижено]`
- MEDIUM — Production-агрегація логів неперевірена: pino-loki — чистий no-op без `GRAFANA_CLOUD_LOKI_*`; власний cleanup-audit 2026-06-08 позначив це відкритим питанням. `[unverified]`
- MEDIUM — 1 301-рядковий metrics-registry, ймовірно, без production-скрейпера (Alloy «config ready, live validation never done») — усі SLI-формули без data series. `[unverified]`
- MEDIUM — Escalation-lifecycle циклічно залежить від API, який моніторить (WF-103 читає `/api/internal/alerts/pending` на тому ж API); початковий Telegram WF-03 переживає (onError:continue), вмирає лише repeat/ack-цикл. `[unverified]`
- LOW — Runbook/error-budget-policy описують стек, якого нема — 3am-responder шукатиме сигнали, які не можуть зайнятись. `[unverified]`
- LOW — Counterweight: для app-level помилок при живому сервері шлях сигналу реальний і вище норми; Hard Rule #21 enforced у коді. `[unverified]`

### 7. Outstanding audit debt 🟡

**Summary:** Борг по суті скорочується — ~192 закриття за хвилю 2026-05-31…06-03, чотири доки в нулі — але burn-down зупинився (3 закриття за останній тиждень), лишається ~124 верифікованих outstanding у 13 Active-доках. Бухгалтерія недостовірна в обидва боки: README завищує finyk у 6 разів, auto-triage report ганяє агентів по уже закритих пунктах.

**Findings (всі `[unverified]` — зрізано session-лімітом; загальну картину я звірив із README власноруч):**

- HIGH — `_runner-report.md` (2026-06-08) лістить ≥4 вже закриті пункти як топ-«A Security» open work — twice-weekly triage-routine палить токени на фікцію.
- HIGH — README-лічильники хибні в обидва боки: finyk фактично 2 outstanding vs «≈13»; fizruk-part2 34 vs «≈43»; consolidated «0 outstanding» при відкритих burn-down-ах (96 non-null warns, lifecycle-міграція deferred).
- HIGH — Обидва колишні Critical несуть deferred-залишки лише у прозі closure-notes без тікета/власника: per-tool Zod на ~50 money-writing м'ютаторів («окремий PR») і cross-user SW-cache regression-тест («harness не існує»).
- HIGH — Scope 04 (Hub Settings/Profile) ніколи не аудитований — child-сесія впала по VM-інфрі 2026-05-13, retry «queued» 4 тижні; оцінка сліпої плями 30–40 H/M знахідок.
- MEDIUM — Швидкість закриттів обвалилась: 84→73→24→11 (05-31…06-03), потім 1–2/день; ~80 page-audit пунктів без execution-власника.
- MEDIUM — P1-E dual-writer carried forward без дедлайну (деталі у вимірі 2).
- MEDIUM — ux-roast-pr-plan (найбільший одиничний трекер, «21 outstanding») місяць stale з phantom-open: PR-1a App-lock без DONE-маркера при повній імплементації в коді.
- LOW — testing-devx P1-4 має подвійний суперечливий статус; hubsettings-аудит відсутній у README-індексі і сам собі суперечить.
- LOW — Stub sync-engine-roast на серпень таргетить «syncV2.ts 3031 LOC», якого вже не існує (473 рядки після ADR-0064).

### Outstanding audit debt snapshot

| Audit doc                                          | Status                  | Outstanding (верифіковано)                              | Blocking?                         |
| -------------------------------------------------- | ----------------------- | ------------------------------------------------------- | --------------------------------- |
| `2026-05-13-page-audit-07-fizruk-part2.md`         | Active                  | 34 (vs README ≈43)                                      | N                                 |
| `2026-05-06-ux-roast-pr-plan.md`                   | Active                  | ≤21 (phantom-open, потребує re-verify)                  | N                                 |
| `2026-05-13-page-audit-03-hub-chat-search.md`      | Active                  | ~12 (вкл. F3-residual: per-tool Zod на money-м'ютатори) | **частково** (data-integrity)     |
| `2026-05-13-page-audit-06-fizruk-part1.md`         | Active                  | 10 (vs README ≈17)                                      | N                                 |
| `2026-05-13-page-audit-08-nutrition.md`            | Active                  | ≈частина (вкл. F15 uom)                                 | N                                 |
| `2026-05-13-page-audit-09-routine-strategy.md`     | Active                  | ≈частина                                                | N                                 |
| `2026-05-13-page-audit-10-errors-pwa-marketing.md` | Active                  | ≈частина (вкл. F2 SW e2e deferred)                      | **частково** (cross-user cache)   |
| `2026-05-13-page-audit-05-finyk.md`                | Active                  | **2** (vs README ≈13)                                   | N                                 |
| `2026-05-13-web-architecture-state-roast.md`       | Active                  | 1 (P1-E dual-writer)                                    | **Y** (фінансова консистентність) |
| `2026-05-13-consolidated-page-audit.md`            | Active                  | burn-downs відкриті (README каже 0)                     | N                                 |
| `2026-06-08-codebase-cleanup-audit.md`             | Active                  | lint-debt + tombstones + інфра                          | N                                 |
| `2026-05-13-testing-devx-roast.md`                 | Active                  | ~6 дрібних                                              | N                                 |
| Scope 04 Hub Settings                              | **ніколи не виконаний** | 30–40 оцінних                                           | N (сліпа пляма)                   |

**Разом:** ~124 верифікованих outstanding. Тренд: різке скорочення до 06-03, відтоді стагнація.

### 8. Documentation & governance health 🟡

**Summary:** Там, де governance дивиться на код, зуби реальні (migration lint, skills-lock, codeowners, design-плагін — усе верифіковано бігає в CI). Але шар, який сертифікує здоров'я самої системи, частково фейковий: freshness міряє churn (53% корпусу проштамповано одним link-rewrite комітом), реєстр правил декларує неіснуючий enforcement, найканонічніший документ — єдиний хибний.

**Findings (всі `[unverified]`):**

- HIGH — Hard Rule #26 мертвий: ledger заморожений на 6 PR з 2026-05-15 (repo на #3492, ~600 незаписаних merge); workflow падає на `Cannot find package 'prettier'` ПІСЛЯ upsert-а, ~25 днів ніхто не реагує; companion-gate структурно не здатен помітити пропуски.
- HIGH — Freshness-система міряє churn: `bump-last-validated.mjs` штампує кожен staged .md; один механічний коміт (6e794981d) проштампував 308–316 доків «validated 2026-06-09» — включно з AGENTS.md, який при цьому містить видалений workspace і три зламані skill-імена.
- HIGH — Реєстр hard rules: `check-hard-rules-registry.mjs` валідує доки↔доки, exit 0 проти хибної заяви Rule #18 — кожен `lint-enforced-convention` лейбл неверифікований проти lint-реальності.
- HIGH — AGENTS.md (канонічний source of truth, auto-loaded у кожну сесію): routing-таблиця 404-ить для 3 з 12 спеціалістів (`sergeant-bugfix`→`sergeant-bugfix-and-regression`, `sergeant-mobile`→`sergeant-mobile-expo`, `sergeant-deploy`→`sergeant-deploy-and-observability`), досі лістить видалений `tools/openclaw`.
- HIGH — Decision-система мовчки впала на найважливішому рішенні: ADR-0051 ($7/міс, Accepted) не amended після D3; PR «ADR status fixes» 2026-06-09 торкнувся ADR-0003/0062, але не 0051.
- MEDIUM — Launch-readiness: 99 unchecked / 0 checked під свіжим штампом — найгірший стан для go/no-go checklist.
- MEDIUM — Метасистема — другий продукт: 593 доки, 42k рядків скриптів, 291/1741 docs-комітів за 30 днів, 72 — чистий regenerate-churn; машинерія мінімум раз зламала main (skills-lock конфлікт, #3472).
- MEDIUM — 10 з 33 скілів — імпортний generic-контент нульової релевантності стеку (temporal-python-testing у TS-репо, CQRS/event-sourcing/saga для Express-моноліта).
- LOW — Реструктуризація docs-дерева 2026-06-08 (за день до аудиту) — без soak-часу; stale-преміси вже в новій структурі.

### 9. Team / agent operating model 🟡

**Summary:** Agent-OS — не vaporware: 1 741 коміт/30 днів, ~120 закритих audit-items за 4 тижні, стабільно висока якість коду — solo-founder без цієї машини так не шипить. Але метарівень став другим продуктом, що сам себе аудитує перевірками, які структурно не можуть впасти, і **система оптимізує те, що агенти можуть робити автономно, без механізму ескалації founder-gated P0** — це структурний failure mode моделі.

**Findings (всі `[unverified]`):**

- HIGH — Зламана routing-таблиця в найбільш завантажуваному документі (деталі у вимірі 8); глибші доки (catalog, start-here) коректні — хибний саме канонічний.
- HIGH — Rule #26/pr-ledger: фікс — або встановити dep у workflow, або видалити правило+ADR+workflow+ledger; поточний стан — hard rule, що бреше.
- HIGH — Freshness маніфактурить хибну впевненість (вимір 8) — сигнал, що зеленіє від механічних правок, гірший за відсутність сигналу.
- MEDIUM — Алокаційний сигнал: 4/8 активних ініціатив — agent-OS інфра «code-complete, live acceptance pending», поки P0-revenue чекає founder-дій; decisions.md (ініціатива 0020) — нуль продуктових рішень, всі agent-OS.
- MEDIUM — Відсутній єдиний координаційний механізм, який parallel-agent репо реально потребує — merge-серіалізація: ≥3 колізії номерів міграцій на main (035, 041, 063 — дві потребували bookkeeping-міграцій), syncV2-спліт двічі завозив червоне в main. GitHub merge queue або timestamp-префікси закривають клас.
- MEDIUM — 10 generic-скілів + sergeant-backend-api-обгортка: забруднюють routing, skills-lock (відоме джерело main-breaking конфліктів), trigger-evals і поверхню Rule #22; в анамнезі вже був malicious imported skill.
- LOW — Що зберегти: hard-rules-з-реальним-enforcement, skills-integrity (SHA-256 lock + security scan — виправдано інцидентом), sergeant-start-here + decisions.md, playbook-бібліотека (64 файли). Фікс — обрізати самореферентний меташар, не ламати модель.

### 10. Top 3 existential risks 🔴

**1. Revenue-вікно закривається, поки машина будує машину.**
Воронка мертва на останньому кроці (€X, без ФОП, без публічного URL), founder-блокери стоять ~2,5 тижні, а інженерний throughput тече в agent-OS (4/8 ініціатив) — власний діагноз проєкту «death by 1000 docs» від 2026-05-04 справджується вдруге. Конкуренти (personalEverything, LifeShift 360, Phaseo) у проді. **Сценарій смерті:** ще 2–3 місяці полірування інфраструктури → нуль revenue-сигналу → мотивація і ресурси вичерпуються до першого платного користувача.

**2. Страхувальна сітка вимкнена саме тоді, коли в системі з'являться чужі гроші.**
Main червоний 10 днів, мерджі крізь червоні required checks, єдині тести коректності sync-движка (LWW/tombstones/PN-counters) і єдиний guard від auth-bypass не запускаються ніде, auth не має жодного поведінкового тесту, AI-chat пише фінансові дані повз канонічний pipeline. **Сценарій смерті:** перший платний користувач + тиха корупція фінансових даних або auth-регресія, яку нічому впіймати → втрата довіри, з якої fintech-продукт не відновлюється.

**3. Governance-система бреше, і їй вірять агенти.**
Freshness-штампи на churn, фіктивний enforcement (#18 — з мовчазною регресією, яку ніхто не помітив), мертвий #26, AGENTS.md що 404-ить для чверті спеціалістів, launch-checklist 0/56, ADR-0051 що суперечить живому коду. Це репо керується агентами, які довіряють цим сигналам — **хибна метаінформація компаундиться з кожною агентською сесією**. **Сценарій смерті:** агенти масштабують помилки швидше, ніж людина встигає їх помічати; вартість обслуговування метасистеми з'їдає решту runway без жодного зовнішнього результату.

---

## Action plan draft

### Bucket A — Цього тижня (revenue-gate або екзистенційне)

| Item                                                                                                                | Owner hint                              | Effort                 | Blocks                            |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------- | --------------------------------- |
| Рішення про ціну + amend ADR-0051 + замінити «€X» на реальну ціну в PricingPage                                     | **founder** (рішення) + web-ui (wiring) | S                      | вся воронка                       |
| Стартувати ФОП-реєстрацію (5–10 днів календарних — кожен день зволікання зсуває live Stripe)                        | **founder**                             | S (дія) / M (календар) | live-платежі                      |
| Полагодити main CI: auth.setup E2E timeout + `pnpm.overrides` shell-quote 1.8.4; далі — мерджити тільки на зеленому | e2e-testing + deploy                    | M                      | довіра до всіх гейтів             |
| Підключити `test:integration` (syncV2 + session-protection) у CI critical-flow job (Postgres там уже є)             | server-api                              | S                      | коректність sync + auth-інваріант |
| Trial: або імплементувати no-card trial, або прибрати обіцянку з копірайту до першого користувача                   | server-api + web-ui                     | S–M                    | чесність оферти                   |
| UptimeRobot на `/health` (5 хв) + `SENTRY_DSN` → hard-fail у prod                                                   | deploy                                  | S                      | outage-сліпота                    |
| Прибрати live user ID + фінансову топологію з публічних доків (AGENTS.md, domain-invariants.md)                     | security-audit                          | S                      | privacy-гігієна                   |

### Bucket B — Цього спринту (high-value, не блокує)

| Item                                                                                                | Owner hint       | Effort | Why now                        |
| --------------------------------------------------------------------------------------------------- | ---------------- | ------ | ------------------------------ |
| Видалити/полагодити internal billing upgrade/downgrade (зламаний SQL) + реальний тест               | server-api       | S      | мертвий код позначений shipped |
| `STRIPE_ENABLED` у Zod-схему + boot-log                                                             | server-api       | S      | fail-open перед запуском       |
| Yearly plan: wiring або офіційний descope в ADR                                                     | server-api       | S      | оферта vs реальність           |
| AGENTS.md: полагодити routing-таблицю, прибрати tools/openclaw, додати lint routing↔filesystem      | tech-debt        | S      | агенти 404-ять щосесії         |
| pr-ledger: встановити prettier у workflow АБО видалити підсистему цілком                            | deploy           | S      | мертве правило 25 днів         |
| Rule #18: повернути server max-lines в eslint.server.js (регресія f28d8d5ff) або переписати правило | tech-debt        | S      | фіктивний enforcement          |
| P1-E: перевести AI-chat money-writes на існуючий server endpoint                                    | web-ui           | M–L    | фінансова консистентність      |
| localhost origins з production trustedOrigins → NODE_ENV-gate                                       | security-audit   | S      | CSRF-поверхня                  |
| CI: прибрати дубльований push+PR тригер                                                             | deploy           | S      | −50% CI-хвилин                 |
| Re-sync README-лічильників аудитів; triage-runner годувати з per-doc truth                          | review-and-merge | M      | агенти тріажать фікцію         |
| Merge-серіалізація: GitHub merge queue або timestamp-міграції                                       | deploy           | S–M    | 3 колізії міграцій уже було    |

### Bucket C — Відкласти / депріоритизувати

| Item                                                                  | Why defer                                 | Revisit trigger                     |
| --------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| Orphan billing schema cleanup (m047, m070/071, m072) — two-phase DROP | не блокує запуск, сам задокументований    | post-launch ADR                     |
| 10 generic-скілів + sergeant-backend-api wrapper — видалити           | дешево, але не блокує                     | перший вільний tech-debt слот       |
| `syncV2Types.ts` орфан + db-schema pg-adapter                         | потребує scaffold-policy рішення          | разом зі скілами                    |
| LiqPay live                                                           | за планом Phase 7, потребує той самий ФОП | перший Stripe-чек                   |
| Visual regression re-enable (Argos)                                   | non-blocking шар                          | після зеленого main                 |
| Docs-генератори: regenerate-churn → on-demand/CI-artifacts            | великий, але не терміновий                | після першого платного користувача  |
| react-hooks/non-null/i18n baseline burn-downs                         | відомі, задокументовані                   | виділена cleanup-ініціатива з датою |
| Scope 04 Hub Settings audit retry                                     | сліпа пляма, але не revenue-gate          | після Bucket A                      |

---

## Workflow delegation spec

```yaml
audit_date: 2026-06-11
executor_note: >
  Each work_stream below is self-contained. An orchestrator can fan these out
  in parallel. Items marked requires_founder: true need a human decision before
  agent work can begin. Routing names use actual .agents/skills/ directories.

work_streams:
  - id: ws-01
    title: Pricing decision + kill the €X placeholder
    priority: P0
    requires_founder: true
    effort: S
    agent_hint: web-ui
    description: >
      Founder picks the price (confirm or supersede ADR-0051 $7/mo). Then wire the
      real price into PricingPage.tsx, amend ADR-0051 or write a superseding ADR,
      reconcile uk.ts/en.ts copy (currency story: one currency, one promise).
    acceptance_criteria:
      - No literal placeholder rendered on /pricing
      - ADR-0051 status reflects the live decision (amended or superseded)
      - uk.ts:737 and :776 no longer contradict each other
    related_files:
      - apps/web/src/core/PricingPage.tsx
      - docs/04-governance/adr/0051-pricing-v3-single-tier.md
      - apps/web/src/shared/i18n/uk.ts

  - id: ws-02
    title: ФОП registration + Stripe live keys + APPLE_* env vars
    priority: P0
    requires_founder: true
    effort: M
    agent_hint: deploy
    description: >
      Pure founder ops: register ФОП (5-10 days), obtain Stripe live keys, create
      Apple Developer account and set 4 APPLE_* vars in Railway per the table in
      initiative 0010:493-510. Agent work afterwards: verify boot, run smoke checkout
      in test mode, document the STRIPE_ENABLED flip procedure.
    acceptance_criteria:
      - Apple Sign-In button works on production /sign-in
      - Stripe live-mode checkout session creatable from production
    related_files:
      - docs/90-work/initiatives/0010-revenue-first-launch.md

  - id: ws-03
    title: Green main CI and keep it green
    priority: P0
    requires_founder: false
    effort: M
    agent_hint: e2e-testing
    description: >
      Diagnose and fix auth.setup.ts:29 locator timeout (the @critical E2E gate),
      add pnpm.overrides shell-quote>=1.8.4 for the audit gate, re-run main CI to
      green. Then enable enforce_admins (or adopt the discipline) so merges through
      red stop.
    acceptance_criteria:
      - ci.yml on main fully green on two consecutive runs
      - Critical-flow E2E passes
      - pnpm audit --audit-level=critical exits 0
    related_files:
      - apps/web/tests/smoke/auth.setup.ts
      - package.json
      - .github/workflows/ci.yml

  - id: ws-04
    title: Wire the integration test tier into CI
    priority: P0
    requires_founder: false
    effort: S
    agent_hint: server-api
    description: >
      Add pnpm test:integration to the CI job that already provisions Postgres
      (critical-flow). Make Docker-absence a hard failure in CI (no silent ctx.skip,
      no passWithNoTests). Covers syncV2.integration.test.ts (sync correctness) and
      session-protection.integration.test.ts (auth-bypass guard).
    acceptance_criteria:
      - test:integration runs in CI on every PR and fails the build on test failure
      - A deliberately broken sync apply function turns CI red (spot-check)
    related_files:
      - .github/workflows/ci.yml
      - apps/server/vitest.integration.config.ts
      - apps/server/src/modules/sync/syncV2.integration.test.ts

  - id: ws-05
    title: Trial promise — implement or retract
    priority: P0
    requires_founder: true
    effort: M
    agent_hint: server-api
    description: >
      Founder decides: ship a real 7-day no-card trial (subscription_data.trial_period_days
      + payment_method_collection='if_required' in checkout, or trialing row at signup),
      or remove the promise from ADR-0051 and all shipped copy before first users.
    acceptance_criteria:
      - Either a new user can reach trialing state without a card, or no surface promises it
    related_files:
      - apps/server/src/modules/billing/stripe.ts
      - apps/web/src/shared/i18n/uk.ts

  - id: ws-06
    title: Minimum viable outage detection
    priority: P0
    requires_founder: true
    effort: S
    agent_hint: deploy
    description: >
      Founder creates a free UptimeRobot (or similar) probe on production /health with
      Telegram/email alert. Agent: promote SENTRY_DSN to hard-fail in production env
      validation (mirror METRICS_TOKEN pattern at env.ts:1276-1284).
    acceptance_criteria:
      - External monitor alerts within 5 minutes of API downtime
      - Production boot fails loudly if SENTRY_DSN is unset
    related_files:
      - apps/server/src/env/env.ts

  - id: ws-07
    title: Scrub live user PII from the public repo
    priority: P0
    requires_founder: false
    effort: S
    agent_hint: security-audit
    description: >
      Remove the live Better Auth user ID and Monobank financial topology from
      AGENTS.md §Deployment & test users and domain-invariants.md. Replace with a
      pointer to a private location (Railway vars / local secrets note).
    acceptance_criteria:
      - grep of the user ID across the repo returns zero hits
    related_files:
      - AGENTS.md
      - docs/02-engineering/architecture/domain-invariants.md

  - id: ws-08
    title: Fix or delete broken internal billing endpoints
    priority: P1
    requires_founder: false
    effort: S
    agent_hint: server-api
    description: >
      /api/internal/billing/upgrade|downgrade UPDATE a non-existent users table.
      Either rewrite against the canonical subscriptions table (m056) with a real
      integration test, or delete the routes. Also move STRIPE_ENABLED into the Zod
      env schema with strict enum + boot log.
    acceptance_criteria:
      - No mounted route references a non-existent table (verified by integration test)
      - STRIPE_ENABLED validated at boot
    related_files:
      - apps/server/src/routes/internal/billing.ts
      - apps/server/src/modules/billing/requirePlan.ts
      - apps/server/src/env/env.ts

  - id: ws-09
    title: Repair the governance signal layer
    priority: P1
    requires_founder: false
    effort: M
    agent_hint: tech-debt
    description: >
      Three fixes: (1) AGENTS.md routing table → real skill dir names + drop
      tools/openclaw + add a lint that resolves routing names against .agents/skills/;
      (2) pr-ledger — install prettier in the workflow or delete rule #26 + ADR +
      workflow + ledger; (3) restore server max-lines in eslint.server.js (regressed
      in f28d8d5ff) or rewrite rule #18 to match reality.
    acceptance_criteria:
      - Every name in the AGENTS.md routing table resolves to an existing SKILL.md
      - pr-backlinks workflow green OR fully removed
      - pnpm lint fails on a new 700-line apps/server file (or rule #18 re-scoped)
    related_files:
      - AGENTS.md
      - .github/workflows/pr-backlinks.yml
      - eslint.server.js
      - docs/04-governance/governance/rules/18-module-size-discipline-600.md

  - id: ws-10
    title: Close the dual-writer hole (P1-E)
    priority: P1
    requires_founder: false
    effort: L
    agent_hint: web-ui
    description: >
      Migrate AI-chat money writes (finyk manual expenses first) from localStorage-only
      to the existing POST /api/finyk/manual-expenses endpoint, so AI-written rows enter
      the canonical sync pipeline and survive the SQLite overlay.
    acceptance_criteria:
      - create_transaction via chat produces a server-persisted row visible after reload
      - Contract tests updated away from localStorage assertions
    related_files:
      - apps/web/src/core/lib/chatActions/finykActions.ts
      - apps/server/src/routes/finyk.ts

  - id: ws-11
    title: CI hygiene — dedupe triggers, thresholds single-source, localhost origins
    priority: P1
    requires_founder: false
    effort: S
    agent_hint: deploy
    description: >
      (1) ci.yml: pull_request + push:branches:[main] only; (2) read coverage floors
      from vitest configs instead of the hardcoded bash array; (3) NODE_ENV-gate the
      localhost entries in Better Auth trustedOrigins.
    acceptance_criteria:
      - One pipeline run per PR push
      - Production trustedOrigins contains no localhost origins
    related_files:
      - .github/workflows/ci.yml
      - apps/server/src/auth.ts

  - id: ws-12
    title: Audit bookkeeping re-sync
    priority: P2
    requires_founder: false
    effort: M
    agent_hint: review-and-merge
    description: >
      Recount README audit index from per-doc closure notes (finyk 2 not ≈13),
      regenerate _runner-report from the corrected source, mark phantom-open items
      (ux-roast PR-1a) DONE, schedule the missing Scope-04 audit.
    acceptance_criteria:
      - README counters match per-doc reality (spot-check 3 docs)
      - _runner-report contains no items with existing closure notes
    related_files:
      - docs/90-work/audits/README.md
      - docs/90-work/audits/_runner-report.md
```

---

## What the founder should do first

Завтра зранку — **подати документи на ФОП**. Це єдиний блокер з календарним лагом (5–10 днів), який не може зробити жоден агент, і без якого весь білінг-код — декорація. Поки реєстрація йде, того ж дня — **вирішити ціну** (одне число; ADR-0051 уже каже $7/міс — підтвердь або зміни) і віддати агенту ws-01, щоб «€X» зник із публічної сторінки до вечора. Третя дія тижня — **заборонити собі мерджити крізь червоний main** і віддати ws-03/ws-04: CI має знову щось означати до того, як у системі з'являться чужі гроші. Все інше — включно з усім agent-OS треком — почекає; не відкривай жодної нової ініціативи, поки перший Stripe-webhook не запишеться у prod.
