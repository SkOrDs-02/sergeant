# FTUX onboarding roast — Day 0-7 (2026-05-13)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11. **Status:** Active

> Прожарка #1/10 серії «10 прожарок», запущеної 2026-05-13. Скоуп — `apps/web/src/core/onboarding/**`, `apps/web/src/core/app/WelcomeScreen.tsx`, FTUX hero, peek backdrop, first-run sheets, CelebrationModal та перші 7 днів у хабі. Перспектива — продуктовий UX-аудит очима нового користувача, який дає продукту 30-60 секунд перш ніж піти.
>
> **Cross-refs:**
> [`docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`](./archive/2026-05-03-ftux-onboarding-roast.md) — оригінальна прожарка (frozen reference) ·
> [`docs/audits/2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md) — попередній технічний UX-план ·
> [`docs/audits/2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md) — post-onboarding UX-прожарка (day 0-7) ·
> [`docs/audits/2026-05-06-ux-roast-pr-plan.md`](./2026-05-06-ux-roast-pr-plan.md) — виконавчий план UX-прожарки ·
> [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) — поточний SSOT FTUX-стану ·
> [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md) — frozen sprint-плани.
>
> **Audit-freeze note (2026-05-13).** Master tracker §1 декларує freeze
> на нові `docs/audits/` файли до 2026-06-02. Цей документ створено за
> прямим запитом founder-а (parent сесія, 2026-05-13) у межах
> roast-циклу «10 прожарок» — freeze свідомо переоприділяється. Інші
> межі freeze (заборона на `docs/initiatives/*`) тримаються.

## TL;DR

Структурний стан FTUX **значно покращився** з 2026-05-03 roast і
2026-05-05 mega-roast: PR-04 (hero copy), PR-05 (demo-first), PR-06
(canonical brand), PR-07 (PWA prompt), PR-11 (goal-aware
`rankFirstActionCandidates`), PR-12 in-flight (orchestrator) — це
системний прогрес, не косметика. Funnel-аналітика на місці, 8 PostHog
events працюють, dashboards задокументовані, retention-cohort живий
з ~2026-04-28.

Залишається **п'ять болів на «полірувальній»-стадії** і **три
структурні борги**, що не закриваються copy-tweak-ами:

1. **CelebrationModal — generic «Що далі» tip + generic CTA** (B-11 /
   P2-15) — закрито у цьому PR.
2. **FTUX SLO відсутні** — declarative `ftux-slo.yml` потрібен як
   контракт між роботою команди й алертом — закрито у цьому PR.
3. **PR-08 — застарілі audit-tracker-и у `docs/audits/`** засмічують
   індекс (3 з 2026-04-28). У scope master-tracker-а, ⏳ open.
4. **CelebrationModal CTA не маршрутизує** — copy обіцяє «Записати ще
   витрату», але клік дише модалку, а не відкриває add-sheet. P3,
   тримати у скоупі PR-12 orchestrator-а.
5. **OnboardingProgress (HubHeroBlock) — pre-PR-09 obsolete UI** для
   users без goals: показує «2/4 розділів» у місці, де PR-09
   (outcome-card) має ставити value-card. ⏳ Open в PR-09.
6. **Mobile FTUX parity** — `apps/mobile/src/core/dashboard/HubDashboard.tsx`
   не має CelebrationModal-еквівалента, тож B-11 / P2-15 fix не
   витече на мобільну сесію автоматично. ⏳ Wave 4 PR-21.
7. **Per-module empty-state copy A/B** — PR-10 на плані, контракт ще
   не визначений (3 варіанти × 4 модулі = 12 копій + analytics-cohort).
   ⏳ Wave 2 PR-10.
8. **Email drip 0/1/3 day** — P3-16 з оригінального roast-а
   (D2-D7 gap), все ще в backlog. Mitigation: PWA push
   permissions / day-2-3 nudges (S4.x done). Активний email drip = P3.

## P0 (закрити цього спринту)

> Все, що ламає first-impression або обіцяє неправду. Список — short on purpose.

### P0-1. CelebrationModal — generic «Що далі» tip (B-11) — ✅ Закрито у цьому PR

- **Файл:** [`apps/web/src/core/onboarding/CelebrationModal.tsx:229-244`](../../apps/web/src/core/onboarding/CelebrationModal.tsx) (pre-PR), [`packages/shared/src/lib/onboardingCelebrations.ts`](../../packages/shared/src/lib/onboardingCelebrations.ts) (canonical copy).
- **Проблема:** після первого реального запису користувач бачив один
  рядок «Продовжуй додавати записи. Після кількох днів отримаєш перші
  інсайти та персональні поради.» — ідентичний для finyk / fizruk /
  routine / nutrition. На celebration-моменті це читається як **ще
  один TODO**, а не як **value-promise**. Audit B-11 §2.9 у
  2026-05-03 roast це фіксував body-only.
- **Дія:** Add `nextStepTip` у `FIRST_ENTRY_CELEBRATIONS`, per-module:
  - finyk → «Додай ще 2-3 витрати — Sergeant покаже категорії, де гроші тікають швидше.»
  - fizruk → «Заплануй наступне тренування — і ритм утвердиться за два-три тижні.»
  - routine → «Завтра я нагадаю про звичку — два дні підряд і мозок підхопить.»
  - nutrition → «Залогуй обід чи вечерю — побачиш баланс БЖВ за день.»
- **Acceptance:** audit-guard у [`packages/shared/src/lib/onboardingCelebrations.test.ts`](../../packages/shared/src/lib/onboardingCelebrations.test.ts) блокує повернення до generic copy («продовжуй додавати записи», «кількох днів отримаєш»).

### P0-2. CelebrationModal — generic «Продовжити» CTA (P2-15) — ✅ Закрито у цьому PR

- **Файл:** [`apps/web/src/core/onboarding/CelebrationModal.tsx:247-254`](../../apps/web/src/core/onboarding/CelebrationModal.tsx) (pre-PR).
- **Проблема:** primary CTA повертав «Продовжити» — generic word, що
  ігнорує модуль, який щойно flipped first-real-entry. Audit P2-15 §4
  у 2026-05-03 roast: «крім «продовжити» — обіцяти **наступну дію**
  («Записати ще витрату», «Запланувати тренування»)».
- **Дія:** Add `primaryCtaLabel` у `FIRST_ENTRY_CELEBRATIONS`,
  per-module (imperative, ≤ 24 chars, no trailing punctuation).
- **Acceptance:** audit-guard у тестах перевіряє distinctness серед 4
  модулів + блокує fallback до `"Продовжити"` для known modules.
- **Що НЕ зроблено в цьому PR:** routing — CTA все ще закриває модалку
  без push-у в add-sheet. Це свідомо: routing-coupling розширює
  surface для P2-полішу. Власник наступної ітерації — PR-12
  orchestrator [#2014](https://github.com/Skords-01/Sergeant/pull/2014).

### P0-3. FTUX SLO declarative contract (M-10) — ✅ Закрито у цьому PR

- **Файл:** новий [`docs/observability/ftux-slo.yml`](../observability/ftux-slo.yml).
- **Проблема:** FTUX-метрики жили у `posthog-ftux-dashboards.md` як
  таблиця saved insights, але **немає declarative-контракту**, що
  перевіряється у CI / alerting. Master-tracker §6.3 (M-10) тримає
  proposed yaml в inline-блоці з 2026-05-05, але файл не з'явився.
- **Дія:** Створено `docs/observability/ftux-slo.yml` з 4 SLO
  (activation conversion, TTV p50, D1 retention, celebration
  visibility) + alert thresholds + owner + PostHog insight name.
- **Acceptance:** файл лінкований у master tracker §6.3 (status bump
  у цьому ж PR). Alerting wiring (PostHog Alerts + Sentry webhook) —
  follow-up за SRE-task, не блокує SLO publish.

## P1 (наступний спринт)

### P1-1. OnboardingProgress на дашборді — value-misalignment (#9 з 2026-05-03 roast)

- **Файл:** [`apps/web/src/core/onboarding/OnboardingProgress.tsx`](../../apps/web/src/core/onboarding/OnboardingProgress.tsx) + [`apps/web/src/core/hub/HubHeroBlock.tsx:122`](../../apps/web/src/core/hub/HubHeroBlock.tsx).
- **Проблема:** progress bar показує «2/4 розділів активовано» — це
  **obsoleteness-метрика**, не value. Користувач, що відкрив Sergeant
  заради finyk, бачить «50%» і вважає, що до 100% треба заповнити
  fizruk + nutrition, які йому не потрібні.
- **Стан:** частково мітіговано через `ValueProgressBar.tsx` для
  users з goals, але fallback на `OnboardingProgress` лишається у
  goal-less cohort.
- **Дія (PR-09):** на cold-start (немає `first_real_entry`) показувати
  **outcome-card**, не activation-bar. Behind `ftux_outcome_card_v1`
  feature flag.
- **Власник:** PR-09 з master tracker §3.2.

### P1-2. Mobile FTUX parity для B-11 / P2-15 fix (M-6)

- **Файл:** `apps/mobile/src/core/dashboard/HubDashboard.tsx` (TODO:
  створити CelebrationModal-equivalent через
  `@sergeant-mobile/components/ui/CelebrationModal`, що вже існує як
  generic-celebration шар).
- **Проблема:** copy-зміни в `packages/shared/src/lib/onboardingCelebrations.ts`
  технічно вже доступні мобільному застосунку (shared package), але
  немає mobile-side рендеру CelebrationModal на first_real_entry. Web
  → mobile parity gap.
- **Дія (PR-21):** wave 4 mobile FTUX parity sweep, dependent на
  PR-09 + PR-11 + PR-15.

### P1-3. PR-08 — archive stale audits + delete `.replit`

- **Файли:**
  - `docs/audits/2026-04-28-implementation-roadmap.md` → archive
  - `docs/audits/2026-04-28-ux-improvement-plan.md` → archive (вже консолідовано в master tracker)
  - `docs/audits/2026-04-28-ux-ui-audit.md` (вже archived)
  - `.replit` → delete (Replit-deploy більше не активний шлях)
- **Проблема:** `docs/audits/` indexed (per README.md status table) і
  Sergeant founder-а тікає чек ока на stale-tracker-и при кожному
  pre-roast scan-і. PR-08 у scope master tracker-а §3.1, статус ⏳.
- **Дія:** не в скоупі цієї прожарки — окремий PR-08.

## P2 (постлоунч / якщо є час)

### P2-1. CelebrationModal CTA маршрутизує у add-sheet (post P0-2)

- Після того як `primaryCtaLabel` per-module → природний наступний
  крок: клік «Записати ще витрату» → закриває модалку **і** відкриває
  finyk-add-sheet. Те ж саме для fizruk («Запланувати наступне») та
  nutrition («Додати ще прийом»).
- **Дія:** PR-12 (`useOnboardingState`) — додати `nextActionAfterCelebration`
  affordance, що `usePrimaryAffordance()` ranger підхоплює відразу
  після close-у CelebrationModal-а.

### P2-2. Per-module empty-state copy A/B (PR-10)

- Кожен модуль має свій pre-first-entry empty-state. PR-10 заплановано
  з 3 варіантами × 4 модулі, behind `ftux_empty_v1` PostHog flag.
- **Дія:** не в скоупі — PR-10 з master tracker §3.2.

### P2-3. Insights teaser у CelebrationModal (B-10)

- Після першого real-entry показувати на 5 секунд cross-module USP-promise:
  «Завтра ти побачиш, як цей запис впливає на твій тиждень.»
- Ризик overtease (peek-backdrop pattern), потребує copy-reviewer-а.
- **Дія:** Sprint 6 carryover S6.10 (master tracker §2.2), ⏳ open.

## Прогрес виконання

Закрито в PR цього циклу:

- ✅ **B-11 §2.9** — module-aware `nextStepTip` у `FIRST_ENTRY_CELEBRATIONS`.
- ✅ **P2-15 §4** — module-aware `primaryCtaLabel` (зняв generic «Продовжити»).
- ✅ **M-10** — declarative `docs/observability/ftux-slo.yml` створений.
- ✅ Audit guards у `onboardingCelebrations.test.ts` (3 нові tests):
  - non-empty + length-budget contract на обидва поля
  - regex-guard блокує regression до «продовжуй додавати записи / кількох днів отримаєш»
  - regex-guard блокує regression до generic «Продовжити» CTA для known modules + distinctness invariant

Status bump у master tracker:

- Master tracker §8.4 M-10 → `✅ Closed`.
- Master tracker §8.1 — B-11 / P2-15 не у P0 table; додано рядок у нову мега-roast registry §8.4.

Outstanding (не у scope цього PR, лишається у master tracker):

- ⏳ S6.3 (P2-15 CelebrationModal CTA promise) — у scope master tracker §2.2,
  ROUTING piece (P2-1 вище) ще open.
- ⏳ S6.8, S6.10, S6.11, S6.12, S6.13 — Sprint 6 carryover.
- ⏳ PR-08 (cleanup .replit + archive stale audits).
- ⏳ PR-09 (cold-start outcome-card, замінить `OnboardingProgress`).
- ⏳ PR-10 (empty-state A/B).
- ⏳ PR-13 (goal-first wizard A/B, S5.1).
- ⏳ PR-15 (mobile PostHog parity — код ready, чекає EAS Secret).
- ⏳ PR-16 (a11y manual audit).
- ⏳ PR-21 (mobile FTUX parity, includes B-11 / P2-15 mobile-side).

## Що НЕ покрито цією прожаркою

- **Paywall у FTUX** (`paywall-ux-placement.md` / `paywall-implementation-plan.md`) — окрема ініціатива (PR-19 merged, PR-20 чекає 0010 phase 3).
- **What's new modal** (PR-18) — окремий surface, в flight.
- **SQLite migration** (Stage 8/9) — ізольована ініціатива, явно поза скоупом per parent prompt.

## Метрики, які треба моніторити після цього PR

- `celebration_shown` event payload розширено фактично-render-нутим
  `nextStepTip` й `primaryCtaLabel`? — ні, тільки `ttvMs`, `source`,
  `moduleId`. **Action item:** додати `tipVariant` / `ctaLabel` у
  payload — окремий tiny-PR після того, як ця копія landed (запобігає
  silent-copy-regression у dashboard data).
- `ftux_activation_conversion` SLO має бути green з поточним cohort
  (target ≥ 30%, alert < 25% / 3d) — перевірити після ship.

## Висновок

FTUX у Sergeant з 2026-05-03 → 2026-05-13 пройшов системний дюйм: 6
з 6 P0 з оригінального roast-а закрито (4 раніше, 2 — у цьому PR).
Залишається фінальна полірувальна стадія: routing-coupling у P2-1,
mobile parity у P1-2, і кілька Sprint 6 carryover items, що чекають
свого слоту. Pre-activation funnel виглядає здоровим, але **D1-D7
retention loop без email drip** все ще робить D2-D7 gap слабкою
ланкою.

> **Що далі:** master tracker `docs/launch/product-os/ftux-master-tracker.md`
> залишається SSOT — туди вливаються status updates з цього PR. Наступну
> прожарку (Прожарка #2/10) запускати тільки після того, як master tracker
> закриє ще ≥3 з open-карти (target — PR-09 + PR-13 + PR-15).
