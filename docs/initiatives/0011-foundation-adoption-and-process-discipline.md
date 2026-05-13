# 0011 — Foundation adoption + process discipline (post-launch sweep)

> **Last validated:** 2026-05-10 by Devin. **Next review:** 2026-08-08.
> **Status:** In progress — **Phases 1 + 2 complete; Phase 4 closed через handoff у 0007**. **Phase 1** (4/4): [#1688](https://github.com/Skords-01/Sergeant/pull/1688) `validate-pr-body.mjs` Hard Rule #15 strict 3-of-3, [#1691](https://github.com/Skords-01/Sergeant/pull/1691) cross-branch migration-collision guard, [#1697](https://github.com/Skords-01/Sergeant/pull/1697) deploy-config staging-verification gate, [#1699](https://github.com/Skords-01/Sergeant/pull/1699) CSP_DISABLE retrospective audit (5 operational action items A1–A5 на @Skords-01 — due `2026-05-11`, див. § Carry-over). **Phase 2** (DataState consumer adoption + form-engine consolidation): 2.1 ManualExpenseSheet round-13 (commit-у-існуючому-PR), 2.2 ResetPasswordPage merged [#1696](https://github.com/Skords-01/Sergeant/pull/1696), 2.3 `useFormValidation` deprecation закрита round-11 фізичним видаленням 0-споживачевого хука; 2.4 finyk merged [#1703](https://github.com/Skords-01/Sergeant/pull/1703), 2.5 fizruk merged [#1709](https://github.com/Skords-01/Sergeant/pull/1709), 2.6 nutrition merged [#1713](https://github.com/Skords-01/Sergeant/pull/1713), 2.7 routine merged [#1714](https://github.com/Skords-01/Sergeant/pull/1714), 2.8 hubchat/coach/digest merged [#1726](https://github.com/Skords-01/Sergeant/pull/1726); 2.9 prefer-data-state ESLint canary merged [#1823](https://github.com/Skords-01/Sergeant/pull/1823) 2026-05-05 (warn-only, 0 hits across 174 модульних файлів) — **Phase 2.9 finalize: severity-promote `warn → error` DONE 2026-05-10** (carry-over `2026-06-30` закрита заздалегідь). **Phase 4 closed 2026-05-05** через 0007 round-10 handoff (37/37 `shared/ui` stories non-allowlisted, module-level stories, ADR-0046, `sergeant-design/require-stories-for-ui-components` severity = `error` [#1812](https://github.com/Skords-01/Sergeant/pull/1812)). **Phase 3** (hardening verification + email-verification sweep) — пост-0010-launch ≥ 2026-06-02.
> **Priority:** P1 (subordinate to 0010-revenue-first-launch scope-freeze)
> **Owner:** `@Skords-01`
> **ETA:** 7 тижнів (Phase 1 — паралельно з 0010 freeze; Phases 2–4 — після 0010 launch)
> **Sources:** Vector assessment 2026-05-04 (внутрішній звіт-прожарка по 100 PR #1564–#1664), [`docs/initiatives/0010-revenue-first-launch.md`](./0010-revenue-first-launch.md) (governing freeze), [`docs/initiatives/archive/_0007-design-system-tooling.md`](./archive/_0007-design-system-tooling.md), [`docs/initiatives/archive/_0008-platform-hardening.md`](./archive/_0008-platform-hardening.md), [`docs/initiatives/archive/_0009-agent-os-hardening.md`](./archive/_0009-agent-os-hardening.md), [`docs/governance/hard-rules.json`](../governance/hard-rules.json)

## TL;DR

За 100 PR з 2026-05-03/04 ми збудували **4 foundation-инструменти зі змінним adoption-рівнем** і допустили **3 типи процес-помилок** (порожнє тіло PR-ів, Vercel-конфіг flip-flop без staging-перевірки, ~4 тижні задвоєння Renovate × Dependabot до фіксу). [`0010-revenue-first-launch`](./0010-revenue-first-launch.md) фрізить product-scope на 4 тижні (до ~2026-06-01) для shipping білінгу — **0011 поважає цей freeze**: Phase 1 (process-discipline CI-guards) пройшла паралельно (інкрементальні зміни в `.github/workflows/`, не блокує білінг-PR-и), Phase 2 (foundation adoption) була завершена дешевше за заплановане вікно (2 дні замість 3 тижнів) — паралельні child-Devin-сесії з вузьким scope-ом, всі 9 PR-equivalents merged за 2026-05-04…05; Phase 4 закрита handoff-ом у 0007 round-10 без проміжного coverage-thermometer-PR. Залишається **Phase 3** (hardening verification — pen-test для H5/H6/H8/H9, integration-test для session-protected routes, e2e transcribe USD-cap, email-verification sweep plan) — пост-0010-launch. **Foundation snapshot 2026-05-05:** `useApiForm` — 6+ active consumers + 3/3 auth-екрани; `<DataState>` — 5/5 модулів migrated (finyk + fizruk + nutrition + routine + hub) + canary ESLint rule (`prefer-data-state` warn-only, 0 hits); типізований OpenAPI-клієнт — 0 raw `fetch()` у `apps/web/src/modules/`; Storybook — 37/37 `shared/ui` non-allowlisted + module-level stories (закрито 0007 round-10). Ця ініціатива закриває **adoption-розрив + три CI-guard-и + один retrospective audit** — у двох вікнах: in-freeze (Phase 1+2 done) та post-freeze (Phase 3).

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
4. **Storybook adoption hand-off (Phase 4):** **передати** Storybook-coverage-метрику у [0007 design-system-tooling](./archive/_0007-design-system-tooling.md) як власну. Тут — лише визначити CI-baseline і метрику, а виконання — у 0007.

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

**Status: 4/4 PR-ів merged станом на 2026-05-04; PR 1.4 audit operational follow-up A1–A5 закриті 2026-05-06.** Phase 1 завершено повністю — і code-side guards, і operational verification (Railway env / audit-log / Sentry) закриті. CSP_DISABLE retrospective переведено у Closed-state ([`docs/audits/2026-05-04-csp-disable-retrospective.md`](../audits/2026-05-04-csp-disable-retrospective.md)).

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

**Реальні цифри baseline (2026-05-05, після round-11 cleanup):**

- `useFormValidation`: **0 active consumers** — хук видалено фізично разом з його export'ами з `apps/web/src/shared/hooks/index.ts` (round-11). Попередня цифра 2 (станом на 2026-05-04) — застаріла; обидва legacy-споживачі (`ManualExpenseSheet.tsx`, `ResetPasswordPage.tsx`) уже були мігровані до round-13/round-7-форма-engine роботи. PR 2.1 / 2.2 / 2.3 закриті фактом видалення (запланований runtime-warning не потрібен — нема чого попереджати).
- `useApiForm`: **6+ active consumers** з [#1614](https://github.com/Skords-01/Sergeant/pull/1614).
- `<DataState>`: **0 active consumers** (тільки сама компонента + storybook + test).
- Manual `isLoading || isError` патерни: **15 файлів** з 31 RQ-користувачів.
- Raw `fetch('/api/...')` у `apps/web/src/modules/`: **0 файлів** (вже на типізованому клієнті).
- Storybook: **37 shared/ui + 5 module-level stories** (закрито 0007 round-10, см. [`_0007-design-system-tooling.md`](./archive/_0007-design-system-tooling.md)).

**PR 2.1 — `refactor(web): migrate ManualExpenseSheet from useFormValidation to useApiForm`** (P0) — **DONE (round-13, без окремого PR)**

- Файл: `apps/web/src/modules/finyk/components/ManualExpenseSheet.tsx` уже на `useApiForm({ schema, defaultValues, onSubmit })` зі звичайним RHF `formState.errors` mapping (див. inline-коментар у файлі: «Item #8 round-13: form-engine — міграція із легасі `useFormValidation`»).

**PR 2.2 — `refactor(web): migrate ResetPasswordPage from useFormValidation to useApiForm`** (P0) — **DONE**

- Файл: `apps/web/src/core/auth/ResetPasswordPage.tsx` на `useApiForm` (server-side error mapping — `USER_NOT_FOUND`, `EMAIL_NOT_VERIFIED`, `RESET_TOKEN_EXPIRED` — через `setError('email' | 'root', …)` нативно у `applyServerError` з `useApiForm.ts`).

**PR 2.3 — `chore(web): deprecate useFormValidation`** (P0) — **DONE (round-11) як фізичне видалення**

- Замість runtime-warning + ESLint rule: оскільки 0 споживачів — хук видалено повністю.
- `apps/web/src/shared/hooks/useFormValidation.ts` — видалено.
- `apps/web/src/shared/hooks/index.ts` — прибрано `export { useFormValidation, validationRules }` + `export type { UseFormValidationReturn }`.
- `docs/design/design-system.md` — секцію `useFormValidation` видалено.
- ESLint rule + warn-only-time-window не потрібні: канонічний form-engine — `useApiForm` (єдиний); якщо новий контриб'ютор спробує імпортувати `useFormValidation` — TS-error на etape compile, бо файлу й експорту нема.
- **Risk:** нульовий (`grep useFormValidation apps/web/src` після видалення — порожньо; жодного споживача).

**PR 2.4–2.X — DataState consumer migrations (5 PR-ів, batched по доменах)**

Цільові 15 файлів — top-of-funnel high-traffic екрани. Розбиваємо по доменах:

| PR  | Назва                                                          | Файли (фактичні споживачі)                                                                                                                               | Status                                                                           |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 2.4 | `refactor(web): adopt <DataState> in finyk Mono panels`        | `Overview.tsx`, `budgets/Budgets.tsx`, `transactions/TransactionList.tsx` (+ `TransactionList.test.tsx`)                                                 | **MERGED 2026-05-04 — [#1703](https://github.com/Skords-01/Sergeant/pull/1703)** |
| 2.5 | `refactor(web): adopt <DataState> in fizruk Workouts journal`  | `pages/Workouts.tsx` (єдина Skeleton-based loading site у fizruk модулі)                                                                                 | **MERGED 2026-05-04 — [#1709](https://github.com/Skords-01/Sergeant/pull/1709)** |
| 2.6 | `refactor(web): adopt <DataState> in nutrition panels`         | `NutritionApp.tsx` Menu "plan" tab (єдиний Skeleton-based loading site у nutrition модулі)                                                               | **MERGED 2026-05-04 — [#1713](https://github.com/Skords-01/Sergeant/pull/1713)** |
| 2.7 | `refactor(web): adopt <DataState> in routine panels`           | `RoutineTimeline.tsx` calendar branch (єдиний Skeleton-based loading site у routine модулі)                                                              | **MERGED 2026-05-04 — [#1714](https://github.com/Skords-01/Sergeant/pull/1714)** |
| 2.8 | `refactor(web): adopt <DataState> in HubChat / coach / digest` | `core/insights/WeeklyDigestCard.tsx` `DigestContent` 4-state ladder (єдиний Skeleton-based panel-loading site у HubChat / coach / digest зоні `core/**`) | **MERGED 2026-05-04 — [#1726](https://github.com/Skords-01/Sergeant/pull/1726)** |

> **Note (2026-05-04):** Файли в колонці «Файли» для 2.4–2.8 — actual landed targets, а не initial guess. Початкові приклади (`MonoTransactionsPanel`, `BudgetPanel`, `MonoAccountsList`, `WorkoutHistoryPanel`, `BiometricsPanel`, `NutritionMealsPanel`, `BarcodeScannerPanel`, `RoutineList`, `StreakCalendarPanel`, `HubChatHistoryPanel`, `CoachInsightsPanel`, `DigestPanel`) виявилися застарілими — фізичних компонентів з такими іменами в репі немає. Замість того ми мігрували реальні Skeleton-based loading sites у кожному модулі: усі три finyk-сторінки з `if (loadingTx && realTx.length === 0)` патерном (PR 2.4); `view === "log" && !workoutsLoaded` guard у `Workouts.tsx` (PR 2.5 — у fizruk саме одне таке місце, інші pages працюють синхронно з local-first MMKV-web даними); день-плановий `dayPlanBusy` skeleton у `NutritionApp.tsx` Menu "plan" branch (PR 2.6 — у nutrition тільки `NutritionApp.tsx` імпортує `@shared/components/ui/Skeleton`, food-search dropdown — inline list-state, не panel-level); calendar `isHabitPending && mainTab === "calendar"` skeleton у `RoutineTimeline.tsx` (PR 2.7 — єдиний Skeleton-importer у routine модулі); `DigestContent` 4-state ladder (skeleton → error → empty → content) у `WeeklyDigestCard.tsx` (PR 2.8 — у HubChat / coach / digest зоні `core/**` тільки `WeeklyDigestCard` має panel-level Skeleton-споживача; `AssistantAdviceCard` без skeleton imports і завжди має кеш last-good insight; `HubChatHistoryDrawer` local-first; `HubChat.tsx` / `HubChatBody` / `HubChatComposer` стрімлять без panel-skeleton-у).

> **Кожен PR — 1 child-Devin-сесія максимум.** Скоуп = 2–4 файли, ~150–300 LOC change. Поведінка не змінюється — той самий empty-state, той самий error-state, той самий retry. Лише уніфікований wrapper.

**PR 2.9 — `feat(eslint-plugins): add prefer-data-state canary`** (P1, depended on 2.4–2.8) — **MERGED [#1823](https://github.com/Skords-01/Sergeant/pull/1823)**

- Файл: `packages/eslint-plugin-sergeant-design/index.js` (rule `prefer-data-state` додано inline у вже існуючий plugin-aggregator) + конфіг у `eslint.config.js` для `apps/web/src/modules/**`.
- Логіка: warn якщо у `apps/web/src/modules/**` JSX-element має умовний `isLoading` / `isError` / `isPending` ladder з `useQuery`-подібного hook без огортання у `<DataState>`. Allowlist (per-glob через `eslint.config.js`): `apps/web/src/shared/components/ui/DataState.tsx`, `apps/web/src/core/auth/**` (auth-форми мають свій pattern).
- **0 hits across 174 module-files** на момент merge — ефективна «зелена канарка», що верифікує: PRs 2.4–2.8 повністю мігрували відомі baseline-споживачі (15 файлів з manual-loading-ladder-патерном).
- Тести у `packages/eslint-plugin-sergeant-design/__tests__/prefer-data-state.test.mjs` (RuleTester valid+invalid кейси).
- Severity-promote до `error` — **виконано 2026-05-10 у Phase 2.9-finalize** (one-line зміна `"warn" → "error"` у `eslint.config.js` після baseline-вікна: 0 hits across 174 module-files стабільно ≥ baseline-week; carry-over `2026-06-30` закрита заздалегідь).
- **Risk:** низький (warn-only старт + allowlist; canary вже зелена).

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

### Фаза 4 — Storybook coverage hand-off → 0007 — **CLOSED 2026-05-05** через 0007 round-10 handoff

Початковий план Phase 4 (PR 4.1 з ratio-thermometer-скриптом + handoff виконання stories у 0007) виявився непотрібним — 0007 round-10 закрив stories повністю **без проміжного coverage-thermometer-PR**.

**Що шипнуто у 0007 round-10 (closes Storybook foundation-without-consumers gap):**

- 37/37 `shared/ui` non-allowlisted stories (100% coverage поза allowlist-ом).
- Module-level stories для Finyk / Fizruk / Nutrition / Routine / Insights.
- Storybook GitHub Pages deploy live: https://skords-01.github.io/Sergeant/.
- [ADR-0046](../adr/0046-storybook-vrt-scope.md) фіксує VRT scope.
- `sergeant-design/require-stories-for-ui-components` ESLint rule severity = `error` ([#1812](https://github.com/Skords-01/Sergeant/pull/1812)) — сильніший gate, ніж заплановані ratio-based thermometer (нові UI-компоненти без stories провалюють lint безумовно, без потреби коефіцієнт-обчислення).

Coverage-thermometer-PR (`scripts/<check-storybook-coverage>.mjs`) **знятий зі скоупу** — фіксований lint-error в 0007 виконує ту саму функцію strikt-нішим способом.

**Закриває:** Storybook foundation-without-consumers gap.

> **Phase 4 — закрита handoff-ом без виконання заплановного PR 4.1.** Реальне написання stories відбулось у 0007. Lint-rule severity = `error` замінює baseline-thermometer.

## Carry-over → successor

> **Що це.** Open follow-up-и з Phase 1 (PR 1.4 audit operational items) і Phase 2 (severity-promote prefer-data-state). Парситься [`scripts/docs/generate-initiative-followups.mjs`](../../scripts/docs/generate-initiative-followups.mjs) у [`docs/initiatives/follow-ups.md`](./follow-ups.md). CI-гейт `Initiative follow-ups (in sync)` падає, якщо checked-in `follow-ups.md` розходиться з тим, що згенерує скрипт.

- [x] **2026-05-11:** A1 — підтвердити Railway env-cleanup (production + staging) і записати pre-existing-value у resolution log audit-у [`docs/audits/2026-05-04-csp-disable-retrospective.md`](../audits/2026-05-04-csp-disable-retrospective.md). _Done 2026-05-06: Railway GraphQL `variables` query → 39 keys, 0 матчів `CSP|DISABLE|BYPASS|OVERRIDE`; staging environment не існує у проєкті; деталі в audit §Resolution log._
- [x] **2026-05-11:** A2 — експортувати Railway audit-log за період 2026-04-18 → 2026-05-04 (або зафіксувати tier-limitation, якщо community tier його не зберігає). _Done 2026-05-06: tier трекає лише `Shared Variable.{created,updated,deleted}` (workspace-scope); service-level env-vars не покриваються; запит за вікно — 0 events; деталі в audit §Resolution log._
- [x] **2026-05-11:** A3 — Sentry-query: `event.type:default AND (message:csp_disabled OR message:"csp-report")` для `apps/server` за 2026-04-18 → 2026-05-04. Записати кількість events і чи був ≥1 год gap у CSP-report rate. _Done 2026-05-06: Railway log-stream + Sentry org `dima-dk`/project `sergeant-api` обидва — 0 матчів; 0 issues org-wide за 90d; деталі в audit §Resolution log._
- [x] **2026-05-11:** A4 — додати retroactive-row у [`docs/security/secret-ownership-register.md`](../security/secret-ownership-register.md) для `CSP_DISABLE` із status `removed 2026-05-04` і lifetime `2026-04-18 → 2026-05-04`. _Done 2026-05-06: схема таблиці розширена `Status` / `Lifetime` колонками; retroactive-row додана у новий §Retired secrets._
- [x] **2026-05-11:** A5 — verify, що PR 1.3 staging-gate ([#1697](https://github.com/Skords-01/Sergeant/pull/1697)) **НЕ** покриває runtime env-var changes у Railway dashboard (це окремий клас ризику). Відкрити окрему ініціативу для cover Railway env-var change-tracking. _Done 2026-05-06: verification = НЕ покриває (підтверджено в audit §Process recommendations №3/№4); окрема ініціатива відкладена — replaced backlog-item-ом у [`docs/tech-debt/backend.md` § Operational visibility — Railway env-var changes](../tech-debt/backend.md#operational-visibility--railway-env-var-changes)._
- [x] **2026-06-30:** Phase 2.9 finalize — promote `sergeant-design/prefer-data-state` ESLint rule severity з `warn` до `error` (one-line зміна у `eslint.config.js` після baseline-week, якщо warn-rate стабільно ≤ 1). _Done 2026-05-10: severity flipped `warn → error` у `eslint.config.js`; baseline-вікно з merge PR-#1823 (2026-05-05) — стабільно 0 hits across 174 module-files; canary green. Закрито заздалегідь._

## Критерії DONE

- [x] **PR #1571-type incidents shipped guard:** `validate-pr-body.mjs` (PR [#1688](https://github.com/Skords-01/Sergeant/pull/1688)) ловить порожнє тіло і відсутні Hard Rule #15 чек-бокси (3-of-3 strict). Verification window: 4 тижні no-merge-ів з failing guard відлічується після rollout 2026-05-04.
- [x] **PR #1652-type collisions shipped guard:** `lint-migrations.mjs` cross-branch check (PR [#1691](https://github.com/Skords-01/Sergeant/pull/1691)) падає при `NNN ≤ max(main:migrations)`. Verification window: 4 тижні no-renumber-fix-ів від rollout 2026-05-04.
- [x] **PR #1595-type drift shipped guard:** deploy-config-staging-gate workflow + playbook (PR [#1697](https://github.com/Skords-01/Sergeant/pull/1697)) гейтить зміни `vercel.json` / `fly.toml` / `railway.toml` / `Dockerfile*` / `Caddyfile` / `apps/server/build.mjs` через `verified-on-staging` (або `verified-on-staging-emergency` з post-mortem-обов'язком).
- [x] **CSP_DISABLE retrospective опубліковано і закрито:** [`docs/audits/2026-05-04-csp-disable-retrospective.md`](../audits/2026-05-04-csp-disable-retrospective.md) (PR [#1699](https://github.com/Skords-01/Sergeant/pull/1699)) — code-side cleanup закрито у [#1631](https://github.com/Skords-01/Sergeant/pull/1631); operational-side A1–A5 закриті 2026-05-06 (audit Status = Closed, deltail у §Resolution log). Підтверджений висновок: `CSP_DISABLE` ніколи не був enabled у production за 16-day window — SEV4 near-miss закрита як zero-impact.
- [x] **`useFormValidation` deprecated and migrated:** 0 active consumers; хук видалено фізично разом із export'ами з `apps/web/src/shared/hooks/index.ts` (round-11). Окрема ESLint-rule + runtime-warning не знадобились — TS compile-error замість них.
- [x] **`<DataState>` adopted (5/5 modules):** усі baseline Skeleton-based loading sites у finyk + fizruk + nutrition + routine + hubchat/coach/digest мігровані ([#1703](https://github.com/Skords-01/Sergeant/pull/1703) + [#1709](https://github.com/Skords-01/Sergeant/pull/1709) + [#1713](https://github.com/Skords-01/Sergeant/pull/1713) + [#1714](https://github.com/Skords-01/Sergeant/pull/1714) + [#1726](https://github.com/Skords-01/Sergeant/pull/1726)); ESLint-правило `prefer-data-state` warn-only canary merged ([#1823](https://github.com/Skords-01/Sergeant/pull/1823)) — 0 hits across 174 module-files; severity = `error` запланований 2026-06-30 (див. § Carry-over).
- [ ] **Hardening verification (Phase 3):** 4 pen-test cases (H5/H6/H8/H9) виконані з документацією результатів; integration-test для session-protected routes зелений; transcribe USD-cap e2e зелений з реальним audio fixture; email-verification sweep plan документований.
- [x] **Storybook coverage baseline:** закрито через 0007 round-10 handoff — 37/37 `shared/ui` non-allowlisted stories + module-level stories + ADR-0046 + `require-stories-for-ui-components` severity = `error` ([#1812](https://github.com/Skords-01/Sergeant/pull/1812)). Власність передана 0007 без проміжного thermometer-PR (lint-error severity сильніший за ratio-gate).

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

- **Власник:** `@Skords-01` (роll-up; sub-tasks можуть делегуватись через child-Devin-сесії — 1-2 одночасно).
- **ETA загальна:** оригінально 7 тижнів від 0010-launch — фактично Phase 1+2+4 завершені за 2 дні (2026-05-04…05) через паралельні child-сесії. Залишається Phase 3 + операційні follow-up-и з § Carry-over.
- **Phase 1** (CI guards — in 0010 freeze): **DONE 2026-05-04** (4/4 PR-ів). Заплановане вікно — 1 тиждень; фактичне — 1 день. 5 operational action items A1–A5 (PR 1.4) — due `2026-05-11`.
- **Phase 2** (foundation adoption — пост 0010 originally): **DONE 2026-05-04…05** (9/9 PR-equivalents: 2.1 round-13, 2.2 #1696, 2.3 round-11, 2.4 #1703, 2.5 #1709, 2.6 #1713, 2.7 #1714, 2.8 #1726, 2.9 #1823). Заплановане вікно — 3 тижні; фактичне — 2 дні. Phase 2.9 finalize (severity-promote prefer-data-state до `error`) — **DONE 2026-05-10** (carry-over `2026-06-30` закрита заздалегідь).
- **Phase 3** (hardening verification — пост 0010): **PLANNED** 2026-06-23 → 2026-07-07 (2 тижні, 4 PR). Стартує після 0010-launch.
- **Phase 4** (storybook hand-off — пост 0010 originally): **CLOSED 2026-05-05** через 0007 round-10 handoff. Заплановане вікно — 1 тиждень; фактичне — 0 (handoff без проміжного PR).
- **Буфер до Q3-launch deadline 2026-09-30:** ≥ 17 тижнів (раніше 11; різниця — за рахунок Phase 2+4 раннього завершення).
- **Pre-freeze вікно (2026-05-06 → 2026-06-02):** 0011 у режимі тільки операційних action items A1–A5 (зайнятість @Skords-01 — мінімальна). `@Skords-01` доводить 0010 до Stripe-MVP.

## Посилання

- **Source assessment:** Vector assessment 2026-05-04 (внутрішній звіт-прожарка по 100 PR #1564–#1664).
- **Foundation source PRs:** [#1614 useApiForm](https://github.com/Skords-01/Sergeant/pull/1614), [#1588 DataState](https://github.com/Skords-01/Sergeant/pull/1588), [#1647 Storybook 10](https://github.com/Skords-01/Sergeant/pull/1647), [#1629 OpenAPI typed client](https://github.com/Skords-01/Sergeant/pull/1629).
- **Process-incident PRs:** [#1571 empty body](https://github.com/Skords-01/Sergeant/pull/1571), [#1595 Vercel SSOT flip](https://github.com/Skords-01/Sergeant/pull/1595) → [#1600 hot-fix](https://github.com/Skords-01/Sergeant/pull/1600), [#1652 migration collision](https://github.com/Skords-01/Sergeant/pull/1652), [#1631 CSP_DISABLE removal](https://github.com/Skords-01/Sergeant/pull/1631).
- **Hardening PRs (verification scope):** [#1604 H5](https://github.com/Skords-01/Sergeant/pull/1604), [#1606 H8](https://github.com/Skords-01/Sergeant/pull/1606), [#1608 H6](https://github.com/Skords-01/Sergeant/pull/1608), [#1567 H9-prod](https://github.com/Skords-01/Sergeant/pull/1567), [#1613 H9-transcribe](https://github.com/Skords-01/Sergeant/pull/1613).
- **Related initiatives:** [0010 revenue-first-launch](./0010-revenue-first-launch.md) (governing freeze; цей doc підпорядкований), [0007 design-system-tooling](./archive/_0007-design-system-tooling.md) (Storybook owner), [0008 platform-hardening](./archive/_0008-platform-hardening.md) (security-cards source), [0009 agent-os-hardening](./archive/_0009-agent-os-hardening.md) (process-discipline neighbor).
- **Hard rules:** [`docs/governance/hard-rules.json`](../governance/hard-rules.json), [`docs/governance/hard-rules-matrix.md`](../governance/hard-rules-matrix.md).
- **Existing scripts (extend, не замінювати):** [`scripts/lint-migrations.mjs`](../../scripts/lint-migrations.mjs), [`scripts/check-vercel-config.sh`](../../scripts/check-vercel-config.sh), [`scripts/check-skill-shape.mjs`](../../scripts/check-skill-shape.mjs).
