# FTUX sprint plan — від прожарки до PR-ів

> **Last validated:** 2026-05-03 by @Skords-01 (статус-калібрація S0). **Next review:** 2026-08-01.
> **Status:** Active

> Implementation roadmap для 22 рекомендацій з [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../audits/2026-05-03-ftux-onboarding-roast.md).
> 5 спринтів × 2 тижні (+S0 1 тиждень, +S5 опційний) ≈ 10–12 тижнів.
> Ціль: **2–3× activation funnel** (з baseline >25% до >40-60% per [`01-monetization-and-pricing.md`](./01-monetization-and-pricing.md#7-activation-метрики)).
>
> **Cross-refs:**
> [`docs/audits/2026-05-03-ftux-onboarding-roast.md`](../audits/2026-05-03-ftux-onboarding-roast.md) — джерело рекомендацій ·
> [`01-monetization-and-pricing.md` §7](./01-monetization-and-pricing.md#7-activation-метрики) — activation baseline ·
> [`04-launch-readiness.md` §4.2](./04-launch-readiness.md) — funnel definitions ·
> [`docs/feature-flags.md`](../feature-flags.md) — flag conventions ·
> [`docs/playbooks/add-onboarding-step.md`](../playbooks/add-onboarding-step.md) — додавання кроку у `ONBOARDING_STEPS`.

---

## 0. Передумови

1. **Sprint 0 не пропускати.** Без PostHog (або еквівалента) усі наступні зміни — це сліпі гіпотези. _Update 2026-05-03: основна частина S0 уже зроблена (S0.1, S0.2). Реальна робота — S0.3 (mobile parity), S0.4 (9 unfired canonical events), S0.5 (dashboards docs); деталі — у §2._
2. **One change per sprint cluster.** Не правити одразу 18 пунктів P0/P1/P2 — це вб'є фокус і не дасть зрозуміти що саме спрацювало.
3. **PR-cap 300 LOC** (не рахуючи snapshot-тестів і копій). Більший — ділиться.
4. **Кожен помітний UX-зсув йде під feature-flag.** Поки немає feature-flag-сервісу — `localStorage.experiment.<name>=on/off` + URL-параметр для QA. Після S0 → PostHog feature flags.
5. **Mobile parity** до кінця S3 — обов'язкова. Інакше web/mobile FTUX-розривається.
6. **Copy review.** Усі копірайт-зміни проходять через 1 reviewer не з команди (founder-друг, маркетолог, або хтось з ЦА). Інженер не пише маркетинг.
7. **Result note після кожного спринту** в `docs/launch/post-mortems/<sprint>-<theme>.md` з PostHog before/after.

---

## 1. Глобальна карта

| Спринт         | Тема                                             | Гіпотеза                                                                | Метрика успіху                                                         |
| -------------- | ------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **S0** (1 т.)  | **Аналітика наживу**                             | Funnel-метрики ~80% точності → можемо приймати рішення                  | Усі 14+5 events пишуться в PostHog · D1/D7 dashboard зеленіє           |
| **S1** (2 т.)  | **Чесний value-prop + чесні обіцянки**           | Hero benefit-copy + усунення confetti-обману + disclaimer на peek       | Wizard→first-entry conversion ↑ 5pp · "rage-quit" (close < 30s) ↓ 30%  |
| **S2** (2 т.)  | **Goal-aware first action + чесний PresetSheet** | Primary action слідує за intent; nutrition/fizruk без "пустого sheet'у" | First-entry rate per active module ↑ 10pp · TTV p50 < 90 sec           |
| **S3** (2 т.)  | **Reward у правильний момент + value-progress**  | Confetti на real entry · CelebrationModal → next-action promise         | Day-1 retention ↑ 5pp · % users з 2+ entries у session 1 ↑ 8pp         |
| **S4** (2 т.)  | **Demo-first + day-1-7 retention loop**          | "Подивитись приклад" як first-class · push day-2/3 · email drip 0/1/3   | D7 retention ↑ 3pp · share-of-traffic що пройшов demo ≥ 15%            |
| **S5** (1 т.)? | **Goal-first wizard A/B** (опц.)                 | Onboarding починається з outcome, модулі — під ціль                     | Якщо A/B виграв на ≥5pp retention → раскат; інакше rollback з learning |

**Сумарно:** 9–11 PR-серій, ~25 PR-ів, 10 тижнів роботи (+ опційний 11-й).

---

## 2. Sprint 0 — Analytics live (1 тиждень)

**Goal:** PostHog (або Mixpanel) writing 14+ events з [`01-monetization-and-pricing.md` §7](./01-monetization-and-pricing.md#7-activation-метрики). Live dashboard з activation funnel.

**Чому окремо:** одне інженерне завдання, не змішане з UX. Зробити швидко, не плутати з copy-роботою.

### Status check (verified 2026-05-03)

Перевірив код у `main` після перших спроб взяти S0.1 — частина S0 уже зроблена попередніми PR-ами. Рекалібрував статус нижче, щоб не дублювати роботу:

- **PostHog SDK уже вмонтовано** у web ([`apps/web/src/core/observability/posthog.ts`](../../apps/web/src/core/observability/posthog.ts)) з lazy `import("posthog-js")`, queue до завершення init, `sanitize_properties`, `identified_only` profiles, EU host default.
- `posthog-js@^1.372.3` у `apps/web/package.json`, `initPostHog()` викликається з [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx) через `requestIdleCallback`.
- `identifyPostHogUser` / `resetPostHog` викликаються з [`AuthContext.tsx`](../../apps/web/src/core/auth/AuthContext.tsx) на login/logout з `buildIdentifyTraits` (`vibe`, `plan`, `locale`, `signup_date`).
- Super-properties (`platform`, `is_capacitor`) реєструються через `posthog.register` всередині `initPostHog`.
- `<PageviewTracker />` змонтований у [`App.tsx`](../../apps/web/src/core/App.tsx) з `sanitizeUrl()` для magic-link токенів.
- `.env.example` (root) має закоментовані `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST`; setup задокументований у [`docs/observability/frontend.md`](../observability/frontend.md).
- CI workflow `.github/workflows/posthog-release-annotation.yml` уже постить annotation на release.

Що реально лишилось ⇒ див. колонку `Status` у таблиці нижче.

### PR-розбивка

| PR-id    | Назва                                                                                | LOC  | Files (≈)                                                                                                                                  | Deps      | Status (2026-05-03)                                                                                                                                                                                                                                                                                                                                                                                            | AC                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S0.1** | feat(analytics): swap stub for PostHog SDK (web)                                     | ~120 | `apps/web/src/core/observability/posthog.ts` · `apps/web/src/main.tsx` · `apps/web/package.json` · root `.env.example`                     | —         | ✅ **DONE in main** (попередні PR-и). Лишилось тільки виставити `VITE_POSTHOG_KEY` в Vercel + локальному `apps/web/.env.local` (founder-task). Stub fallback працює для CI без ключа.                                                                                                                                                                                                                          | `ONBOARDING_STARTED` бачимо в PostHog UI ≤5 хв · stub лишається як fallback при missing key                                                                                                                              |
| **S0.2** | feat(analytics): identify + super-properties                                         | ~80  | `apps/web/src/core/observability/posthog.ts` · `apps/web/src/core/observability/identifyTraits.ts` · `apps/web/src/core/auth/AuthContext.tsx` | S0.1      | ✅ **DONE in main**. `buildIdentifyTraits` шле `vibe` / `plan` / `locale` / `signup_date`; `posthog.register` виставляє `platform` / `is_capacitor` як super-properties. Залишається верифікація: чи distinctIds анонімних не зливаються з identified — це чисто PostHog dashboard-перевірка після першого live-tour.                                                                                       | Funnel "wizard_started → wizard_completed → first_real_entry → day1_return" з proper user IDs                                                                                                                            |
| **S0.3** | feat(analytics): mobile parity (Expo + Capacitor)                                    | ~150 | `apps/mobile/src/lib/analytics.ts` (расширити) · новий `apps/mobile/src/observability/posthog.ts` · `apps/mobile-shell/src/...`            | S0.1      | ❌ **TODO**. Сьогодні `apps/mobile/src/lib/analytics.ts` — console-only stub, у `apps/mobile/package.json` нема `posthog-js`. Викликається лише з `useHints.ts` / `FirstActionHeroCard.tsx` / `SoftAuthPromptCard.tsx` (3 події). Жоден FTUX-event не пишеться у спільний funnel. Потрібен mobile-варіант `posthog.ts` (через `posthog-react-native` або CDP API), `source: "mobile-expo" / "mobile-capacitor"`. | Mobile FTUX events у тому ж funnel, source-prop ("web" / "mobile-expo" / "mobile-capacitor")                                                                                                                             |
| **S0.4** | feat(analytics): fire missing canonical events                                       | ~80  | `apps/web/src/core/onboarding/CelebrationModal.tsx` · `OnboardingWizard.tsx` · `HubDashboard.tsx` · `ModuleChecklist.tsx` · finyk hooks    | S0.1      | ❌ **TODO** (gap більший, ніж початкова оцінка). Перевірив `ANALYTICS_EVENTS` vs grep `trackEvent(ANALYTICS_EVENTS.…)`: **9 канонічних подій визначено, але не fired нікуди у web** (без урахування billing/HUBCHAT placeholders): `CELEBRATION_SHOWN`, `FIRST_REAL_ENTRY`, `FTUX_TIME_TO_VALUE`, `MODULE_CHECKLIST_SHOWN/STEP_DONE/DISMISSED`, `ONBOARDING_STEP_VIEWED/COMPLETED/SKIPPED`, `BUDGET_SET`, `HINT_DISMISSED/COMPLETED`, `STREAK_MILESTONE_REACHED`. Без них wizard-funnel і celebration-funnel зеленіють криво. | Усі 9 канонічних подій fired (з відповідним payload contract); funnel `started → step_viewed → step_completed → vibe_picked → first_action_picked → ftux_preset_picked → first_real_entry → celebration_shown` без gap-ів |
| **S0.5** | docs(observability): PostHog FTUX dashboards                                         | 0    | `docs/observability/posthog-ftux-dashboards.md` (новий)                                                                                    | S0.1–S0.4 | ❌ **TODO**. Файл не існує. Потрібен runbook: 5 saved insights (activation funnel, TTV histogram, vibe→first-entry per module, D1/D7 retention by signup-cohort, celebration drop-off) + alert thresholds + screenshot-links з UI.                                                                                                                                                                              | 5 saved insights + screenshot links; runbook як добавити нові                                                                                                                                                            |

**Скоригований обсяг S0:** ~230 LOC коду (S0.3 + S0.4) + docs (S0.5). S0.1 / S0.2 = тільки provisioning credentials (founder-task ~10 хв) і dashboard-верифікація (founder-task ~15 хв).

**Порядок взяття:** S0.5 (docs) → S0.4 (web events) → S0.3 (mobile). S0.5 першим — щоб контракти dashboard-ів продиктували, як саме fired payload для S0.4. S0.3 останнім — після того як web payload устаткувався.

**Hosted vs self-hosted:** для S0 — hosted Cloud EU (10k events/month free). Self-host пізніше, якщо знадобиться (privacy / GDPR).

**Risks:**

- 2FA / SSO для PostHog account (founder-task — robotic note: створити acc заздалегідь). _Update 2026-05-03: account уже існує, ключ уже на Vercel._
- iOS App Tracking Transparency для mobile — пропустити, бо internal-only трекаємо.
- Stub-режим має лишитись як fallback (CI без `VITE_POSTHOG_KEY` не падає). _Уже так працює — `posthog.ts` no-ops без ключа._
- Mobile parity (S0.3) має не дублювати web `analytics.ts` — спільні рядки винести в `packages/shared` або шарити транспорт через `@sergeant/shared`. Інакше дріфт між web і mobile невпинно.
- S0.4 `FIRST_REAL_ENTRY` потребує single source of truth що рахується «реальним entry». Сьогодні це imply-нуто через `firstActionTakenAt` у onboarding storage — треба зафіксувати у `packages/shared` як helper, щоб web і mobile не розійшлися.

**Out of scope для S0:** A/B testing infrastructure (S2/S5), email events (драйп-стек ще не існує).

---

## 3. Sprint 1 — Чесний value-prop (2 тижні)

**Goal:** Wizard → перший вхід в дашборд = чесний emotional contract. Прибрати fake-celebrations, fake-cifry, feature-orientation, "click here"-CTA.

### PR-розбивка

| PR-id    | Назва                                                | LOC | Files (≈)                                                                                                                | Deps    | AC / метрики                                                                                                         |
| -------- | ---------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------- |
| **S1.1** | feat(onboarding): rewrite hero copy (benefit-driven) | ~80 | `apps/web/src/core/onboarding/OnboardingWizard.tsx:237-264` · `apps/mobile/src/onboarding/OnboardingWizard.tsx` (parity) | S0 done | Final copy schválen copy-reviewer-ом · 3-5 кандидатів збережено в PostHog feature-flag для A/B · "rage-quit" tracked |
| **S1.2** | feat(onboarding): outcome CTA on welcome             | ~40 | `apps/web/src/core/app/WelcomeScreen.tsx` · `apps/mobile/src/app/WelcomeScreen.tsx`                                      | S1.1    | CTA copy uniform web+mobile · feature-flag готовий до A/B                                                            |
| **S1.3** | refactor(onboarding): remove wizard-confetti         | ~30 | `apps/web/src/core/onboarding/OnboardingWizard.tsx:388-401` · `apps/mobile/src/onboarding/OnboardingWizard.tsx`          | —       | wizard-finish → плавна transition без celebration-modal · CelebrationModal лишається тільки на real entry            |
| **S1.4** | feat(welcome): peek backdrop disclaimer              | ~25 | `apps/web/src/core/app/WelcomeScreen.tsx:9-48`                                                                           | —       | disclaimer "Це приклад. Твій дашборд буде твоїм." видно з blurred-state, не attention-pull                           |
| **S1.5** | refactor(onboarding): rename "Налаштувати модулі"    | ~20 | `apps/web/src/core/onboarding/OnboardingWizard.tsx`                                                                      | —       | label → "Що це за модулі?"; expanded-state містить корисну інформацію                                                |

**Сума:** 5 PR-ів, ~195 LOC.

**Risks:**

- Copy-перепис без маркетингового рев'ю → залучити copy-reviewer-а.
- Розкатати все одразу без feature-flag → не зможемо швидко відкатати. **Rule:** S1 → flag-on-by-default, але є rollback URL `?ftux=v1`.

**Cross-cutting:**

- Mobile parity для S1.1, S1.2, S1.4 — обов'язково цього спринту.
- Result note: `docs/launch/post-mortems/s1-honest-valueprop.md`.

---

## 4. Sprint 2 — Goal-aware first action + чесний PresetSheet (2 тижні)

**Goal:** Перша рекомендована дія слідує за **intent користувача**, не за hardcoded array. Backup: чесний UX для nutrition/fizruk без "пустого sheet'у".

### PR-розбивка

| PR-id     | Назва                                                 | LOC  | Files (≈)                                                                                                                                                                           | Deps      | AC / метрики                                                                                                                |
| --------- | ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| **S2.1**  | feat(onboarding): goal-aware `pickPrimary`            | ~120 | `packages/shared/src/lib/onboarding.ts` (логіка) · `apps/web/src/core/onboarding/FirstActionSheet.tsx:32-75` · тести                                                                | S0 + S1.1 | користувач з `finykBudget` → primary = `finyk` · fallback на PRIORITY якщо goals нема · % primary-clicks vs primary-shown ↑ |
| **S2.2a** | feat(nutrition): prefill channel + 3 presets          | ~180 | `apps/web/src/modules/nutrition/AddMealSheet.tsx` (prefill через sessionStorage, як у Finyk) · `apps/web/src/core/onboarding/PresetSheet.tsx:120-145` (items: 3) · `presetApply.ts` | S2.1      | nutrition presets: «Омлет 350 ккал» · «Салат 250 ккал» · «Яблуко 80 ккал» · prefill open-and-submit ≤2 tap                  |
| **S2.2b** | feat(fizruk): prefill channel + 3 presets             | ~180 | `apps/web/src/modules/fizruk/WorkoutStart.tsx` (prefill) · `PresetSheet.tsx:120-145` · `presetApply.ts`                                                                             | S2.1      | fizruk presets: «Розминка 10 хв» · «Прогулянка 30 хв» · «HIIT 20 хв» · prefill ≤2 tap                                       |
| **S2.3**  | refactor(onboarding): inline chips for "Інший модуль" | ~80  | `apps/web/src/core/onboarding/FirstActionSheet.tsx:126-334`                                                                                                                         | —         | Замість accordion — inline chip-row з усіх picks · primary chip візуально prominent · "switch-rate" tracked                 |
| **S2.4**  | refactor(finyk): preset sub-tile copy hints           | ~20  | `apps/web/src/core/onboarding/PresetSheet.tsx:80-112`                                                                                                                               | —         | sub-tile: «Кава ~60-95 ₴» (hint), не «їжа · введи суму» (taxonomy)                                                          |

**Сума:** 5 PR-ів, ~580 LOC. S2.2a і S2.2b паралельно — різні модулі.

**Decision: варіант А vs Б для S2.2** — обираємо Б (правильний). Якщо AddMealSheet структурно не готовий, fallback — варіант А (skip empty sheet) у тому ж PR.

**Risks:**

- S2.2 потенційно стає rabbit-hole. **Mitigation:** заглушка-A в одному PR + повний-Б у наступному.
- Goal-aware primary → A/B обов'язково (PostHog feature-flag) — інакше regression-ризик для users без goals.

**Cross-cutting:**

- Mobile FirstActionHeroCard ще без PresetSheet (per audit). У S2 для mobile робимо лише S2.1 (priority logic). Mobile presets — S3+.

---

## 5. Sprint 3 — Reward у правильний момент + value-progress (2 тижні)

**Goal:** Кожен click точно reward'иться там, де є value, а не там, де є clicks. Прогрес-бари — про користувача, не про систему.

### PR-розбивка

| PR-id     | Назва                                                        | LOC  | Files (≈)                                                                                                                       | Deps     | AC / метрики                                                                                                               |
| --------- | ------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| **S3.1**  | feat(onboarding): module-aware CelebrationModal headlines    | ~100 | `apps/web/src/core/onboarding/CelebrationModal.tsx` · `packages/shared/src/lib/onboarding-celebrations.ts` (i18n table) · тести | S0 done  | headline залежить від moduleId · копірайт зрозумілий, без "brag about engineering speed" · TTV-числа лишаються в analytics |
| **S3.2**  | feat(softauth): gain-first copy + A/B fallback               | ~80  | `apps/web/src/core/auth/SoftAuthPromptCard.tsx`                                                                                 | S0 done  | копія A/B-готова, no-fear primary · B-варіант з fear-copy збережено для тестування                                         |
| **S3.3a** | feat(hub): OnboardingProgress as value-bar (finyk + routine) | ~150 | `apps/web/src/core/hub/HubDashboard.tsx:500-506` · новий `apps/web/src/core/hub/ValueProgressBar.tsx`                           | S0, S2.1 | finyk: «Бюджет 30k ₴ — записано 0 ₴» · routine: «Звичка X — 0/30 днів» · бар не рендериться без goals                      |
| **S3.3b** | feat(hub): value-bar for fizruk + nutrition                  | ~100 | `ValueProgressBar.tsx` (extension)                                                                                              | S3.3a    | fizruk: «3×/тиждень — 0 з 3» · nutrition: «Підтримка ваги — 0 страв сьогодні»                                              |
| **S3.4**  | refactor(hub): MotivationalFooter conditional                | ~50  | `apps/web/src/core/hub/HubDashboard.tsx`                                                                                        | —        | footer не рендериться до `hasRealEntry` · опційно: preview-card "Ось що ти побачиш через тиждень"                          |
| **S3.5**  | refactor(hub): single-hero rule strengthening                | ~60  | `apps/web/src/core/hub/HubDashboard.tsx:409-440`                                                                                | —        | ModuleChecklist рендериться **тільки** якщо `hasRealEntry && sessionDays <= 7` · до 1st entry — лише FirstAction           |

**Сума:** 6 PR-ів, ~540 LOC.

**Risks:**

- S3.3 module-specific логіка — почати з finyk + routine, інші лишити з generic.
- CelebrationModal i18n table → потенційно багато рядків, винести в окремий module.

**Cross-cutting:**

- **Mobile parity повна.** CelebrationModal на mobile зараз not wired (per попередній audit) — цей спринт включає wiring.

---

## 6. Sprint 4 — Demo-first + retention day-1-7 loop (2 тижні)

**Goal:** Користувач, що хоче "пощупати" — отримує demo. Користувач, що пропав на день 2-3 — отримує push-нагадування або email.

### PR-розбивка

| PR-id    | Назва                                               | LOC  | Files (≈)                                                                                                          | Deps           | AC / метрики                                                                                                               |
| -------- | --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **S4.1** | feat(welcome): "Подивитись приклад" first-class CTA | ~120 | `apps/web/src/core/app/WelcomeScreen.tsx:153-183` · `apps/mobile/src/app/WelcomeScreen.tsx` · demo-seeding logic   | S0 done        | 3rd CTA на welcome · activates `?demo=1` без URL · banner "Це приклад. Створити свій?" у demo-state · demo→wizard% tracked |
| **S4.2** | feat(retention): push day-2 / day-3 reminders       | ~150 | `apps/web/src/core/notifications/useRoutineReminders.ts` (extension) · server-side scheduling                      | S0 + push perm | Day 2 / Day 3 push з deep-link до останньо-активного модуля · permission gідно вимагається +1 день після Celebration       |
| **S4.3** | feat(retention): email drip 0/1/3 (mvp)             | ~250 | `apps/server/src/email/...` (новий) · `apps/server/src/auth.ts` (post-create hook) · копія Day 0/1/3               | email stack    | drip активується через user creation hook · opt-out у footer · copy reviewed                                               |
| **S4.4** | feat(finyk): inline manual-mode banner              | ~80  | `apps/web/src/modules/finyk/FinykApp.tsx` · `presetApply.ts` (untie `enableFinykManualOnly` from preset-only path) | —              | користувач, що відкрив Finyk напряму без preset, бачить inline "Без банку? Продовжити вручну" — не gate                    |
| **S4.5** | feat(settings): onboarding replay                   | ~100 | `apps/web/src/core/settings/Settings.tsx` · `apps/web/src/core/onboarding/OnboardingWizard.tsx` (read-only mode)   | —              | Settings → "Подивитись tour" з icon (компас) · replay не ламає user state · викликається в read-only mode                  |

**Сума:** 5 PR-ів, ~700 LOC.

**Risks:**

- S4.3 (email) потребує email-стек (Resend/SendGrid). Якщо нема — обмежитись push-only у S4, drip → S5+ або окремий проект.
- Push permission на 2-й день — потребує тригерити `usePushNotifications` у новий момент. Малий refactor.
- iOS push для Capacitor build — окремий cert-flow (founder-task).

---

## 7. Sprint 5 (опціонально) — Goal-first wizard A/B (1-2 тижні)

**Goal:** Перевірити радикальну гіпотезу — wizard починається не з модулів, а з **outcome**. Це переробка mental model.

### PR-розбивка

| PR-id    | Назва                                                    | LOC  | Files (≈)                                                                                                      | Deps              | AC / метрики                                                                                                                          |
| -------- | -------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **S5.1** | feat(onboarding): goal-first variant behind feature-flag | ~250 | `apps/web/src/core/onboarding/OnboardingWizard.tsx` (новий step before WelcomeOneScreen) · `OutcomePicker.tsx` | S0 + PostHog FF   | Step 1: «Що тобі важливо зараз?» з 4-6 опціями (економити / рухатись / скинути 3 кг / не забивати на справи / просто подивитись)      |
| **S5.2** | feat(experiments): A/B 50/50 setup + tracking            | ~80  | `apps/web/src/core/experiments/wizard-variant.ts` (новий)                                                      | S5.1              | half users — current; half — goal-first · PostHog cohort tracked: D1/D7 retention, % з 2+ entries у session 1, TTV                    |
| **S5.3** | decision: rollout або rollback (PR-only after 2 weeks)   | <50  | feature flag flip                                                                                              | S5.2 + 2 тиж дані | якщо goal-first ≥+5pp retention → flip default · інакше rollback + result-note `docs/launch/post-mortems/s5-goal-first-experiment.md` |

**Risks:**

- Goal-first = переробка wizard-state model. Не легке.
- Outcome-based options потребують copy-кваліфікації — та сама проблема, що в S1.

---

## 8. Roll-up: success metrics dashboard

| Метрика                                  | Baseline (зараз)           | Target після 5 спринтів |
| ---------------------------------------- | -------------------------- | ----------------------- |
| Wizard completion rate                   | unknown (sketchy)          | >90%                    |
| Wizard → first real entry (TTFR)         | unknown                    | >50% within session     |
| First-entry TTV (p50)                    | unknown                    | <90 sec                 |
| 2+ модулів entry within 72h (activation) | >25% (per `01-…` baseline) | >40%                    |
| D1 retention                             | >30% (target)              | >35%                    |
| D7 retention                             | >20% (target)              | >25%                    |
| Soft-Auth conversion                     | unknown                    | >30%                    |
| Demo-mode usage                          | <1% (URL-only)             | ≥15% of welcome traffic |
| Permission grant rate (push)             | unknown                    | >50%                    |

**Все це слід трекати з S0.** Без baselines з PostHog — будь-яке "виграш" буде vanity number.

---

## 9. Що НЕ входить у цей план

- **OpenClaw / founder-tooling.** Це окремий сюрфейс (Telegram), не consumer FTUX. Див. [`openclaw-roadmap.md`](./openclaw-roadmap.md).
- **Глибокий cross-module insights** (USP-демонстрація). Це окремий проект (Insights v2), що залежить від AI-стеку. Поточний план фокусується на FTUX-funnel'і, не на product expansion.
- **Paywall / monetization triggers.** Pre-condition: ≥4 спринти FTUX-роботи. Paywall в S6+ — після того як retention стабільний (per [`01-monetization-and-pricing.md` §7](./01-monetization-and-pricing.md#7-activation-метрики)).
- **Rebrand / module renaming.** «Finyk vs Fizruk inconsistency» — brand-розмова, не FTUX-fix. Окрема ініціатива.

---

## 10. TL;DR / executive summary

- **5 спринтів, 10 тижнів. S0 + S1 + S2 + S3 + S4 (+S5 опц.).**
- **Кожен спринт завершує одну тему повністю** з PostHog-зміреним before/after.
- **Sprint 0 — обов'язкова передумова.** Без аналітики все наступне сліпе.
- **Sprint 1 — найбільший impact на perception** (copy, confetti, peek). Очікуваний ↑5pp completion.
- **Sprint 2 — найбільший impact на activation** (goal-aware primary, чесний preset). Очікуваний ↑10pp first-entry.
- **Sprint 3-4 — retention loops**, що замикають funnel.
- **Sprint 5 — radical experiment** (goal-first wizard). Високий upside, високий risk.

Якщо команда — 1-2 розробника + founder, це реалістичний 10-тижневий план. Якщо команда менше (1 person, half-time) — додавай 50% buffer, тобто 15 тижнів.

**Single biggest risk:** не зробити S0 серйозно і впасти у S1 з "ну приблизно копія краща". Без metrics — це просто перестановка букв.
