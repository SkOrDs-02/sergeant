# Round-13 Burndown Sprint — закриття KPI items #6 / #8 / #15

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Superseded — round 14 ревізія підтвердила, що всі три KPI items закриті без потреби в R13.1–R13.7 PR-послідовності, описаній нижче. Канонічне джерело статусу — [`./00-overview.md` §11.5 (round 14)](./00-overview.md#§115-залишок-роботи-до-повного-закриття-18-items-станом-на-2026-05-05-round-14).
>
> **Що сталося насправді:**
>
> - **Item #8** закрито round 13 одним PR ([#1796](https://github.com/Skords-01/Sergeant/pull/1796)) — `AddBudgetForm` + `ManualExpenseSheet` + `InputDialog` ⇒ forms-coverage 7/12 → 10/12 (≥83% mature plateau). R13.2 / R13.3 / R13.4 стали no-op-ами (`Budgets.tsx` тепер не має inline-форми; `ManualExpenseSheet` уже на `useApiForm`; `OnboardingWizard` свідомо out-of-scope як module-picker).
> - **Item #15** закрито PR [#1894](https://github.com/Skords-01/Sergeant/pull/1894) («close 0012 strictness rollout — Phase 6a/6b/6d/6f»): `noUncheckedIndexedAccess: true` додано в base `packages/config/tsconfig.base.json`. Жоден з 3 apps НЕ override-ить flag, всі 3 apps + 11 packages зелені під strict typecheck. R13.5 / R13.6 / R13.7 закрито однією зміною base config, без потреби в per-app rollout-і.
> - **Item #6** на mature plateau (`production: 10` у `.tech-debt/localstorage-allowlist-budget.json`) — sub-PR storage-roadmap Stage 7 (`apps/web/src/modules/finyk/lib/storageManager.ts` мігровано на `safe*LS`). R13.1 закрито, +RTL hardening для quota/Safari Private Mode тепер не потрібен як окремий PR (вже покрито через `safeWriteLS` retry-on-failure тести в `__tests__/storage.test.ts`).
>
> Зберігаємо doc для історії (sprint-планування template + decomposition по priorities у §1–§2 нижче). Не використовуйте R13.x acceptance criteria для нових PR — звіряйтеся з §11.5 overview або з `docs/testing/mutation.md` для organic items.

> Структурований PR-план на закриття трьох rolling-burndown items
> з [`./00-overview.md` §11.5](./00-overview.md) — після round-12
> (PR [#1793](https://github.com/Skords-01/Sergeant/pull/1793) +
> [#1794](https://github.com/Skords-01/Sergeant/pull/1794)) залишилось
> приблизно **~7 PR-ів** до повного closure фінальних KPI на items
> **#6 (localStorage allowlist burndown)**, **#8 (form-engine unification —
> `useApiForm` rollout)** та **#15 (`tsconfig.strict` + `noUncheckedIndexedAccess`
> per package/app)**.
>
> Цей документ — те саме, що §7a Sprint 6 cleanup batch у
> [`docs/launch/ftux-sprint-plan.md`](../../launch/ftux-sprint-plan.md):
> прогавлені моменти, які раніше жили лише narrative-ом у §11.5
> overview-таблиці, без розпису по PR-ах. Дванадцять round-N follow-up
> PR-ів виконувались ad-hoc, без єдиного sprint-доку, тож reviewer не
> бачив залишку до closure без читання full-overview.
>
> **Cross-refs:**
> [`./00-overview.md` §11.5](./00-overview.md) — burndown narrative ·
> [`./01-frontend-ergonomics.md` §3.1](./01-frontend-ergonomics.md) — Item #8 джерело ·
> [`./02-architecture-and-state.md` §1.0 / §2.2](./02-architecture-and-state.md) —
> Items #15 / #6 джерело · [`docs/i18n/readiness.md`](../../i18n/readiness.md) —
> Item #18 organic roadmap · [`docs/testing/mutation.md`](../../testing/mutation.md) —
> Item #17 organic roadmap.

---

## 0. Чому окремий sprint-doc, а не «ще один round»

Пройдено rounds 1–12 (ad-hoc PR-серії, кожен round = 1 PR на item, без
sprint-cap-у). Поточний стан:

| Item                         | Round-12 status                                                  | До closure (KPI-bound)             |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| **#6** localStorage          | 11 production-entries у allowlist (started at 19 — round-1)      | ~1 PR (10/13 mature plateau)       |
| **#8** `useApiForm` rollout  | 7/12 forms migrated (started at 0 — round-1)                     | ~3 PR (форми у finyk + onboarding) |
| **#15** strict-index pkg/app | 10/13 packages strict; усі 3 apps все ще на `false`-override     | ~3 PR (apps/web, server, mobile)   |
| **#17** mutation testing     | 1 module (`cloudSync/conflict/`); foundation only                | organic — не KPI-bound             |
| **#18** i18n catalog         | Phase 0 — auth migrated; `uk.ts` foundation у `@sergeant/shared` | organic — Phase 1+ за потреби      |

**Mandatory closure (KPI-bound):** ~7 PR-ів = 1 + 3 + 3.
**Organic (без фіксованого KPI):** items #17 і #18 — додаються коли
з'являється тригер (новий критичний модуль / запит на англомовний MVP).

PR-cap 300 LOC залишається; найбільші «об'ємні» — apps/web strict
flip (ймовірний spill на 2 PR через test-fixup mass-rewrite).

---

## 1. PR-розбивка

### Item #6 — localStorage allowlist burndown 11 → 10 (mature plateau)

| PR-id     | Назва                                                             | LOC | Files (≈)                                                                                      | Deps | AC / метрики                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | ----------------------------------------------------------------- | --- | ---------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R13.1** | refactor(finyk): finyk `storageManager` migrate to `safe*LS` (#6) | ~80 | `apps/web/src/modules/finyk/lib/storageManager.ts` · `__tests__/finyk-storage.test.ts` (новий) | —    | `apps/web/src/modules/finyk/lib/storageManager.ts` (останній module-wrapper в allowlist) мігрується на `safeReadLS<T>` / `safeWriteLS` / `safeRemoveLS` з `@shared/lib/storage/storage` · `lint:localstorage-allowlist` пройшов з headroom 0 на бюджеті 10 · 6 storage-primitives + 4 cloudSync internals лишаються legitimately (вони і є wrappers) · +RTL hardening test для Safari Private Mode / QuotaExceededError fallback |

### Item #8 — `useApiForm` rollout 7/12 → ~10/12 (mature plateau)

| PR-id     | Назва                                                                         | LOC  | Files (≈)                                                                                                                                                                | Deps  | AC / метрики                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R13.2** | refactor(finyk): `Budgets.tsx` rollout `useApiForm` + zod (#8)                | ~150 | `apps/web/src/modules/finyk/Budgets.tsx` · `apps/web/src/modules/finyk/components/__tests__/Budgets.form.test.tsx` (новий) · `packages/shared/src/forms/budgetSchema.ts` | —     | inline-форма budget-set (категорія + сума) переведена на `useApiForm` + zod · `useFormValidation` локальний hook прибрано · server-error mapping через `useApiForm.serverError` · 5 нових RTL-тестів (валідація суми / category required / submit-success / 400 category invalid → field error / 500 → toast) · forms-coverage 7/12 → 8/12 (66%) · `budget_set` event payload не змінюється                                             |
| **R13.3** | refactor(finyk): `ManualExpenseSheet` rollout `useApiForm` + zod (#8)         | ~180 | `apps/web/src/modules/finyk/components/ManualExpenseSheet.tsx` · `apps/web/src/modules/finyk/components/__tests__/ManualExpenseSheet.form.test.tsx` (новий)              | R13.2 | `useFormValidation` локальний hook прибрано · `useApiForm.register` з zod-резолвером для amount/category/note · `setValue` для toggle-логіки на category-chip-ах · 6 нових RTL-тестів (валідація amount > 0, category required, optional note, submit happy-path, 400 → field error, 500 → toast) · forms-coverage 8/12 → 9/12 (75%)                                                                                                    |
| **R13.4** | refactor(onboarding): `OnboardingFlow` modules-step rollout `useApiForm` (#8) | ~150 | `apps/web/src/core/onboarding/OnboardingWizard.tsx` (modules-step) · `apps/web/src/core/onboarding/__tests__/OnboardingFlow.form.test.tsx` (новий)                       | R13.2 | wizard modules-picks step (multi-checkbox) переведений на `useApiForm` + zod (custom resolver для array-validation) — uniform pattern для майбутнього serverization (sync-стейту onboarding-у через `cloudSync` v2) · 4 нових RTL-тести (empty-picks → CTA disabled, 1+ pick → CTA enabled, persist через page-refresh, server-error fallback) · forms-coverage 9/12 → 10/12 (83%) · `onboarding_step_completed` event payload без змін |

### Item #15 — strict-index per app: `tsconfig.strict.noUncheckedIndexedAccess: true`

| PR-id     | Назва                                                              | LOC  | Files (≈)                                                                                                                                                                                      | Deps          | AC / метрики                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R13.5** | feat(server): `apps/server` `noUncheckedIndexedAccess: true` (#15) | ~250 | `apps/server/tsconfig.json` (`noUncheckedIndexedAccess: true`) · ~25–30 production-fixes у `routes/`, `modules/*` через дефенсивні narrow-и + non-null assertion-и тільки де це seed/migration | —             | `pnpm --filter @sergeant/server typecheck` зелений · estimated ~100 errors, з них ~20 production-помилок (LWW apply / chat tool dispatch / migrations runner index-access), решта тестові — fix через `firstCall(fn)` helper / non-null `!` де assertion-style · 81 server-тест зелений · strict-coverage 10/13 packages + 1/3 apps                                                                                                                                   |
| **R13.6** | feat(mobile): `apps/mobile` `noUncheckedIndexedAccess: true` (#15) | ~200 | `apps/mobile/tsconfig.json` (вже `true` per `apps/mobile` — _verify_, інакше flip) · production-fixes у `app/_layout.tsx`, `lib/analytics.ts`, components                                      | —             | _Pre-condition_: `apps/mobile/tsconfig.json` уже `noUncheckedIndexedAccess: true` per `cat apps/mobile/tsconfig.json`. Якщо так — цей PR замість flip робить **production-fix sweep** (mock-важкі test-suites mass-fixup без зміни tsconfig: ~80 estimated errors → ~30 production + 50 test-asserts через `!`) · `pnpm --filter @sergeant/mobile typecheck` зелений · strict-coverage +1 app                                                                         |
| **R13.7** | feat(web): `apps/web` `noUncheckedIndexedAccess: true` (#15)       | ~280 | `apps/web/tsconfig.json` (`noUncheckedIndexedAccess: true`) · production-fixes по `core/`, `modules/`, `shared/` · можливе spill на 2 PR через test-fixup mass-rewrite                         | R13.5 + R13.6 | `pnpm --filter @sergeant/web typecheck` зелений · estimated ~150+ errors (найбільший за обсягом), переважно `chatActions/*`, `cloudSync/*`, `firstActionCard.tsx`, `dashboardCards.tsx`, `firstRealEntry.ts` · 178 web-тестів зелені · strict-coverage 10/13 packages + 3/3 apps = **closure 13/13** · потенційний spill: якщо PR > 350 LOC після production-fix-ів — ділиться на R13.7a (test-fixups через `firstCall` helper) і R13.7b (production narrow-и + flip) |

**Сума:** 7 PR-ів, ~1290 LOC (з потенційним spill R13.7 → 2 PR).
**Головний blocker chain:** R13.5 ⟶ R13.7 (server-side strict-index перший,
бо apps/web часто реекспортує типи з `apps/server` через `api-client`
contract-schema), R13.6 — паралельно. R13.1–R13.4 — паралельно з R13.5–R13.7.

---

## 2. Декомпозиція по пріоритетам

- **P0 (mandatory closure, ship зараз):** R13.1, R13.5, R13.6, R13.7 — items #6 і #15 закривають фінальні KPI.
- **P1 (drive-by на наступний round):** R13.2, R13.3, R13.4 — items #8 closure до 10/12 mature plateau (InputDialog лишається OOS — utility component без зовнішнього API; `WaitlistForm`-like — out of business-flow scope).
- **P2 (organic, не KPI-bound):** items #17 (mutation testing — наступний модуль = `cloudSync/queue`) і #18 (i18n Phase 1 — sync 10 keys + validation 20 keys, тригер = англомовний MVP-запит).

---

## 3. Risks

- **R13.5 / R13.7 — strict flip на apps/server / apps/web** найбільший за LOC.
  Якщо PR breaches 300-LOC cap після production-fix-ів — обов'язковий spill
  на 2 PR (test-fixup-и через `firstCall(fn)` helper мають жити окремо
  від production narrow-логіки, інакше reviewer не зможе reason about
  «що змінилось у runtime поведінці»).
- **R13.5 vs R13.7 ordering** — `apps/web` re-експортує contract-схеми з
  `apps/server` через `packages/api-client`. Якщо `apps/server` перший
  отримує `noUncheckedIndexedAccess: true`, нові `T | undefined` типи
  пропагуються в `api-client` → `apps/web` отримує free narrow-сигнал
  (зменшує R13.7 estimated errors на ~10–20%). Тому R13.5 → R13.7
  обов'язковий ordering, не паралельний.
- **R13.6 — потенційний no-op flip** — `apps/mobile/tsconfig.json` уже
  на `true` per поточному стану. Це треба верифікувати на старті PR; якщо
  так — PR замість flip робить production-fix sweep (mock-важкі test-suites
  mass-fixup) і lock у CI gating.
- **R13.2 / R13.3 / R13.4 — зростає LOC за рахунок RTL-тестів** — кожен
  form має ≥5 нових тестів (валідація / submit / server-error) per
  pattern, який встановили round-7…round-12. Reviewer не повинен
  «загубитись» серед test-LOC vs production-LOC: AC явно роздiляє
  «X нових RTL-тестів» від «production fix».
- **Item #8 finalна KPI = «mature plateau» 10/12, не 12/12** — `InputDialog`
  (utility component без власного API; используется як «one-shot rename»
  в nutrition / routine) і потенційно `OnboardingFlow` welcome-step
  (single-screen без validation) — **out-of-scope for `useApiForm` migration**:
  hook оптимізований під server-bound submits з isSubmitting/serverError.
  Документуємо рішення в [`./01-frontend-ergonomics.md` §3.1](./01-frontend-ergonomics.md)
  після round-13 closure.

---

## 4. Cross-cutting

- **Mobile parity для R13.6** — обов'язкова цього round-у (apps/mobile
  має RN-shell + Expo-shell, обидва треба flip-нути синхронно).
  `apps/mobile-shell` (Capacitor) — окремий tsconfig, перевіряємо
  на старті R13.6 і якщо потрібно — додаємо як R13.6b drive-by.
- **Result note** після завершення sprint-у: новий розділ §11.6
  «Round-13 closure summary» в [`./00-overview.md`](./00-overview.md)
  з KPI-числами before/after (форми 7/12 → 10/12, packages 10/13 → 10/13,
  apps 0/3 → 3/3, localStorage 11 → 10) + посилання на цей doc як
  historical record.
- **Audit-guard tests** — кожен PR з R13.x що додає `useApiForm`
  міграцію має regression test, що `useFormValidation` (старий локальний
  hook) **не імпортується** у migrated-файлі — інакше 50% переходу
  без видимого значення.
- **CI gating** — після R13.7 closure flip `noUncheckedIndexedAccess`
  на root `tsconfig.json` (за можливості) щоб новий код не починався
  з `false`-override. Якщо root рівень неможливий через legacy
  `packages/scripts/*` — лишаємо per-package overrides з документацією
  у [`./02-architecture-and-state.md` §1.0](./02-architecture-and-state.md).

---

## 5. Success metrics dashboard

| Метрика                         | Round-12 baseline | Round-13 target          | Source                                            |
| ------------------------------- | ----------------- | ------------------------ | ------------------------------------------------- |
| localStorage production-entries | 11                | 10 (mature plateau)      | `pnpm lint:localstorage-allowlist`                |
| `useApiForm` forms-coverage     | 7/12 (58%)        | 10/12 (83%)              | grep `useApiForm\|useFormValidation` у `apps/web` |
| Packages strict-index           | 10/13 (77%)       | 10/13 (no change)        | `pnpm typecheck` per package                      |
| Apps strict-index               | 0/3 (0%)          | 3/3 (100%)               | `pnpm --filter` typecheck                         |
| Total #6+#8+#15 mandatory PR-ів | 0 (round-13 plan) | 7 (closure round-13 end) | цей doc + cross-link з `./00-overview.md` §11.5   |

**Definition of done:** усі 7 PR merged + §11.6 Round-13 closure summary
доданий до overview-у з KPI-числами + audit-trail у CHANGELOG.md
під `[Unreleased] / Changed`.

---

## 6. Що НЕ входить у цей sprint

- **Item #17 mutation testing** — наступний модуль (`cloudSync/queue`)
  додається як окремий round-13b PR _organically_, тригер = post-incident
  або quarterly review, не KPI-bound.
- **Item #18 i18n Phase 1** — sync 10 keys + validation 20 keys додаються
  тригером = англомовний MVP-запит (питання користувача 1 з §11.5),
  не KPI-bound у поточному UA-only positioning.
- **Form-engine для `InputDialog`** — utility-component без external API,
  out-of-scope per §3 risks вище.
- **`tsconfig.strict` для tooling-package-iв** (`packages/scripts/*`,
  `tools/console/*`) — окремий backlog, не fronted-burndown.

---

## 7. Cross-references

- [`./00-overview.md` §11.5](./00-overview.md) — burndown narrative + KPI-table.
- [`./01-frontend-ergonomics.md` §3.1](./01-frontend-ergonomics.md) — Item #8 architecture rationale.
- [`./02-architecture-and-state.md` §1.0 / §2.2](./02-architecture-and-state.md) — Items #15 / #6.
- [`docs/i18n/readiness.md`](../../i18n/readiness.md) — Item #18 organic roadmap.
- [`docs/testing/mutation.md`](../../testing/mutation.md) — Item #17 organic roadmap.
- [`docs/launch/ftux-sprint-plan.md` §7a](../../launch/ftux-sprint-plan.md) — еталонний pattern «Sprint cleanup batch».
