# Engineering Initiatives

> **Last validated:** 2026-05-13 by Devin (batch archival 2026-05-13 — 7 initiatives [0001, 0004, 0005, 0007, 0008, 0009, 0012] перенесено у `archive/`; 90-day waiting period skipped за рішенням founder-а). **Next review:** 2026-08-11.
> **Status:** Active

Цей розділ — **операційний плейлист** для інженерної команди. Кожен файл — одна окрема ініціатива, яка описує проблему, обсяг змін, план виконання та критерії готовності.

## Чим це не є

- **Це не аудит.** Аудити лежать у [`docs/audits/`](../audits/) і фіксують стан у конкретний момент. Ініціативи — це **плани змін**, які виходять з аудитів.
- **Це не ADR.** ADR ([`docs/adr/`](../adr/)) фіксують **рішення** post-factum. Ініціатива — це **робота, яку треба зробити**, і вона може породити ADR як побічний продукт.
- **Це не tech-debt registry.** [`docs/tech-debt/`](../tech-debt/) — реєстр боргу. Ініціатива має **дату завершення** і **метрики успіху**; борг там осідає, поки ініціатива його не закриє.

## Як читати

Кожен файл має префікс `NNNN-` за порядком створення (як у ADR), стабільний slug і таку саму структуру. Винятково для **multi-PR program-of-work серій** з власною внутрішньою нумерацією PR-ів (як `stack-pulse-2026-05/`) — допускається директорія з іменем `<slug>-YYYY-MM/`, де всередині лежать `00-overview.md`, `pr-NN-*.md`, sesssion-log-и тощо.

### Completed-prefix (`_NNNN-…`)

Коли ініціатива переходить у `Done` або `Closed`, файл **перейменовується** з `NNNN-slug.md` у `_NNNN-slug.md` — `_` сортується після цифр у `ls`, тому активні ініціативи лежать згори, завершені — знизу, і `archive/` нижче. Slug (`NNNN-slug`) лишається стабільним як ідентифікатор ініціативи у TODO-маркерах (наприклад, `TODO(0001-module-decomposition): …`), у `docs/governance/hard-rules.json` ref-ах і в історії — змінюється тільки фізичне ім'я файлу. CI-гейт `lint:initiative-status-sync` приймає обидві форми (`NNNN-…` і `_NNNN-…`); `pnpm docs:gen-initiative-followups` теж розуміє обидві.

```text
docs/initiatives/
├── 0002-mobile-platform-decision.md          # In progress
├── 0003-sync-v2-…md                          # In progress
├── 0006-frontend-routing-…md                 # In progress
├── 0010-revenue-first-launch.md              # In progress
├── 0011-foundation-adoption-…md              # In progress
├── 0013-module-decomposition-round-2.md      # In progress
├── README.md
├── archive/
│   ├── _0001-module-decomposition.md         # Done    (archived 2026-05-13)
│   ├── _0004-server-observability.md         # Done    (archived 2026-05-13)
│   ├── _0005-ai-cost-and-prompt-cache.md     # Done    (archived 2026-05-13)
│   ├── _0007-design-system-tooling.md        # Done    (archived 2026-05-13)
│   ├── _0008-platform-hardening.md           # Closed  (archived 2026-05-13)
│   ├── _0009-agent-os-hardening.md           # Closed  (archived 2026-05-13)
│   ├── _0012-perfect-strictness-rollout.md   # Closed  (archived 2026-05-13)
│   ├── 2026-08-02-batch-archival-plan.md     # Closed
│   └── README.md
├── follow-ups.md
└── stack-pulse-2026-05/
```

Коли через ≥90 днів `Closed` файл переходить у `archive/`, префікс **залишається** — `archive/_NNNN-slug.md`.

> **Що рухається разом із файлом при перейменуванні.** `git mv NNNN-… _NNNN-…` + одночасно у тому ж PR-і — оновити всі лінки на `.md` файл (markdown-посилання, comment-refs у коді / yml). Перевірка: `pnpm docs:check-links` + `pnpm lint:initiative-status-sync`. Slug-only mentions (без `.md` — TODO-маркери, governance refs) **не чіпаємо**.

> **Регулярні артефакти регенеруються самі.** `docs/initiatives/follow-ups.md` (через `pnpm docs:gen-initiative-followups`) та `docs/governance/hard-rules-matrix.md` (через `pnpm hard-rules:generate`) підхоплять нові шляхи.

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

## Активні ініціативи (травень 2026)

> **Status reconciliation 2026-05-09:** canonical detail lives in each initiative header. Current drift-sensitive notes: 0002 is still `In progress`, but its shell-sunset direction must be reconciled with 0010's owner decision to keep Capacitor primary until Expo feature parity; 0009 is **Closed** as of 2026-05-09 (PR 3.2 finalised AGENTS.md slim + 3-way `lint:hard-rules-registry` sync); 0011 has Phase 1 complete, partial Phase 2 adoption merged, and Phases 3–4 deferred until after 0010 launch.

| #    | Назва                                                                                                                | Пріоритет | Власник      | ETA                                               | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0002 | [Mobile platform decision](./0002-mobile-platform-decision.md)                                                       | P0        | `@Skords-01` | Sprint 1 (2 wk)                                   | In progress (Phase 1 — sunset locked, lint guard live, PR open) + Phase 2 [#1633](https://github.com/Skords-01/Sergeant/pull/1633) (weekly `shell-tax-report.yml` cron — авто-issue з reminder про deprecation, T-30/T-7/T-1 cadence).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 0003 | [Sync v2 rollout & v1 sunset](./0003-sync-v2-rollout-and-v1-sunset.md)                                               | P0        | `@Skords-01` | Sprint 1–2                                        | In progress (2026-05-04) — Phase 1 [#1621](https://github.com/Skords-01/Sergeant/pull/1621) (`sync_v1_legacy_clients_total` survey counter + 3 Grafana panels + 3 recording rules) + Phase 2 (RFC 8594 `Sunset:`/`Deprecation:` + RFC 8288 `Link:` middleware на v1 routes + [ADR-0043](../adr/0043-cloudsync-v1-sunset.md)). Phase 3-6 (feature-flag + backfill + T₀ → 410 Gone + cleanup) — pending, gated на baseline-week measurement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 0006 | [Frontend routing & code-split](./0006-frontend-routing-and-code-split.md)                                           | P1        | `@Skords-01` | Sprint 2 (2 wk)                                   | **In progress** (2026-05-06) — Phase 0 [#1657](https://github.com/Skords-01/Sergeant/pull/1657) lint canary baseline 18 warnings; **Phase 1** [#2100](https://github.com/Skords-01/Sergeant/pull/2100) `<RouterProvider />` swap (`react-router-dom@^7.14.1`, NOOP catch-all `path: "*"`); **Phase 2.a** [#2104](https://github.com/Skords-01/Sergeant/pull/2104) `/nutrition/*` path-based route (`useNutritionHashRoute` → `useNutritionRoute`, `PATH_BASED_MODULES = {nutrition}`); **Phase 2.b** [#2108](https://github.com/Skords-01/Sergeant/pull/2108) `/finyk/*` path-based route (`useHashRouter` → `useFinykRoute`, `PATH_BASED_MODULES = {nutrition, finyk}`, legacy `/finyk#budgets` → `/finyk/budgets` redirect-on-mount shim). Lint baseline 18 → 12 warnings (всі в fizruk). **Phase 2 next:** fizruk + routine. Phases 3–5 (hash-redirect e2e + scroll/prefetch + bundle-budget cleanup) — pending.                                                                                                                                                                                                                                                                                            |
| 0010 | [Revenue-first launch (Stripe MVP + Apple/Google auth + Mono-wedge)](./0010-revenue-first-launch.md)                 | P0        | `@Skords-01` | Sprint 1–4 (4 wk)                                 | **In progress** (2026-05-06) — Phase 0 + Phase 1 + Phase 5.1 done ([#2080](https://github.com/Skords-01/Sergeant/pull/2080)): [ADR-0051](../adr/0051-pricing-v3-single-tier.md) pricing v3 Accepted ($7/міс, ₴UA-only, trial без картки), [ADR-0052](../adr/0052-mobile-strategy-capacitor-primary.md) mobile-strategy Accepted (Capacitor primary, Expo paralleled), `evaluateActivationV2()` pure function у `packages/insights`. **Phase 2 next:** SQL міграції `subscriptions` + billing core. **OpenClaw НЕ freeze** (active parallel). **Public metrics — deferred.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0011 | [Foundation adoption + process discipline (post-launch sweep)](./0011-foundation-adoption-and-process-discipline.md) | P1        | `@Skords-01` | Sprint 2 (Phase 1) + post-0010 (Phases 2–4, 6 wk) | **In progress** (2026-05-04) — subordinate to [0010-revenue-first-launch](./0010-revenue-first-launch.md) freeze. **Phase 1: 4/4 PR-ів** merged: [#1688](https://github.com/Skords-01/Sergeant/pull/1688) `validate-pr-body.mjs` Hard Rule #15 strict 3-of-3 ticked, [#1691](https://github.com/Skords-01/Sergeant/pull/1691) cross-branch migration-collision guard, [#1697](https://github.com/Skords-01/Sergeant/pull/1697) deploy-config staging-verification gate, [#1699](https://github.com/Skords-01/Sergeant/pull/1699) CSP_DISABLE retrospective audit. **Phase 2.9 (DataState canary)** [#1823](https://github.com/Skords-01/Sergeant/pull/1823) merged: `sergeant-design/prefer-data-state` warn-only ESLint rule (warn on manual `if (X.isLoading\|isError\|isPending) return <JSX/>` ladder у `apps/web/src/modules/**`); 0 hits across 174 files — PRs 2.4–2.8 fully migrated. Phases 2–4 (foundation adoption + hardening verification + Storybook hand-off) — після 0010 launch, ~2026-06-02 → 2026-07-14. Real baseline: 2 active `useFormValidation`, 6 `useApiForm`, 0 real `<DataState>` consumers, 15 manual `isLoading/isError`, 0 raw `fetch()`. Source: vector assessment 2026-05-04. |
| 0013 | [Module decomposition round 2 (`apps/web` allowlist drain)](./0013-module-decomposition-round-2.md)                  | P2        | `@Skords-01` | Sprint 2–4 (3 wk, ~10 PR-ів)                      | In progress (Sprint 1 — 1/4 PR-ів) — successor для 0001-carry-over: drain `eslint.config.js` `max-lines:600` allowlist (11 файлів у `apps/web/src/**`) до ≤2. Sprint 1 — top-priority `Workouts.tsx` (717 LOC), `LogCard.tsx`, `Exercise.tsx`, `FinykApp.tsx`. Sprint 2 — drift drain (`NutritionApp`, `hubChatContext`, `fizrukActions`, `Cards`, `Subscriptions`). Sprint 3 — long-tail + `decomp-r2-finalize` (drop allowlist цілком). `FinykApp.tsx` decomp **відкладено** на post-0010-launch. Hard Rule #18 (`max-lines: [error, 600]`) лишається діючим upstream-контрактом. Source: [`docs/initiatives/archive/_0001-module-decomposition.md` § Outcome → Phase 3 → Що НЕ зроблено](./archive/_0001-module-decomposition.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| —    | [`stack-pulse-2026-05/`](./stack-pulse-2026-05/README.md) (multi-PR series)                                          | P2        | `@Skords-01` | Sprint 2–4 (3 wk, 16 PR-ів)                       | Proposed (2026-05-03) — серія з 16 послідовних PR-планів зі зрізу стеку 2026-05 (env-unify → rate-limit fail-closed → bcrypt cap → bus-factor → TS types → openclaw-app → body-size → API-versioning → APNS → better-auth → drizzle drift → sentry sampler → pg pool → vercel COEP → AI-quota → pino redaction). Поточно: `00-overview.md` + `01-session-log-2026-05-03.md` як живий лог; `pr-01..pr-16-*.md` — план кожного PR. Директорія-форма (іменована, не нумерована) — exception для multi-PR серій. Source: [`docs/initiatives/stack-pulse-2026-05/00-overview.md`](./stack-pulse-2026-05/00-overview.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Нещодавно завершені

`Done` / `Closed` ініціативи лишаються тут, поки актуальні для carry-over пошуку та рев'ю. Через ≥90 днів після переходу у `Closed` (за відсутності регресій / нових follow-up-ів) переходять у [`archive/`](./archive/) (див. § Гайдлайн → закриття та архівація).

| #   | Назва | Завершено | Статус | Outcome / carry-over |
| --- | ----- | --------- | ------ | -------------------- |

## Архів

Не активні джерела рішень. Файли перенесено у [`archive/`](./archive/) ≥90 днів після переходу у `Closed` (за відсутності регресій / нових follow-up-ів). Канонічні правила, що з ініціатив виросли, продовжують жити у `AGENTS.md` Hard Rules / `docs/governance/` / `docs/tech-debt/`.

**Batch 2026-05-13** (виконано — `90 days` waiting period не застосовано за рішенням founder-а, [`archive/2026-08-02-batch-archival-plan.md`](./archive/2026-08-02-batch-archival-plan.md)):

- [archive/\_0001-module-decomposition.md](./archive/_0001-module-decomposition.md) — archived 2026-05-13; canonical home: Hard Rule #18 (`max-lines: 600`) + successor [`./0013-module-decomposition-round-2.md`](./0013-module-decomposition-round-2.md) (carry-over allowlist drain).
- [archive/\_0004-server-observability.md](./archive/_0004-server-observability.md) — archived 2026-05-13; canonical home: [`../adr/0035-distributed-tracing-opentelemetry.md`](../adr/0035-distributed-tracing-opentelemetry.md) (OTLP/HTTP, `RouteAwareSampler`).
- [archive/\_0005-ai-cost-and-prompt-cache.md](./archive/_0005-ai-cost-and-prompt-cache.md) — archived 2026-05-13; canonical home: [`../adr/0039-anthropic-prompt-cache-policy.md`](../adr/0039-anthropic-prompt-cache-policy.md).
- [archive/\_0007-design-system-tooling.md](./archive/_0007-design-system-tooling.md) — archived 2026-05-13; canonical home: [`../adr/0046-storybook-vrt-scope.md`](../adr/0046-storybook-vrt-scope.md) + Storybook live deploy `https://skords-01.github.io/Sergeant/`.
- [archive/\_0008-platform-hardening.md](./archive/_0008-platform-hardening.md) — archived 2026-05-13; canonical home: `RATE_LIMIT_POLICIES` registry (`apps/server/src/config/rateLimit.ts`) + [`../adr/0044-renovate-vs-dependabot.md`](../adr/0044-renovate-vs-dependabot.md).
- [archive/\_0009-agent-os-hardening.md](./archive/_0009-agent-os-hardening.md) — archived 2026-05-13; canonical home: Hard Rules #15 + AGENTS.md slim (907 → 137 LOC) + `docs/governance/rules/`.
- [archive/\_0012-perfect-strictness-rollout.md](./archive/_0012-perfect-strictness-rollout.md) — archived 2026-05-13; canonical home: Hard Rule #19 (`noUncheckedIndexedAccess: true` + `tools/tsconfig-guard/allowlist.json`).

## Статуси

- **Proposed** — драфт готовий, ще не почато.
- **In progress** — є PR-и в роботі, статус видно у мердж-чек-листі ініціативи.
- **Done** — всі PR-и змерджено, `Критерії DONE` виконано, **Outcome** секція написана. Активна частина роботи завершена; carry-over (якщо є) зафіксовано у `### Carry-over → successor` блоці й автоматично попадає у [`follow-ups.md`](./follow-ups.md).
- **Closed** — `Done` + carry-over (якщо є) **передано далі** (tech-debt registry / successor initiative / `Що НЕ увійшло` секція з посиланнями). Команда явно сигналізує: «нічого більше у цьому файлі не планується». Стан "ready для архівації після ≥90 днів".
- **Archived** — файл фізично перенесено у [`docs/initiatives/archive/`](./archive/), а в README рядок замінено 1-рядковим redirect-stub-ом (`archived YYYY-MM-DD; superseded by …`). Канонічні правила, що ініціатива породила, продовжують жити у `AGENTS.md` Hard Rules / `docs/governance/`.
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
   - **Перейменувати файл:** `git mv docs/initiatives/NNNN-slug.md docs/initiatives/_NNNN-slug.md` (див. § Completed-prefix). У тому ж PR-і оновити всі `.md`-лінки на цей файл (markdown-посилання, comment-refs у `apps/**`, yml-workflows, ADR-cross-refs). Slug-only mentions без `.md` (TODO-маркери, `hard-rules.json` refs) — НЕ чіпаємо.
   - Перенести рядок з активної таблиці у `## Нещодавно завершені`. Шлях у `[name](./_NNNN-slug.md)` лінку — з префіксом.
   - Sanity check перед PR-ом: `pnpm lint:initiative-status-sync` + `pnpm docs:check-links` + `pnpm docs:check-initiative-followups`.
5. **Перехід `Done` → `Closed`** — коли вся carry-over робота передана до tech-debt / successor / `Що НЕ увійшло` (явний сигнал «нічого більше не планується»). Status у файлі та README — `Closed`. Пишемо у тому самому рядку — `Завершено`-дату не змінюємо. Файл лишається `_NNNN-slug.md` (префікс не змінюється; додався вже на кроці 4).
6. **Архівація** (`Closed` → `Archived`, через ≥90 днів від `Closed`-дати, за відсутності регресій):
   - Перенести файл у `docs/initiatives/archive/_NNNN-slug.md` — `_`-префікс лишається.
   - Замінити рядок у `## Нещодавно завершені` 1-рядковим redirect-stub-ом у `## Архів`: `[archive/_NNNN-slug.md] — archived YYYY-MM-DD; superseded by …` або `… (canonical rules → AGENTS.md / docs/governance/)`.
   - Канонічні правила, що з ініціативи виросли, лишаються у `AGENTS.md` Hard Rules / `docs/governance/`.

## Джерела

- [`docs/audits/`](../audits/) — формальні аудити, з яких ці ініціативи виросли (зокрема `2026-04-28-sergeant-comprehensive-audit.md` та design-review від 2026-05-03).
- [`docs/tech-debt/`](../tech-debt/) — борг, який ці ініціативи мають закривати.
- [`docs/adr/`](../adr/) — фіксація рішень, які з ініціатив випливають.
