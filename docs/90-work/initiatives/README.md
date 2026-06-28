# Engineering Initiatives

> **Last validated:** 2026-05-13 by Devin (batch archival 2026-05-13 — 7 initiatives [0001, 0004, 0005, 0007, 0008, 0009, 0012] перенесено у `archive/`; 90-day waiting period skipped за рішенням founder-а). **Next review:** 2026-08-11.
> **Status:** Active

Цей розділ — **операційний плейлист** для інженерної команди. Кожен файл — одна окрема ініціатива, яка описує проблему, обсяг змін, план виконання та критерії готовності.

## Чим це не є

- **Це не аудит.** Аудити лежать у [`docs/90-work/audits/`](../audits) і фіксують стан у конкретний момент. Ініціативи — це **плани змін**, які виходять з аудитів.
- **Це не ADR.** ADR ([`docs/04-governance/adr/`](../../04-governance/adr)) фіксують **рішення** post-factum. Ініціатива — це **робота, яку треба зробити**, і вона може породити ADR як побічний продукт.
- **Це не tech-debt registry.** [`docs/90-work/tech-debt/`](../tech-debt) — реєстр боргу. Ініціатива має **дату завершення** і **метрики успіху**; борг там осідає, поки ініціатива його не закриє.

## Як читати

Кожен файл має префікс `NNNN-` за порядком створення (як у ADR), стабільний slug і таку саму структуру. Винятково для **multi-PR program-of-work серій** з власною внутрішньою нумерацією PR-ів (як `stack-pulse-2026-05/`) — допускається директорія з іменем `<slug>-YYYY-MM/`, де всередині лежать `00-overview.md`, `pr-NN-*.md`, sesssion-log-и тощо.

### Completed-prefix (`_NNNN-…`)

Коли ініціатива переходить у `Done` або `Closed`, файл **перейменовується** з `NNNN-slug.md` у `_NNNN-slug.md` — `_` сортується після цифр у `ls`, тому активні ініціативи лежать згори, завершені — знизу, і `archive/` нижче. Slug (`NNNN-slug`) лишається стабільним як ідентифікатор ініціативи у TODO-маркерах (наприклад, `TODO(0001-module-decomposition): …`), у `docs/04-governance/governance/hard-rules.json` ref-ах і в історії — змінюється тільки фізичне ім'я файлу. CI-гейт `lint:initiative-status-sync` приймає обидві форми (`NNNN-…` і `_NNNN-…`); `pnpm docs:gen-initiative-followups` теж розуміє обидві.

```text
docs/90-work/initiatives/
├── 0003-sync-v2-…md                          # In progress
├── 0006-frontend-routing-…md                 # In progress
├── 0010-revenue-first-launch.md              # In progress
├── README.md
├── archive/
│   ├── _0001-module-decomposition.md         # Done    (archived 2026-05-13)
│   ├── _0002-mobile-platform-decision.md     # Closed  (archived 2026-06-01)
│   ├── _0004-server-observability.md         # Done    (archived 2026-05-13)
│   ├── _0005-ai-cost-and-prompt-cache.md     # Done    (archived 2026-05-13)
│   ├── _0007-design-system-tooling.md        # Done    (archived 2026-05-13)
│   ├── _0008-platform-hardening.md           # Closed  (archived 2026-05-13)
│   ├── _0009-agent-os-hardening.md           # Closed  (archived 2026-05-13)
│   ├── _0011-foundation-adoption-…md         # Done    (archived 2026-06-01)
│   ├── _0012-perfect-strictness-rollout.md   # Closed  (archived 2026-05-13)
│   ├── _0013-module-decomposition-round-2.md # Done    (archived 2026-06-01)
│   ├── _0014-knowledge-graph-and-catalogs.md # Done    (archived 2026-06-01)
│   ├── _0016-changelog-release-cut.md        # Done    (archived 2026-06-01)
│   ├── 2026-08-02-batch-archival-plan.md     # Closed
│   └── README.md
├── follow-ups.md
└── stack-pulse-2026-05/
```

Коли через ≥90 днів `Closed` файл переходить у `archive/`, префікс **залишається** — `archive/_NNNN-slug.md`.

> **Що рухається разом із файлом при перейменуванні.** `git mv NNNN-… _NNNN-…` + одночасно у тому ж PR-і — оновити всі лінки на `.md` файл (markdown-посилання, comment-refs у коді / yml). Перевірка: `pnpm docs:check-links` + `pnpm lint:initiative-status-sync`. Slug-only mentions (без `.md` — TODO-маркери, governance refs) **не чіпаємо**.

> **Регулярні артефакти регенеруються самі.** `docs/90-work/initiatives/follow-ups.md` (через `pnpm docs:gen-initiative-followups`) та `docs/04-governance/governance/hard-rules-matrix.md` (через `pnpm hard-rules:generate`) підхоплять нові шляхи.

| Секція            | Призначення                                          |
| ----------------- | ---------------------------------------------------- |
| **TL;DR**         | 3–4 речення. Що робимо і чому зараз.                 |
| **Чому зараз**    | Контекст, тригер, ризик зволікання.                  |
| **Скоуп**         | In / Out — щоб не розпливалось.                      |
| **План змін**     | Розбито на фази / PR-и з конкретними файлами.        |
| **Критерії DONE** | Метрики, гарди в CI, видимі ефекти.                  |
| **Ризики**        | Що може піти не так і як митиґуємо.                  |
| **Власник / ETA** | Хто веде та орієнтовний дедлайн.                     |
| **Посилання**     | Аудит-сорс, ADR, tech-debt, релевантні PR-и, issues. |

## Зведений календар follow-up-ів

Усі відкриті carry-over пункти зі всіх ініціатив зведено в один генерований файл — [`follow-ups.md`](./follow-ups.md). Source of truth = блок `### Carry-over → successor` у кожній ініціативі; індекс перебудовується скриптом `scripts/docs/generate-initiative-followups.mjs` і перевіряється в CI (`Initiative follow-ups (in sync)`).

### Carry-over format

У секції `### Carry-over → successor` пишемо top-level bullets з одним з 4 префіксів — парсер скрипта класифікує їх за патерном:

```markdown
### Carry-over → successor

- [ ] **2026-05-12:** description … # one-shot, due-date (ISO)
- [ ] **Recurring (weekly):** description … # recurring check
- [ ] **Після baseline-week:** description … # trigger-based (вільна фраза)
- [ ] description … # TBD (catch-all)
```

| Префікс                    | Куди потрапляє у `follow-ups.md`     | Приклад cadence-у                                        |
| -------------------------- | ------------------------------------ | -------------------------------------------------------- |
| `**YYYY-MM-DD[ (...)]:**`  | One-shot → колонка `Due` з ISO-датою | `**2026-05-12 (≈ +тиждень):**`                           |
| `**Recurring (cadence):**` | Recurring → колонка `Cadence`        | `**Recurring (weekly):**`, `**Recurring (monthly):**`    |
| `**Будь-яка фраза:**`      | One-shot → курсивом у колонці `Due`  | `**Після baseline-week:**`, `**When SLO breach:**`       |
| Без bold-префіксу          | One-shot → `—` у колонці `Due`       | `Per-route hit-rate breakdown — додати endpoint label …` |

Тільки `- [ ]` (unchecked) пункти потрапляють в індекс — `- [x]` (зроблено) лишається в файлі ініціативи як історія, але з агрегованого календаря випадає.

Nested-bullets (відступ + `-`) **зливаються** у parent-описі — використовуйте їх для деталей кроків rollback / fixture-чеків, без шуму в індексі.

Після правки carry-over: `pnpm docs:gen-initiative-followups` → закомітити оновлений `follow-ups.md` у тому самому PR-і. CI fail-ить, якщо checked-in `follow-ups.md` розходиться з тим, що згенерує скрипт.

## Активні ініціативи

> **Status reconciliation 2026-05-18:** canonical detail lives in each initiative header. 0002 is **Closed** and superseded by ADR-0052 + 0010 revenue-first launch; 0009 is **Closed** as of 2026-05-09 (PR 3.2 finalised AGENTS.md slim + 3-way `lint:hard-rules-registry` sync); 0011 has Phase 1 complete, partial Phase 2 adoption merged, and Phases 3–4 deferred until after 0010 launch.

| #    | Назва                                                                                                | Пріоритет | Власник      | ETA                                    | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------- | --------- | ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0003 | [Sync v2 rollout & v1 sunset](./0003-sync-v2-rollout-and-v1-sunset.md)                               | P0        | `@Skords-01` | Sprint 1–2                             | In progress (2026-05-04) — Phase 1 [#1621](https://github.com/Skords-01/Sergeant/pull/1621) (`sync_v1_legacy_clients_total` survey counter + 3 Grafana panels + 3 recording rules) + Phase 2 (RFC 8594 `Sunset:`/`Deprecation:` + RFC 8288 `Link:` middleware на v1 routes + [ADR-0043](../../04-governance/adr/0043-cloudsync-v1-sunset.md)). Phase 3-6 (feature-flag + backfill + T₀ → 410 Gone + cleanup) — pending, gated на baseline-week measurement.                                                                                                                                                                                                                                                                                                    |
| 0006 | [Frontend routing & code-split](./0006-frontend-routing-and-code-split.md)                           | P1        | `@Skords-01` | Sprint 2 (2 wk)                        | **In progress** — Phases 1+2+3+4+5 done: `<RouterProvider/>` swap, all 4 modules path-based (`useHashRouter` removed), HashRedirect shim + e2e, ScrollRestoration, route-loader prefetch via `useModuleRouteLoader` (Phase 5 closed 2026-05-23). **Pending:** `manualChunks` cleanup + per-route bundle-gate tuning; native RR7 router-level loader entries still blocked by the catch-all `path:"*"` (needs RootLayout/`<Outlet/>`). Canonical detail у doc header.                                                                                                                                                                                                                                                                                           |
| 0010 | [Revenue-first launch (Stripe MVP + Apple/Google auth + Mono-wedge)](./0010-revenue-first-launch.md) | P0        | `@Skords-01` | Sprint 1–4 (4 wk)                      | **In progress** — Phases 0+1+2+3+4.x+5.x+6 done: billing core + `subscriptions` migrations, pricing v3 ([ADR-0051](../../04-governance/adr/0051-pricing-v3-single-tier.md)), Google+Email+**Apple** sign-in (provider у `auth.ts`), activation*v2, sitemap/robots, LandingPage. **Phase 6.2 EN-locale wiring done** (LandingPage на `useLocale` + `landing` group). **Pending — founder-блокери only:** APPLE*\* env vars у Railway + ФОП-реєстрація для live Stripe + rollout/decision metrics. **Public metrics — deferred.** Canonical detail у doc header.                                                                                                                                                                                                 |
| 0015 | [Docs automation for daily ops](./0015-docs-automation-daily-ops.md)                                 | P2        | `@Skords-01` | 2026-05-31                             | In progress — **Phase 1 + Phase 2 code-complete.** Phase 1: daily brief (`today.md`), WIP overload guard, trust badge. Phase 2 (Bundle Beta): skill+playbook columns у `open-work.md` + `agent-ready` field на всіх ініціативах + `lint:initiative-agent-ready` gate. Remaining = Phase 1 **observational acceptance only** (cron 7-day stability + 1-week maintainer usage self-report). Не 90-day-gated; archival deferred до закриття observation-вікна.                                                                                                                                                                                                                                                                                                    |
| 0017 | [Hub Settings & Reports mount perf](./0017-hub-tabs-mount-perf.md)                                   | P1        | `@Skords-01` | Sprint 3 (conditional) + Finalize      | Closed (2026-06-08) — **Sprint 0 + Sprint 1 + Sprint 2 shipped**. Sprint 0 RUM instrumentation live; Sprint 1 per-section lazy + Suspense for 4 heavy module sections + `useInView` gate on Finyk Monobank query ([#3102](https://github.com/Skords-01/Sergeant/pull/3102)); **Sprint 2 HubReports per-card lazy merged 2026-05-24 via [#3094](https://github.com/Skords-01/Sergeant/pull/3094) (`5c98b41e`).** Remaining: **Sprint 3** (Web Worker for aggregate) — conditional on post-merge PostHog `aggregateReport` P95 > 50 ms; **Finalize** PR — bundle gate update + `docs/90-work/tech-debt/frontend.md` watchlist drain + Outcome. Target: Settings P50 10 s → ≤ 1 s. Source: [`docs/90-work/tech-debt/frontend.md` §2.5](../tech-debt/frontend.md). |
| 0021 | [React-hooks v7 ESLint cleanup](./0021-react-hooks-v7-cleanup.md)                                    | P3        | `@Skords-01` | Sprint 9 (2026-07-07) → 2026-09-09     | In progress (2026-06-10) — Phase 0 частковий: 5 inline `eslint-disable` виправлено (FinykApp.tsx mount-only effects + split SyncIndicator; useWorkoutsLifecycle.ts stable-deps). Лишається: ~152 `react-hooks/*` baseline-suppressions у [`eslint.baseline.js:146-178`](../../../eslint.baseline.js) (set-state-in-effect 78, refs 37, purity 17) — категоризація + поетапний burn-down (ціль −50%), щоб підняти severity до `error`. Старт решти — не раніше Sprint 9; ціль закриття 2026-09-09. Source: [`docs/90-work/audits/2026-06-11-fable5-independent-audit.md`](../audits/2026-06-11-fable5-independent-audit.md) (вимір 3).                                                                                                                          |
| 0022 | [Import from external trackers (CSV-onboarding)](./0022-import-from-external-trackers.md)            | P2        | `@SkOrDs-02` | Phase 1 ≈ 1 sprint; full ≈ 3–4 sprints | Proposed (2026-06-28) — план CSV-імпорту з зовнішніх трекерів як activation-важіль. Один upload-конвеєр (multipart + ZIP unwrap + delimiter/encoding detect + ідемпотентний UPSERT через наявні `applySync`) + тонкі per-source адаптери. Фаза 1: Strong+Hevy → `fizruk_*`; Фаза 2: Cronometer+MFP → `nutrition_meals`; Фаза 3: універсальний column-mapper для фінансів. Чекає founder-greenlight по скоупу Фази 1 + рішення по dedup/валютній нормалізації. Source: founder-запит 2026-06-28 + export-research.                                                                                                                                                                                                                                              |
| —    | [`stack-pulse-2026-05/`](./stack-pulse-2026-05/README.md) (multi-PR series)                          | P2        | `@Skords-01` | Sprint 2–4 (3 wk, 16 PR-ів)            | Proposed (2026-05-03) — серія з 16 послідовних PR-планів зі зрізу стеку 2026-05 (env-unify → rate-limit fail-closed → bcrypt cap → bus-factor → TS types → openclaw-app → body-size → API-versioning → APNS → better-auth → drizzle drift → sentry sampler → pg pool → vercel COEP → AI-quota → pino redaction). Поточно: `00-overview.md` + `01-session-log-2026-05-03.md` як живий лог; `pr-01..pr-16-*.md` — план кожного PR. Директорія-форма (іменована, не нумерована) — exception для multi-PR серій. Source: [`docs/90-work/initiatives/stack-pulse-2026-05/00-overview.md`](./stack-pulse-2026-05/00-overview.md).                                                                                                                                    |

## Нещодавно завершені

`Done` / `Closed` ініціативи лишаються тут, поки актуальні для carry-over пошуку та рев'ю. Через ≥90 днів після переходу у `Closed` (за відсутності регресій / нових follow-up-ів) переходять у [`archive/`](./archive) (див. § Гайдлайн → закриття та архівація).

_Наразі порожньо — усі завершені ініціативи перенесені до [архіву](#архів) (Batch 2026-06-01)._

## Архів

Не активні джерела рішень. Файли перенесено у [`archive/`](./archive) ≥90 днів після переходу у `Closed` (за відсутності регресій / нових follow-up-ів). Канонічні правила, що з ініціатив виросли, продовжують жити у `AGENTS.md` Hard Rules / `docs/04-governance/governance/` / `docs/90-work/tech-debt/`.

**Batch 2026-05-13** (виконано — `90 days` waiting period не застосовано за рішенням founder-а, [`archive/2026-08-02-batch-archival-plan.md`](./archive/2026-08-02-batch-archival-plan.md)):

- [archive/\_0001-module-decomposition.md](./archive/_0001-module-decomposition.md) — archived 2026-05-13; canonical home: Hard Rule #18 (`max-lines: 600`) + successor [`./archive/_0013-module-decomposition-round-2.md`](./archive/_0013-module-decomposition-round-2.md) (carry-over allowlist drain).
- [archive/\_0004-server-observability.md](./archive/_0004-server-observability.md) — archived 2026-05-13; canonical home: [`../adr/0035-distributed-tracing-opentelemetry.md`](../../04-governance/adr/0035-distributed-tracing-opentelemetry.md) (OTLP/HTTP, `RouteAwareSampler`).
- [archive/\_0005-ai-cost-and-prompt-cache.md](./archive/_0005-ai-cost-and-prompt-cache.md) — archived 2026-05-13; canonical home: [`../adr/0039-anthropic-prompt-cache-policy.md`](../../04-governance/adr/0039-anthropic-prompt-cache-policy.md).
- [archive/\_0007-design-system-tooling.md](./archive/_0007-design-system-tooling.md) — archived 2026-05-13; canonical home: [`../adr/0046-storybook-vrt-scope.md`](../../04-governance/adr/0046-storybook-vrt-scope.md) + Storybook live deploy `https://skords-01.github.io/Sergeant/`.
- [archive/\_0008-platform-hardening.md](./archive/_0008-platform-hardening.md) — archived 2026-05-13; canonical home: `RATE_LIMIT_POLICIES` registry (`apps/server/src/config/rateLimit.ts`) + [`../adr/0044-renovate-vs-dependabot.md`](../../04-governance/adr/0044-renovate-vs-dependabot.md).
- [archive/\_0009-agent-os-hardening.md](./archive/_0009-agent-os-hardening.md) — archived 2026-05-13; canonical home: Hard Rules #15 + AGENTS.md slim (907 → 137 LOC) + `docs/04-governance/governance/rules/`.
- [archive/\_0012-perfect-strictness-rollout.md](./archive/_0012-perfect-strictness-rollout.md) — archived 2026-05-13; canonical home: Hard Rule #19 (`noUncheckedIndexedAccess: true` + `tools/tsconfig-guard/allowlist.json`).

**Batch 2026-06-01** (виконано — `90 days` waiting period не застосовано за рішенням founder-а; усі п'ять — `Done`/`Closed`, без активних regресій / follow-up-ів):

- [archive/\_0002-mobile-platform-decision.md](./archive/_0002-mobile-platform-decision.md) — archived 2026-06-01 (Closed); canonical home: [`../adr/0052-mobile-strategy-capacitor-primary.md`](../../04-governance/adr/0052-mobile-strategy-capacitor-primary.md) + [`./0010-revenue-first-launch.md`](./0010-revenue-first-launch.md).
- [archive/\_0011-foundation-adoption-and-process-discipline.md](./archive/_0011-foundation-adoption-and-process-discipline.md) — archived 2026-06-01 (Done); canonical home: Hard Rule #15 (`validate-pr-body.mjs`) + [`../launch/email-verification-sweep.md`](../../01-product/launch/email-verification-sweep.md).
- [archive/\_0013-module-decomposition-round-2.md](./archive/_0013-module-decomposition-round-2.md) — archived 2026-06-01 (Done); canonical home: Hard Rule #18 (`max-lines: 600`) + [`../tech-debt/frontend.md`](../tech-debt/frontend.md).
- [archive/\_0014-knowledge-graph-and-catalogs.md](./archive/_0014-knowledge-graph-and-catalogs.md) — archived 2026-06-01 (Done); canonical home: [`../adr/0058-knowledge-graph-schema.md`](../../04-governance/adr/0058-knowledge-graph-schema.md) + `docs/02-engineering/architecture/` generated catalogs.
- [archive/\_0016-changelog-release-cut.md](./archive/_0016-changelog-release-cut.md) — archived 2026-06-01 (Done); canonical home: `changelog:cut` script + [`../../CHANGELOG.md`](../../../CHANGELOG.md).

**Batch 2026-06-15:**

- [archive/\_0020-agent-decisions-log.md](./archive/_0020-agent-decisions-log.md) — archived 2026-06-15; canonical home: docs/00-start/agents/decisions.md (curated decisions ledger) promoted via sergeant-start-here.

## Статуси

- **Proposed** — драфт готовий, ще не почато.
- **In progress** — є PR-и в роботі, статус видно у мердж-чек-листі ініціативи.
- **Done** — всі PR-и змерджено, `Критерії DONE` виконано, **Outcome** секція написана. Активна частина роботи завершена; carry-over (якщо є) зафіксовано у `### Carry-over → successor` блоці й автоматично попадає у [`follow-ups.md`](./follow-ups.md).
- **Closed** — `Done` + carry-over (якщо є) **передано далі** (tech-debt registry / successor initiative / `Що НЕ увійшло` секція з посиланнями). Команда явно сигналізує: «нічого більше у цьому файлі не планується». Стан "ready для архівації після ≥90 днів".
- **Archived** — файл фізично перенесено у [`docs/90-work/initiatives/archive/`](./archive), а в README рядок замінено 1-рядковим redirect-stub-ом (`archived YYYY-MM-DD; superseded by …`). Канонічні правила, що ініціатива породила, продовжують жити у `AGENTS.md` Hard Rules / `docs/04-governance/governance/`.
- **Withdrawn** — ініціативу відкликано (проблема зникла / змінилися пріоритети). Поясніть у файлі.

### Lifecycle progression

```
Proposed → In progress → Done → Closed → Archived
            (NNNN-…)    └ rename → _NNNN-…  ──┘ (≥90 днів верифікації, потім git mv → archive/_NNNN-…)
Withdrawn — termination без проходження `Done` (e.g., передумови зникли).
           Файл лишається у активному списку зі статусом `Withdrawn`; префікс не додаємо.
```

CI-гейт `lint:initiative-status-sync` (`scripts/check-initiative-status-sync.mjs`) форсить, що статус у README-таблицях збігається з `> **Status:** ...` хедером файлу — drift на кшталт «у файлі `Done`, у README `In progress`» падає одразу в PR.

## Гайдлайн для авторів

1. Перш ніж відкрити нову ініціативу — перевірте, чи це не вписується в існуючу. Краще оновити, ніж множити.
2. Один PR — одна фаза. Не змішуйте «впровадити lint-правило» і «декомпонувати 7 файлів» в одному PR.
3. Якщо ініціатива потребує архітектурного рішення — створіть ADR в тому ж sprint-і. Слід — посилання сюди.
4. **Закриваючи ініціативу** (`In progress` → `Done`):
   - Перевести Status у файлі (`> **Status:** Done (...)`) і у рядку README. CI `lint:initiative-status-sync` падає, якщо забули.
   - Дописати **Outcome** в кінці файлу: що вийшло, що ні, посилання на змерджені PR-и.
   - Якщо є carry-over пункти — додати `### Carry-over → successor` блок у файлі (формат — у § Carry-over format вище). Запустити `pnpm docs:gen-initiative-followups`, закомітити оновлений `follow-ups.md` у тому самому PR-і.
   - **Перейменувати файл:** `git mv docs/90-work/initiatives/NNNN-slug.md docs/90-work/initiatives/_NNNN-slug.md` (див. § Completed-prefix). У тому ж PR-і оновити всі `.md`-лінки на цей файл (markdown-посилання, comment-refs у `apps/**`, yml-workflows, ADR-cross-refs). Slug-only mentions без `.md` (TODO-маркери, `hard-rules.json` refs) — НЕ чіпаємо.
   - Перенести рядок з активної таблиці у `## Нещодавно завершені`. Шлях у `[name](./_NNNN-slug.md)` лінку — з префіксом.
   - Sanity check перед PR-ом: `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` + `pnpm docs:check-initiative-followups`.
5. **Перехід `Done` → `Closed`** — коли вся carry-over робота передана до tech-debt / successor / `Що НЕ увійшло` (явний сигнал «нічого більше не планується»). Status у файлі та README — `Closed`. Пишемо у тому самому рядку — `Завершено`-дату не змінюємо. Файл лишається `_NNNN-slug.md` (префікс не змінюється; додався вже на кроці 4).
6. **Архівація** (`Closed` → `Archived`, через ≥90 днів від `Closed`-дати, за відсутності регресій):
   - Перенести файл у `docs/90-work/initiatives/archive/_NNNN-slug.md` — `_`-префікс лишається.
   - Замінити рядок у `## Нещодавно завершені` 1-рядковим redirect-stub-ом у `## Архів`: `[archive/_NNNN-slug.md] — archived YYYY-MM-DD; superseded by …` або `… (canonical rules → AGENTS.md / docs/04-governance/governance/)`.
   - Канонічні правила, що з ініціативи виросли, лишаються у `AGENTS.md` Hard Rules / `docs/04-governance/governance/`.

## Зведена матриця hardening-карток

Швидкий огляд усіх hardening-карток (stack-pulse-2026-05 + \_0008 + \_0009) — що зроблено, що відкрите: [`hardening-matrix.md`](./hardening-matrix.md).

## Джерела

- [`docs/90-work/audits/`](../audits) — формальні аудити, з яких ці ініціативи виросли (зокрема `2026-04-28-sergeant-comprehensive-audit.md` та design-review від 2026-05-03).
- [`docs/90-work/tech-debt/`](../tech-debt) — борг, який ці ініціативи мають закривати.
- [`docs/04-governance/adr/`](../../04-governance/adr) — фіксація рішень, які з ініціатив випливають.
