# 0011 — Foundation adoption + process discipline (post-launch sweep)

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** **Phase 1 complete** — 4/4 PR-ів merged станом на 2026-05-04. Phase 2 in flight: 2.2 merged (#1696); 2.4 (#1703) + 2.5 (#1709) + 2.6 (#1713) + 2.7 (#1714) + 2.8 (#1726) opened 2026-05-04 (DataState consumer adoption — finyk + fizruk + nutrition + routine + digest closes the consumer-adoption block; 2.9 ESLint rule і 2.1 ManualExpenseSheet залишаються). Phases 3–4 заплановані пост-0010-launch ≥ 2026-06-01.
> **Priority:** P1 (subordinate to 0010-revenue-first-launch scope-freeze)
> **Owner:** `@Skords-01`
> **ETA:** 7 тижнів (Phase 1 — паралельно з 0010 freeze; Phases 2–4 — після 0010 launch)
> **Sources:** Vector assessment 2026-05-04 (внутрішній звіт-прожарка по 100 PR #1564–#1664), [`docs/initiatives/0010-revenue-first-launch.md`](./0010-revenue-first-launch.md) (governing freeze), [`docs/initiatives/0007-design-system-tooling.md`](./0007-design-system-tooling.md), [`docs/initiatives/0008-platform-hardening.md`](./0008-platform-hardening.md), [`docs/initiatives/0009-agent-os-hardening.md`](./0009-agent-os-hardening.md), [`docs/governance/hard-rules.json`](../governance/hard-rules.json)

## TL;DR

За 100 PR з 2026-05-03/04 ми збудували **4 foundation-инструменти зі змінним adoption-рівнем** (станом на round-7: `useApiForm` — 8 файлів, у т.ч. **3/3 auth-екрани**: AuthPage login + AuthPage register + ResetPasswordPage [#1696](https://github.com/Skords-01/Sergeant/pull/1696); `<DataState>` — 0 реальних споживачів; типізований OpenAPI-клієнт — споживачі мігровані частково; Storybook — **12 stories** на ~50+ UI-компонентів [#1695](https://github.com/Skords-01/Sergeant/pull/1695)) і допустили **3 типи процес-помилок** (порожнє тіло PR-ів, Vercel-конфіг flip-flop без staging-перевірки, ~4 тижні задвоєння Renovate × Dependabot до фіксу). [`0010-revenue-first-launch`](./0010-revenue-first-launch.md) фрізить product-scope на 4 тижні (до ~2026-06-01) для shipping білінгу — **0011 поважає цей freeze**: Phase 1 (process-discipline CI-guards) проходить паралельно (інкрементальні зміни в `.github/workflows/`, не блокує білінг-PR-и), а Phases 2–4 стартують **після** revenue-first launch. Ця ініціатива закриває **adoption-розрив + три CI-guard-и + один retrospective audit** — у двох вікнах: in-freeze (Phase 1) та post-freeze (Phases 2–4).

## Чому зараз

- **Підпорядкованість 0010 freeze.** [`0010-revenue-first-launch`](./0010-revenue-first-launch.md) явно out-of-scope: «Mass-видалення docs / playbooks — окремий cleanup, не блокуючий launch». Foundation-міграції (`useApiForm` / `<DataState>` consumer-PR-и) і нові ESLint-правила технічно не блокують білінг, але **збільшують PR-quanta** в період коли `@Skords-01` має освоїти Stripe SDK + monetization architecture за 4 тижні. Тож Phase 2–4 явно відкладено в post-freeze. **Phase 1 (CI-guards) — exception:** вони власне **прискорюють** revenue-first роботу через зменшення risk-у incidents.
- **Launch у Q3 2026 (revenue-first-launch — більш ранній deadline).** 4 тижні до 0010 launch + ~8–12 тижнів буферу до Q3. Без foundation-adoption у post-freeze вікні до launch-у йдуть **два паралельні підходи** в кожному з чотирьох доменів (старий ad-hoc + новий useApiForm; manual `isLoading/isError` + `<DataState>`; ad-hoc fetch + OpenAPI-клієнт; **0 historic stories vs Storybook як ground-truth**), що блокує consistent UX і ускладнює incident-recovery.
- **PR #1571** змерджено з порожнім описом (928 LOC, 10 файлів) — **disciplinary asymmetry** на тлі того, як ми enforce-имо hard-rules для AI-агентів через [#1659](https://github.com/Skords-01/Sergeant/pull/1659) (skills-lock SHA-256), [#1660](https://github.com/Skords-01/Sergeant/pull/1660) (Hard Rules categorization). Для launch-grade compliance потрібен симетричний guard на **PR-template**.
- **PR #1595 → #1600** — Vercel SSOT-flip за 3 години (root vs `apps/web/`). Поломило прод-build, бо `apps/web/vercel.json` — це справжній SSOT (Vercel читає з Root Directory). [`scripts/check-vercel-config.sh`](../../scripts/check-vercel-config.sh) тепер ловить саме цей drift, але **не існує процесного guard-у на «зміна deployment-конфігу → обов'язкова staging-perевірка»**. Наступний flip-flop неминучий, поки немає процесу.
- **PR #1652** — collision міграцій 035 ↔ 035. [`scripts/lint-migrations.mjs`](../../scripts/lint-migrations.mjs) вже **ловить** дублікати у власному PR, але **не ловить** cross-branch collisions (коли два PR з однаковим номером N створились паралельно і одного з них рефейсили після merge другого). Перед launch це — реальна prod-data-loss-загроза.
- **CSP_DISABLE kill-switch** жив у проді щонайменше місяці до видалення в [#1631](https://github.com/Skords-01/Sergeant/pull/1631). **Немає incident-аудиту**, який підтверджує, що цей прапорець ніколи не був enabled у prod env. Без audit це — зомбі-incident, який може прокинутись в SOC2-review.

## Скоуп

**In:**

1. **Foundation-adoption (Phase 2):** перевести існуючі форми / RQ-екрани / fetch-сайти на `useApiForm` / `<DataState>` / типізований OpenAPI-клієнт; додати ESLint-deprecation для старих API; обмежити drift через `eslint-plugin-sergeant-design`.
2. **Process discipline (Phase 1):** CI-guards проти PR-template-violation, cross-branch migration-collision, deployment-конфіг drift без staging-перевірки.
3. **Retrospective audit (Phase 3):** доручитись щодо CSP_DISABLE-периоду (incident-document); pen-test для high-CVSS hardening cards (H5/H6/H8/H9), закритих 2026-05-04 за 1 день; soft-gate sweep plan для legacy-юзерів з `email_verified=false` (PR #1608).
4. **Storybook adoption hand-off (Phase 4):** **передати** Storybook-coverage-метрику у [0007 design-system-tooling](./0007-design-system-tooling.md) як власну. Тут — лише визначити CI-baseline і метрику, а виконання — у 0007.

**Out:**

- Нові продуктові модулі / нові інтеграції (поки фокус — adoption foundation, не features).
- Розширення Storybook-stories per se — це 0007's job; тут лише coverage-baseline.
- Зміни Better Auth core / OAuth провайдерів — це окрема ініціатива.
- Migration з hash-router на react-router — окремий 0006.
- Renovate / Dependabot tuning — це 0008 phase 3 (вже закрито).

## План змін

> Кожен PR — окрема гілка, окрема назва, окремий review. Якщо PR має consumer-міграції (Phase 2) — допускається запуск через child-Devin-сесії, але **не більше 2 одночасно** (рішення user 2026-05-04).
>
> Для всіх Phase-2 PR-ів: **не торкатись бізнес-логіки**, лише міграція тонкого «glue»-шару (RHF + zod, або replace `if (isLoading)` / `if (isError)` на `<DataState>`).

### Фаза 1 — Process discipline (CI guards) — 1 тиждень, 2026-05-05 → 2026-05-12 _(паралельно з 0010 freeze — in-scope)_

**Status: 4/4 PR-ів merged станом на 2026-05-04.** Phase 1 завершено повністю; залишаються лише 5 operational action items з PR 1.4 на @Skords-01 з due-date 2026-05-11.

**PR 1.1 — `ci(root): require all Hard Rule #15 boxes ticked in PR body`** (P0) — **MERGED [#1688](https://github.com/Skords-01/Sergeant/pull/1688)**

- **Pivot під час реалізації:** оригінальний план казав «новий `pr-quality.yml` + новий `<check-pr-body>.mjs`», але `scripts/ci/validate-pr-body.mjs` **уже існував** і вже перевіряв 7 секцій + non-empty body + ≥1 ticked checkbox. Створювати другий validator = той самий дубляж, який цей initiative закриває (Renovate × Dependabot ~4 тижні).
- **Реальна зміна:** додано `SECTIONS_REQUIRING_ALL_TICKED = ["Hard Rule #15"]`. Hard Rule #15 тепер валідується суворо **3-of-3 ticked**, бо кожен box — binary, factually-verifiable (read AGENTS.md / Ukrainian / no `--no-verify`). `Docs and Governance` лишається `≥1` (там є explicit `N/A` box).
- **+60 / −7 LOC у двох файлах. Тести:** 8 → 11 pass (нові: 1/3, 2/3, 3/3 grid).
- **Self-test:** validator валідує тіло цього ж PR-у, тож CI green = він працює.
- **Закрив:** PR #1571 type-incident (PR з порожнім тілом merged into main).

**PR 1.2 — `ci(server): cross-branch migration-number collision guard`** (P0) — **MERGED [#1691](https://github.com/Skords-01/Sergeant/pull/1691)**

- Розширення `scripts/lint-migrations.mjs` (без нового workflow YAML — re-use existing `migration-lint` job, який вже має `fetch-depth: 0`).
- Три нові helper-и (`listMigrationsOnRef`, `filterNewMigrationFiles`, `findCrossBranchCollisions`) + step 2a у `run()`. Перевіряє тільки `git diff --diff-filter=A` (newly-added) → modified files (M) НЕ flag-ляться як колізії.
- Graceful fallback: якщо `origin/main` недоступний — крок скіпається, lint degrades до prior behaviour.
- **Тести:** 28 → 41 pass (+13 нових). Black-box-сімуляція колізії: error-message правильно іменує файл і дає `rebase + renumber` guidance.
- **Закрив:** PR #1652 type-incident (та ж колізія, що сталась з 0010/0011 номерами під час підготовки цього initiative-document-у — meta!).

**PR 1.3 — `ci(root): require staging-verification label for deploy-config changes`** (P1) — **MERGED [#1697](https://github.com/Skords-01/Sergeant/pull/1697)**

- Новий workflow `.github/workflows/deploy-config-staging-gate.yml` + supporting script `scripts/ci/check-deploy-config-staging-gate.mjs`.
- Тригер: `pull_request: [opened, synchronize, reopened, labeled, unlabeled]`. Гейтить deploy-config файли: `vercel.json` (anywhere), `fly.toml`, `railway.toml`, `Dockerfile*` (basename), `Caddyfile`, `apps/server/build.mjs`.
- Comment-aware exemption per dialect: `none` (JSON, no comments), `hash` (TOML / Dockerfile / Caddyfile), `js` (build.mjs). Pure-comment / pure-whitespace diffs auto-skip the gate.
- Required labels: `verified-on-staging` (normal flow per playbook) OR `verified-on-staging-emergency` (escape-hatch with post-mortem commitment).
- **Тести:** 31 unit-test покриття (dispatch matchers, comment-only detection across 3 dialects, label parsing edge cases, full `evaluate()` integration).
- **Новий playbook:** `docs/playbooks/deploy-config-change.md` — decision tree (Mermaid) + per-surface verification steps (Vercel preview / Fly staging / Railway service) + emergency escape-hatch protocol. Зареєстровано у `playbook-catalog.md` + auto-regenerated INDEX.md.
- **Закрив:** PR #1595 → #1600 type-incident (Vercel SSOT-flip).

**PR 1.4 — `docs(docs): csp-disable retrospective audit`** (P1) — **MERGED [#1699](https://github.com/Skords-01/Sergeant/pull/1699)**

- Файл: `docs/audits/2026-05-04-csp-disable-retrospective.md` (а не `docs/incidents/...` як було у початковому плані — у репо вже існує `docs/audits/` як convention для retrospective-документів; `docs/postmortems/` зарезервовано для real incidents з confirmed user-impact).
- Зареєстровано у `docs/audits/README.md` як Active / 0-of-5 implemented.
- **Git-log investigation проведена:** `CSP_DISABLE` введено 2026-04-18 у [PR #128](https://github.com/Skords-01/Sergeant/pull/128) (commit `01914d34` — DevinAI feat strict API CSP), warn-on-boot-log додано через 24 години у [PR #345](https://github.com/Skords-01/Sergeant/pull/345) (commit `97ed26e9`), deep security review M1 зафіксував CVSS 6.1 на 2026-05-03, видалення з коду + EnvSchema 2026-05-04 у [PR #1631](https://github.com/Skords-01/Sergeant/pull/1631) (commit `de602495`). Total lifetime: 16 днів.
- **Open questions Q1–Q4 → action items A1–A5 на @Skords-01** з due-date 2026-05-11:
  - A1 — підтвердити Railway env-cleanup (production + staging) і записати pre-existing-value
  - A2 — експортувати Railway audit-log за 2026-04-18 → 2026-05-04 (або зафіксувати tier-limitation)
  - A3 — Sentry-query: `event.type:default AND (message:csp_disabled OR message:"csp-report")`
  - A4 — додати retroactive-row у `secret-ownership-register.md`
  - A5 — verify, що PR 1.3 staging-gate **НЕ** покриває runtime env-var changes у Railway dashboard (це окремий клас ризику; потрібна окрема ініціатива)
- Severity: **SEV4 near-miss** (no confirmed user-impact, але structural risk був реальним).
- **Закриває:** zombie-incident PR #1631 (operational boundary, явно deferred у Resolution log самої М1-картки).

### Фаза 2 — Foundation adoption (consumer migrations) — 3 тижні, 2026-06-02 → 2026-06-23 _(поста-0010-launch)_

**Реальні цифри baseline (2026-05-04):**

- `useFormValidation`: **2 active consumers** (`ManualExpenseSheet.tsx`, `ResetPasswordPage.tsx`). Решта вже на `useApiForm` або не мають форм.
- `useApiForm`: **6 active consumers** з [#1614](https://github.com/Skords-01/Sergeant/pull/1614).
- `<DataState>`: **0 active consumers** (тільки сама компонента + storybook + test).
- Manual `isLoading || isError` патерни: **15 файлів** з 31 RQ-користувачів.
- Raw `fetch('/api/...')` у `apps/web/src/modules/`: **0 файлів** (вже на типізованому клієнті).
- Storybook: **8 stories** (з [#1647](https://github.com/Skords-01/Sergeant/pull/1647) +5).

**PR 2.1 — `refactor(web): migrate ManualExpenseSheet from useFormValidation to useApiForm`** (P0)

- Файл: `apps/web/src/modules/finyk/components/ManualExpenseSheet.tsx`.
- Скоуп: замінити `useFormValidation(...)` на `useApiForm({ schema: ManualExpenseSchema, defaultValues, onSubmit })`. Field-level errors — через RHF `formState.errors`.
- Тест: оновити existing snapshot/RTL-test на новий error-pattern.
- **Risk:** низький — це 1 файл, форма проста.

**PR 2.2 — `refactor(web): migrate ResetPasswordPage from useFormValidation to useApiForm`** (P0)

- Файл: `apps/web/src/core/auth/ResetPasswordPage.tsx`.
- Скоуп: аналогічно 2.1. Особлива увага — server-side error mapping (`USER_NOT_FOUND`, `EMAIL_NOT_VERIFIED`, `RESET_TOKEN_EXPIRED`) на field-level з `setError('email', ...)` / `setError('root', ...)`.
- Тест: е2е-сценарій (existing) має пройти.
- **Risk:** низький-середній — це auth-flow, треба зберегти server-error-маппінг exact.

**PR 2.3 — `chore(web): deprecate useFormValidation — runtime warning + ESLint rule`** (P0, depends on 2.1+2.2)

- Файли:
  - `apps/web/src/shared/hooks/useFormValidation.ts` — додати `console.warn('[deprecation] useFormValidation is deprecated; migrate to useApiForm')` у dev-mode.
  - `packages/eslint-plugin-sergeant-design/rules/<no-form-validation-hook>.js` — нове правило, severity `warn` поки що, з `TODO(0010): YYYY-MM-DD` deadline = 2026-06-15.
  - `packages/eslint-plugin-sergeant-design/__tests__/<no-form-validation-hook>.test.mjs` — unit tests.
- ETA для перемикання severity → `error`: 2026-06-15 (через 4 тижні після цього PR; буфер для будь-яких нових споживачів).
- **Risk:** низький, але вимагає `pnpm lint:plugins` зеленим.

**PR 2.4–2.X — DataState consumer migrations (5 PR-ів, batched по доменах)**

Цільові 15 файлів — top-of-funnel high-traffic екрани. Розбиваємо по доменах:

| PR  | Назва                                                          | Файли (фактичні споживачі)                                                                                                                               | Status                                                                           |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 2.4 | `refactor(web): adopt <DataState> in finyk Mono panels`        | `Overview.tsx`, `budgets/Budgets.tsx`, `transactions/TransactionList.tsx` (+ `TransactionList.test.tsx`)                                                 | **Opened 2026-05-04 — [#1703](https://github.com/Skords-01/Sergeant/pull/1703)** |
| 2.5 | `refactor(web): adopt <DataState> in fizruk Workouts journal`  | `pages/Workouts.tsx` (єдина Skeleton-based loading site у fizruk модулі)                                                                                 | **Opened 2026-05-04 — [#1709](https://github.com/Skords-01/Sergeant/pull/1709)** |
| 2.6 | `refactor(web): adopt <DataState> in nutrition panels`         | `NutritionApp.tsx` Menu "plan" tab (єдиний Skeleton-based loading site у nutrition модулі)                                                               | **Opened 2026-05-04 — [#1713](https://github.com/Skords-01/Sergeant/pull/1713)** |
| 2.7 | `refactor(web): adopt <DataState> in routine panels`           | `RoutineTimeline.tsx` calendar branch (єдиний Skeleton-based loading site у routine модулі)                                                              | **Opened 2026-05-04 — [#1714](https://github.com/Skords-01/Sergeant/pull/1714)** |
| 2.8 | `refactor(web): adopt <DataState> in HubChat / coach / digest` | `core/insights/WeeklyDigestCard.tsx` `DigestContent` 4-state ladder (єдиний Skeleton-based panel-loading site у HubChat / coach / digest зоні `core/**`) | **Opened 2026-05-04 — [#1726](https://github.com/Skords-01/Sergeant/pull/1726)** |

> **Note (2026-05-04):** Файли в колонці «Файли» для 2.4–2.8 — actual landed targets, а не initial guess. Початкові приклади (`MonoTransactionsPanel`, `BudgetPanel`, `MonoAccountsList`, `WorkoutHistoryPanel`, `BiometricsPanel`, `NutritionMealsPanel`, `BarcodeScannerPanel`, `RoutineList`, `StreakCalendarPanel`, `HubChatHistoryPanel`, `CoachInsightsPanel`, `DigestPanel`) виявилися застарілими — фізичних компонентів з такими іменами в репі немає. Замість того ми мігрували реальні Skeleton-based loading sites у кожному модулі: усі три finyk-сторінки з `if (loadingTx && realTx.length === 0)` патерном (PR 2.4); `view === "log" && !workoutsLoaded` guard у `Workouts.tsx` (PR 2.5 — у fizruk саме одне таке місце, інші pages працюють синхронно з local-first MMKV-web даними); день-плановий `dayPlanBusy` skeleton у `NutritionApp.tsx` Menu "plan" branch (PR 2.6 — у nutrition тільки `NutritionApp.tsx` імпортує `@shared/components/ui/Skeleton`, food-search dropdown — inline list-state, не panel-level); calendar `isHabitPending && mainTab === "calendar"` skeleton у `RoutineTimeline.tsx` (PR 2.7 — єдиний Skeleton-importer у routine модулі); `DigestContent` 4-state ladder (skeleton → error → empty → content) у `WeeklyDigestCard.tsx` (PR 2.8 — у HubChat / coach / digest зоні `core/**` тільки `WeeklyDigestCard` має panel-level Skeleton-споживача; `AssistantAdviceCard` без skeleton imports і завжди має кеш last-good insight; `HubChatHistoryDrawer` local-first; `HubChat.tsx` / `HubChatBody` / `HubChatComposer` стрімлять без panel-skeleton-у).

> **Кожен PR — 1 child-Devin-сесія максимум.** Скоуп = 2–4 файли, ~150–300 LOC change. Поведінка не змінюється — той самий empty-state, той самий error-state, той самий retry. Лише уніфікований wrapper.

**PR 2.9 — `chore(web): ESLint rule against ad-hoc isLoading/isError patterns in modules`** (P1, depends on 2.4–2.8)

- Файл: `packages/eslint-plugin-sergeant-design/rules/<no-adhoc-rq-state>.js` (нове).
- Логіка: warn якщо у `apps/web/src/modules/**` JSX-element має умовний `isLoading` / `isError` / `isPending` з `useQuery` без огортання у `<DataState>`. Allowlist: `app/web/src/shared/components/ui/DataState.tsx`, `app/web/src/core/auth/**` (auth-форми мають свій pattern).
- ETA для severity `error`: 2026-06-30.
- **Risk:** середній — false-positives для legitimate ad-hoc patterns. Митиґуємо warn-only старт + allowlist.

### Фаза 3 — Hardening verification (для launch readiness) — 2 тижні, 2026-06-23 → 2026-07-07 _(поста-0010-launch)_

**PR 3.1 — `docs(security): pen-test playbook for H5/H6/H8/H9 closed cards`** (P0)

- Файл: `docs/security/pen-tests/2026-05-hardening-sweep.md` (новий) + `docs/playbooks/security-pen-test-checklist.md`.
- Скоуп: для кожної з 4 carded vulns запустити **manual e2e** + написати reproduction. Зокрема:
  - **H5 (PR #1604):** в production-env спробувати OAuth callback з `exp://` redirect_uri → має повертати 400 / unauthorized. Тест dev-env: `exp://` дозволено.
  - **H6 (PR #1608):** sign-up-flow з `REQUIRE_EMAIL_VERIFICATION=true` → перевірити, що `/api/mono/connect` без verification гейтиться 403, з verified — 200. Перевірити що legacy-юзери з `email_verified=false` ще працюють (`REQUIRE_EMAIL_VERIFICATION=false` default).
  - **H8 (PR #1606):** з atacking-orig перевірити, що `/api/me`, `/api/mono/*`, `/api/chat/*` повертають `Cross-Origin-Resource-Policy: same-origin` навіть на 401-response.
  - **H9 (PR #1567 + PR #1613):** в prod-env запустити з `AI_QUOTA_DISABLED=true` → процес мусить впасти зі startup error. Запустити transcribe з 9 МБ аудіо → перевірити що USD-cap pre-charge працює, friendly-error при перевищенні.
- Owner: `@Skords-01` (або external pen-tester як follow-up).
- **Risk:** низький, це підтвердження existing fixes.

**PR 3.2 — `test(server): integration assert all session-protected routes go through requireSession()`** (P1)

- Файл: `apps/server/src/__tests__/<session-protection.integration>.test.ts` (новий).
- Скоуп: вирахувати програмно (через Express router-introspection або via OpenAPI-spec) всі роути, що повертають `req.user` або працюють з sensitive data, і assert-ити що вони проходять `requireSession` middleware. Замість `grep`-based whitelist — реальний integration-test з Testcontainers.
- **Закриває:** мовчазний gap, на який покладається PR #1606.
- **Risk:** середній — false-negatives якщо routing-introspection не покриває all dynamic mounts. Митиґуємо явним `EXEMPT_ROUTES` allowlist (`/api/health/*`, `/api/auth/*`, `/api/csp-report`).

**PR 3.3 — `test(server): e2e transcribe USD-cap with real audio`** (P1)

- Файл: `apps/server/src/modules/transcribe/__tests__/<transcribe-usd-cap>.e2e.test.ts` (новий).
- Скоуп: справжній 5-секундний WAV-файл (мінімально-маленький, generated через FFmpeg у `__fixtures__/`). Запит #1 → success, `ai_usage_daily.usd_micros` оновлюється. Запит #2 з cap = $0.01 → 429 + friendly-error.
- **Закриває:** PR #1613 mock-test gap.
- **Risk:** низький.

**PR 3.4 — `docs(security): legacy unverified-email soft-gate sweep plan`** (P1)

- Файл: `docs/launch/email-verification-sweep.md` (новий).
- Скоуп: для launch у Q3 2026 потрібен plan, як підтягнути legacy-юзерів з `email_verified=false` без force-relogin. Опції:
  1. Soft-gate з 14-денним warning-banner у hub.
  2. Поступове `REQUIRE_EMAIL_VERIFICATION=true` через feature-flag після певного % verified-rate.
  3. Опціональний resend-verification CTA на login-flow.
- Документ — підготовча decision-doc; реалізація — у фазі pre-launch (окрема міні-ініціатива або 0011, якщо потрібно).
- **Risk:** низький (це plan, не реалізація).

### Фаза 4 — Storybook coverage hand-off → 0007 — 1 тиждень, 2026-07-07 → 2026-07-14 _(поста-0010-launch)_

**PR 4.1 — `chore(web): storybook coverage CI baseline + handoff to 0007`** (P2)

- Файл: `scripts/<check-storybook-coverage>.mjs` (новий — placeholder) + новий job у `ci.yml`.
- Логіка: підрахувати ratio = `(N stories) / (N exported components in apps/web/src/shared/components/ui/**)`. Поточний baseline (2026-05-04): **8 / ~50 = ~16%**. CI-guard падає якщо ratio падає (тобто додаються нові компоненти без stories), але не падає якщо ratio тільки росте.
- Документ: `docs/initiatives/0007-design-system-tooling.md` оновлюємо посиланням на цей baseline-метрику; **виконання stories** — там, не тут.
- **Закриває:** Storybook foundation-without-consumers gap.

> **Phase 4 — це лише coverage-baseline + handoff.** Реальне написання stories до high-coverage — окремий план у 0007. Тут ми лише ставимо метрику-thermometer.

## Критерії DONE

- [ ] **PR #1571-type incidents** не повторюються: `pr-quality.yml` ловить порожнє тіло і відсутні Hard Rule #15 чек-бокси у 100% non-bot PR-ів. Зеро merge-ів з failing цього guard за 4 тижні після rollout.
- [ ] **PR #1652-type collisions** не повторюються: `lint-migrations.mjs` cross-branch перевірка падає в усіх кейсах, де `NNN ≤ max(main:migrations)`. Зеро migration-renumber-fix-ів за 4 тижні.
- [ ] **PR #1595-type drift** не повторюється: будь-яка зміна `vercel.json` / `fly.toml` / `railway.toml` має `verified-on-staging` лейбл або `verified-on-staging-emergency` з пов'язаним post-mortem.
- [ ] **CSP_DISABLE retrospective** опубліковано: `docs/incidents/2026-05-04-csp-disable-audit.md` exists, з підтвердженням prod-impact (zero / non-zero) і подальшими діями.
- [ ] **`useFormValidation` дeprecated and migrated:** 0 active consumers поза legacy `useFormValidation.ts` файлом; ESLint-правило severity = `error`; runtime-warning видалено разом з самим хуком.
- [ ] **`<DataState>` adopted:** усі 15+ baseline manual-loading/error файлів використовують `<DataState>`; ESLint-правило `no-adhoc-rq-state` severity = `error`.
- [ ] **Hardening verification:** 4 pen-test cases (H5/H6/H8/H9) виконані з документацією результатів; integration-test для session-protected routes зелений; transcribe USD-cap e2e зелений з реальним audio fixture.
- [ ] **Storybook coverage baseline:** CI-метрика стабільно ≥ 16% (no-regression) і власність передана у 0007.

## Ризики

| Ризик                                                                                                                                  | Імовірність | Імпакт   | Митиґація                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PR-template guard блокує hot-fix-и в інциденті**                                                                                     | низька      | середній | `meta` лейбл як escape-hatch (потребує post-incident enrich body). Документ-flow в `docs/runbooks/incident-response.md`.                                                                   |
| **Cross-branch migration check не ловить race-condition**, якщо два PR з NNN merge-яться у короткий період                             | середня     | високий  | Перевірка перетворюється на runtime-check у `migrate.mjs` (fail при дублікаті у database state) — як останній bumper.                                                                      |
| **Vercel staging-verified guard сповільнює legitimate small fixes**                                                                    | висока      | низький  | `vercel.json`-only-comment-changes детектиш через diff-only-comments — exempt-pattern.                                                                                                     |
| **CSP_DISABLE-audit виявить, що прапорець був enabled у проді**                                                                        | низька      | високий  | Розширюємо у full security-disclosure процес з `docs/security/disclosures/` записом + повідомленням постраждалих юзерів. Якщо impact = 0, закриваємо як zero-impact.                       |
| **Foundation-migration introduces UX regression** (наприклад, новий error-pattern у `useApiForm` не сумісний з PostHog event tracking) | середня     | середній | Кожен PR має RTL-snapshot test + manual smoke. Catch-rate тестового покриття: вимагати ≥ 1 RTL-test на кожен migrated screen.                                                              |
| **Child-Devin-сесії дрейфують від плану** (1-2 одночасно × 5 PR = 3+ тижні чисто Devin-час)                                            | висока      | середній | Кожен child-PR — окремий strict prompt з лімітом scope; всі merge-я лише через explicit owner-approval. Якщо 2 поспіль PR fail review — pause і реасess.                                   |
| **Storybook hand-off stalls** у 0007 без явного owner-а Phase 4 реалізації                                                             | висока      | низький  | Phase 4 явно декларована як coverage-baseline-only тут; виконання stories перенесено у 0007 з updated TLDR. Якщо 0007 не зробить за 6 тижнів — додаємо як carry-over в 0011 (post-launch). |

## Власник / ETA

- **Власник:** `@Skords-01` (рoll-up; sub-tasks можуть делегуватись через child-Devin-сесії — 1-2 одночасно).
- **ETA загальна:** 7 тижнів від 0010-launch (2026-05-05 Phase 1 → 2026-07-14 Phase 4).
- **Phase 1** (CI guards — in 0010 freeze): 2026-05-05 → 2026-05-12 (1 тиждень, 4 PR).
- **Phase 2** (foundation adoption — пост 0010): 2026-06-02 → 2026-06-23 (3 тижні, 9 PR).
- **Phase 3** (hardening verification — пост 0010): 2026-06-23 → 2026-07-07 (2 тижні, 4 PR).
- **Phase 4** (storybook hand-off — пост 0010): 2026-07-07 → 2026-07-14 (1 тиждень, 1 PR).
- **Буфер до Q3-launch deadline 2026-09-30:** 11 тижнів.
- **Pre-freeze вікно (2026-05-12 → 2026-06-02):** 0011 вимкнений (очікує 0010 launch). `@Skords-01` доводить 0010 до Stripe-MVP.

## Посилання

- **Source assessment:** Vector assessment 2026-05-04 (внутрішній звіт-прожарка по 100 PR #1564–#1664).
- **Foundation source PRs:** [#1614 useApiForm](https://github.com/Skords-01/Sergeant/pull/1614), [#1588 DataState](https://github.com/Skords-01/Sergeant/pull/1588), [#1647 Storybook 10](https://github.com/Skords-01/Sergeant/pull/1647), [#1629 OpenAPI typed client](https://github.com/Skords-01/Sergeant/pull/1629).
- **Process-incident PRs:** [#1571 empty body](https://github.com/Skords-01/Sergeant/pull/1571), [#1595 Vercel SSOT flip](https://github.com/Skords-01/Sergeant/pull/1595) → [#1600 hot-fix](https://github.com/Skords-01/Sergeant/pull/1600), [#1652 migration collision](https://github.com/Skords-01/Sergeant/pull/1652), [#1631 CSP_DISABLE removal](https://github.com/Skords-01/Sergeant/pull/1631).
- **Hardening PRs (verification scope):** [#1604 H5](https://github.com/Skords-01/Sergeant/pull/1604), [#1606 H8](https://github.com/Skords-01/Sergeant/pull/1606), [#1608 H6](https://github.com/Skords-01/Sergeant/pull/1608), [#1567 H9-prod](https://github.com/Skords-01/Sergeant/pull/1567), [#1613 H9-transcribe](https://github.com/Skords-01/Sergeant/pull/1613).
- **Related initiatives:** [0010 revenue-first-launch](./0010-revenue-first-launch.md) (governing freeze; цей doc підпорядкований), [0007 design-system-tooling](./0007-design-system-tooling.md) (Storybook owner), [0008 platform-hardening](./0008-platform-hardening.md) (security-cards source), [0009 agent-os-hardening](./0009-agent-os-hardening.md) (process-discipline neighbor).
- **Hard rules:** [`docs/governance/hard-rules.json`](../governance/hard-rules.json), [`docs/governance/hard-rules-matrix.md`](../governance/hard-rules-matrix.md).
- **Existing scripts (extend, не замінювати):** [`scripts/lint-migrations.mjs`](../../scripts/lint-migrations.mjs), [`scripts/check-vercel-config.sh`](../../scripts/check-vercel-config.sh), [`scripts/check-skill-shape.mjs`](../../scripts/check-skill-shape.mjs).
