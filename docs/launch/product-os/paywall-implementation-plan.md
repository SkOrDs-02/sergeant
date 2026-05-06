# Paywall implementation plan — PR-20 gate + sub-PR breakdown

> **Last validated:** 2026-05-06 by @Skords-01.
> **Next review:** 2026-06-06 (post-0010 phase 3 review).
> **Status:** Active — gating doc для tracker `PR-20` per [ftux-master-tracker §3.4](./ftux-master-tracker.md#34-хвиля-4--paywall--polish-week-5-6-4-pr).
> **Owner:** @Skords-01 + Devin (planning session 2026-05-06).

> Цей doc — **продовження** [`paywall-ux-placement.md`](./paywall-ux-placement.md) (PR-19 sketch). PR-19 закрив питання «де/коли/чому». Цей doc закриває «як саме реалізуємо», з якими залежностями, і **в якому порядку шипаємо**. Сам код PR-20 не пишеться у цьому PR — це планувальний gate-doc, що дозволяє наступному PR зайти у repo з мінімумом контексту.

---

## 1. TL;DR

Поточний blocker для PR-20 у full-impl формі — **відсутня billing-інфраструктура з [initiative 0010](../../initiatives/0010-revenue-first-launch.md) phases 1-3** (subscriptions migration, `getUserPlan(userId)`, Stripe Checkout endpoint). Рекомендована стратегія — **Path C: defer PR-20 impl до 0010 phase 3 merge** + paralelно зашити PostHog FF + dashboard scaffolding (поза codebase, у конфігах PostHog), щоб коли 0010 land-неться — PR-20 почався з готовим telemetry-stack-ом і не блокував conversion-метрику.

Ця рекомендація — **не імперативна**. Founder може переключитись на **Path B (FF-gated UI-stub now)**, якщо є бажання почати UX iteration на post-FTUX moment до того як billing live. Path A (full impl now) виключений — будь-який Stripe-touching код без 0010 = mock-чейн на 4-х рівнях, з гарантованим refactor-боргом.

**Поточний gate-state (2026-05-06):**

| Compoнент                                         | Статус            | Blocking PR-20?           |
| ------------------------------------------------- | ----------------- | ------------------------- |
| Sketch / decision doc — `paywall-ux-placement.md` | ✅ Landed (PR-19) | —                         |
| `subscriptions` migration                         | ❌ Missing        | Path A                    |
| `getUserPlan(userId)` server util                 | ❌ Missing        | Path A                    |
| `requirePlan` / `requireAiQuota` middleware       | ❌ Missing        | Path A                    |
| `/api/billing/checkout-session` endpoint          | ❌ Missing        | Path A                    |
| Stripe webhook handler + idempotent event-store   | ❌ Missing        | Path A (метрика)          |
| `usePlan()` hook + `billingKeys.plan()` RQ key    | ❌ Missing        | Path A, Path B (m'якший)  |
| `STRIPE_ENABLED` env-flag                         | ❌ Missing        | Path A                    |
| `FLAG_REGISTRY` `paywall_post_ftux_v1` entry      | ❌ Missing        | Path B / A                |
| 5 PostHog events (`PAYWALL_*`)                    | ❌ Missing        | Path B / A                |
| 3-arm copy A/B FF (`paywall_post_ftux_copy_v1`)   | ❌ Missing        | Path B / A                |
| `/pricing?via=post_ftux` route handler            | ❌ Stub-only      | Path B (lite stub OK) / A |
| `PostFtuxPaywallSheet.tsx` component + tests      | ❌ Missing        | Path B / A                |

> «Stub-only» для `/pricing` означає, що `apps/web/src/core/PricingPage.tsx` існує як WaitlistForm-anchor (per 0010 phase 4 spec), але без `?via=post_ftux` query-param recognition.

---

## 2. Three paths

### 2.1. Path A — Full impl after 0010 phase 3

**Передумови:** 0010 phases 1-3 merged → migrations live, `getUserPlan()` returns real plan, `usePlan()` hook reads RQ-cache backed by HTTP, Stripe Checkout endpoint accepts requests gated на `STRIPE_ENABLED=true`.

**Розбивка PR-20 у sub-PR-и (щоб кожен був ≤400 LOC AGENTS.md rule #5):**

| Sub-PR | Назва                                                           | LOC  | Deps                 |
| ------ | --------------------------------------------------------------- | ---- | -------------------- |
| PR-20a | feat(paywall): FF + PostHog events scaffolding                  | ~120 | 0010 phase 3 готова  |
| PR-20b | feat(paywall): PostFtuxPaywallSheet component + tests           | ~250 | PR-20a               |
| PR-20c | feat(paywall): wire from CelebrationModal close + 4s delay      | ~80  | PR-20b, FF flip plan |
| PR-20d | feat(paywall): /pricing query-param attribution + checkout-link | ~60  | PR-20a, 0010 phase 3 |

**Total:** ~510 LOC across 4 sub-PR. Spec ~400+ покриваємо.

### 2.2. Path B — FF-gated UI-stub now

**Передумови:** жодних backend-залежностей; усе client-side.

**Що шипаємо:**

- Усе те ж саме що Path A 20a/20b/20c, **але:**
  - `usePlan()` — temporary client-only hook, повертає `'free'` статично, з `// TODO(0010-phase-3): replace with billingKeys.plan() RQ query` anchor.
  - `/pricing?via=post_ftux` redirect — лінкує на існуючий `PricingPage.tsx`, без query-param recognition (TODO).
  - PostHog `OPENED_CHECKOUT` event firing з лейблом `intent_only=true` props (бо real checkout не існує).
  - `STRIPE_ENABLED` не читається — `PostFtuxPaywallSheet` показується тільки через FF, а не через `usePlan() === 'free' && env.STRIPE_ENABLED`.
- FF `paywall_post_ftux_v1` default OFF; на initial deploy — sheet не показується нікому, поки founder не flip-не вручну.
- 3-arm copy FF (`paywall_post_ftux_copy_v1`) налаштовується у PostHog dashboard, не в коді (legitimate бо коп-ї живуть у `packages/shared/src/lib/paywallCopy.ts` як const objects).

**Що НЕ шипаємо:**

- Будь-який Stripe SDK call — нема `apps/server/src/modules/billing/`, ніяких mocks щоб не накопичувати infra-боргу.
- `requirePlan` enforcement — sheet — pure UI, без серверного боку.
- Conversion-metric — `STRIPE_CHECKOUT_COMPLETED` event ніколи не вистрілить, бо checkout не існує. До 0010 phase 3 — funnel зупиняється на `OPENED_CHECKOUT(intent_only=true)`.

**Рifs:**

- Якщо 0010 затягне на 4+ тижні — sheet висить як «marketing-only paywall», який не може приймати платежі. Conversion-метрика не вимірюється.
- При 0010 phase 3 merge — потрібен follow-up PR, що ріже `usePlan()` stub і replace-ить на real RQ-hook, плюс flip-ає `intent_only` flag. ~80 LOC follow-up.

### 2.3. Path C — Deferred (recommended)

**Передумови:** жодних. Не ріжемо код зараз.

**Що робимо зараз:**

1. Цей plan-doc landing → закриває PR-20 у master-tracker §3.4 з status `Plan landed; impl gated on 0010 phase 3`.
2. PostHog dashboard scaffolding (поза codebase): створити Insights для 5 `PAYWALL_*` events (порожні до first event), щоб коли flag flip-неться — funnel рендерився.
3. У `docs/initiatives/0010-revenue-first-launch.md` фіксуємо у Phase 3 → `Acceptance criteria` перехресну вимогу — `usePlan()` hook має бути ready as RQ query before паралель-старт PR-20.
4. У `docs/launch/business/06-monetization-architecture.md` фіксуємо що `paywall_post_ftux_v1` FF — pre-зареєстрований у PostHog FF реєстрі, default OFF, перший flag-flip відбувається через 24h після 0010 phase 3 merge (для cohort cleanliness).

**Що ловимо натомість:**

- Жодного нового коду — нуль maintenance-боргу.
- При 0010 phase 3 merge — PR-20a/b/c/d можуть йти паралельно (різні файли), скорочує time-to-impl з ~2 тижнів до ~1.
- Funnel-метрика `paywall_conversion_rate ≥ 3%` — start-time-clock = реальний flag flip, а не fake-checkout proxy.

**Чому recommended:** Path B = «look-busy work» per master-tracker §0 freeze rules + ftux-master-tracker §7 «PR-стратегія». Користувач не виграє нічого від UI-stub-у paywall-у, який не приймає платежі. Founder тренувати UX iteration на нерух-функціоналі — anti-pattern (можна на staged-mock-cohort, але це ще більший maintenance).

---

## 3. File-level inventory (для Path A / B)

### 3.1. Нові файли

| Path                                                          | Опис                                                       | LOC est. |
| ------------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| `apps/web/src/core/paywall/PostFtuxPaywallSheet.tsx`          | Основний sheet component                                   | ~140     |
| `apps/web/src/core/paywall/PostFtuxPaywallSheet.test.tsx`     | RTL tests — open/close/CTA-clicks/a11y/frequency-cap       | ~180     |
| `apps/web/src/core/paywall/usePostFtuxPaywallTrigger.ts`      | Hook на CelebrationModal close → 4s delay → guard checks   | ~80      |
| `apps/web/src/core/paywall/usePostFtuxPaywallTrigger.test.ts` | Unit tests для guards (FF, plan, dismissed_at, cohort_age) | ~120     |
| `apps/web/src/core/paywall/usePlan.ts` (Path B only)          | Stub-hook → `'free'` + TODO-anchor для 0010 integration    | ~30      |
| `packages/shared/src/lib/paywallCopy.ts`                      | 3 copy variants α/β/γ як const objects + types             | ~60      |
| `packages/shared/src/lib/paywallCopy.test.ts`                 | Snapshot test що 3 variants не дрейфять без оновлення doc  | ~40      |

### 3.2. Файли, які edit-уються

| Шлях                                                   | Зміна                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `apps/web/src/core/lib/featureFlags.ts`                | Додати запис `paywall_post_ftux_v1` у `FLAG_REGISTRY` (default false, experimental:true) |
| `apps/web/src/core/onboarding/CelebrationModal.tsx`    | На close handler — викликати `usePostFtuxPaywallTrigger().request()`                     |
| `apps/web/src/core/observability/analytics.ts`         | Додати 5 типізованих helpers — `trackPaywallViewed`, etc.                                |
| `apps/web/src/core/observability/posthog.test.ts`      | Тести на event firing + props shape                                                      |
| `apps/web/src/core/PricingPage.tsx` (Path A only)      | Recognize `?via=post_ftux&variant=...` query — render attribution banner                 |
| `docs/launch/product-os/ftux-master-tracker.md`        | Bump §3.4 PR-20 row + §7 decisions log                                                   |
| `docs/launch/business/06-monetization-architecture.md` | Cross-link до цього doc-у у §1 ADR list (як ADR-1.11 placement-acceptance)               |

### 3.3. PostHog dashboard / FF (поза codebase)

| Action                                                          | Owner   | Коли               |
| --------------------------------------------------------------- | ------- | ------------------ |
| Reg `paywall_post_ftux_v1` FF у PostHog (default OFF)           | Founder | Path A/B start     |
| Reg `paywall_post_ftux_copy_v1` 3-arm experiment у PostHog      | Founder | Path A/B start     |
| Create dashboard «Paywall post-FTUX funnel» з 5 events          | Founder | Path C immediately |
| Set up alert: `views < 50/week after flag-flip` → Slack webhook | Founder | Path A merge       |

---

## 4. Test contract

PR-20 (any sub-PR) **НЕ merge-ається** без:

- ✅ RTL tests на `PostFtuxPaywallSheet.tsx` — open/close, focus trap, ESC=secondary, CTA-pair clicks, frequency-cap (mock `dismissed_at`), hard-stop cohort.
- ✅ Unit tests на `usePostFtuxPaywallTrigger.ts` — все 4 guards (FF, plan, dismissed_at, cohort_age) — кожен у positive/negative варіанті.
- ✅ Snapshot test на `paywallCopy.ts` — щоб founder не міг непомітно змінити tone winner-а.
- ✅ Integration test (playwright) — full flow: signup → first_real_entry → CelebrationModal close → 4s wait → sheet open → primary CTA → redirect to /pricing з правильним `?via=post_ftux&variant=...`.
- ✅ A11y test — axe-core run на opened sheet, expect 0 violations on serious/critical level.
- ✅ Storybook stories для `PostFtuxPaywallSheet` — 3 variants × `loading | open | dismissed` matrix (9 stories).

> Покриття цільове: ≥ 90% statement / ≥ 85% branch на `apps/web/src/core/paywall/`.

---

## 5. Rollout phases

PR-20 не є one-shot deploy. Phase plan:

| Фаза | Дія                                                                       | Тривалість | Who needs to act                |
| ---- | ------------------------------------------------------------------------- | ---------- | ------------------------------- |
| R0   | Code merged до `main` з FF default OFF                                    | Day 0      | Devin (PR-20a-d)                |
| R1   | Founder flip-ає FF на 5% rollout (1-arm `α`-variant only)                 | Day 1-3    | Founder                         |
| R2   | Якщо `views ≥ 50` за 3 дні і `errors == 0` → expand до 25%                | Day 4-7    | Founder + Devin (метрики)       |
| R3   | 3-arm split (α/β/γ weights `[0.34, 0.33, 0.33]`) на 100% trafic-у         | Day 8-30   | Founder                         |
| R4   | Winner promotion: arm з найвищим conversion → permanent (rest as backlog) | Day 31+    | Founder + Devin (FF cleanup PR) |

---

## 6. Risk register

| Risk                                                                | Likelihood | Impact | Mitigation                                                                  |
| ------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------- |
| 0010 phase 3 затягне → Path C deferred indefinitely                 | Medium     | High   | Path B fallback задокументований; founder може переключитись будь-коли      |
| Sheet з'являється коли юзер вже dismissed CelebrationModal swipe-ом | Low        | Medium | Trigger hook читає `lastClosedAt` тимстамп, гарантує race-free order        |
| Frequency cap (14d) не enforce-иться через localStorage clear       | Medium     | Low    | `dismissed_at` mirroring у server `/me/preferences` після 0010 phase 3      |
| Copy A/B winner-критерій недостатньо samples (≤200 views/arm)       | High       | Low    | Hold-period: 2 тижні мінімум, якщо < 200 views — wait + log warn у PostHog  |
| `?via=post_ftux` query-param губиться при OAuth-redirect назад      | Medium     | Medium | Stash у `sessionStorage` перед redirect, відновити після callback           |
| PostHog SDK не loaded → events lost                                 | Low        | Low    | Use `analytics.ts` queue; replay після SDK load (вже є у `posthog.test.ts`) |

---

## 7. 0010 dependency gate matrix

| 0010 phase | Що шипаємо у 0010                               | Що відкриває для PR-20                                        |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Phase 0    | docs-only (this initiative + ADR-list)          | —                                                             |
| Phase 1    | `subscriptions` table migration + seed defaults | Server-side `getUserPlan()` стає implementable                |
| Phase 2    | `requireAiQuota` + `requirePlan` middleware     | API gates існують (для not-PR-20, але related)                |
| Phase 3    | `usePlan()` hook + `billingKeys.plan()` RQ key  | **PR-20a/b/c можуть стартувати** — primary gate               |
| Phase 4    | Pricing page + Apple/Google sign-in             | `/pricing` query-param recognition (PR-20d) можливий          |
| Phase 5    | Stripe webhook + idempotent event-store         | Real checkout intent → `STRIPE_CHECKOUT_COMPLETED` event live |
| Phase 6    | LiqPay (UA) phase 2                             | Out-of-scope для PR-20 (single-provider PR-20)                |

---

## 8. Acceptance criteria recap (forwarded from PR-19)

PR-20 (last sub-PR before flag-flip) НЕ merge-ається без задоволення усіх 8 acceptance criteria з [`paywall-ux-placement.md` §10](./paywall-ux-placement.md#10-acceptance-criteria-для-pr-20). Цей doc додає 9-й:

9. **Path-decision logged** у §7 Decisions log майстер-трекера: «Path A merged at <date>» / «Path B merged at <date>» / «Path C deferred from <date> to <date>».

---

## 9. Cross-refs

- [`paywall-ux-placement.md`](./paywall-ux-placement.md) — UX sketch + decision doc (PR-19 output).
- [Initiative 0010 — revenue-first-launch](../../initiatives/0010-revenue-first-launch.md) — phases 0-6 для billing-stack.
- [`06-monetization-architecture.md`](../business/06-monetization-architecture.md) — ADR list (1.1–1.10), risk register, technical skeleton v2.
- [FTUX master-tracker §3.4](./ftux-master-tracker.md#34-хвиля-4--paywall--polish-week-5-6-4-pr) — PR-19/PR-20 у sprint-плані.
- [FTUX master-tracker §7 → «Paywall»](./ftux-master-tracker.md#7-decisions-log) — decision-log.
- [`apps/web/src/core/onboarding/firstRealEntry.ts`](../../../apps/web/src/core/onboarding/firstRealEntry.ts) — trigger event.
- [`apps/web/src/core/onboarding/CelebrationModal.tsx`](../../../apps/web/src/core/onboarding/CelebrationModal.tsx) — hand-off modal.
- [`apps/web/src/core/lib/featureFlags.ts`](../../../apps/web/src/core/lib/featureFlags.ts) — `FLAG_REGISTRY` куди реєструємо `paywall_post_ftux_v1`.
- [`apps/web/src/core/PricingPage.tsx`](../../../apps/web/src/core/PricingPage.tsx) — `/pricing` редирект-таргет.

---

> **Path-decision audit-trail:** після того як founder вибере Path A/B/C — append-only addendum у §10 цього doc-у (не edit, append) з datestamp + 1-line обґрунтування. Після того як вибір зроблений і impl стартує — `Status` цього doc-у переходить з `Active — gating doc` на `Active — impl tracking` (Path A/B) або `Active — deferred` (Path C).

## 10. Path-decision audit-trail (append-only)

### 2026-05-06 — Path A selected

- **Вибір:** Path A (Full impl у 4 sub-PR після 0010 phase 3 — recommended).
- **Founder:** dmytro.s.stakhov.
- **Контекст:** PR-19 (#1989) + PR-20 plan (#1993) merged; founder підтвердив під час Devin-review-thread.
- **Що це означає operationally:**
  - PR-20 impl-кодинг (`PR-20a/b/c/d`) **не стартує до merge 0010 phase 3** (`usePlan()` RQ-hook landed in `apps/web/src/core/billing/hooks/usePlan.ts`).
  - Поки 0010 phase 3 у роботі — цей doc лишається `Active — gating doc`.
  - Як тільки 0010 phase 3 merge → `Status` цього doc-у переходить на `Active — impl tracking`, відкривається PR-20a (FF + telemetry, ~120 LOC).
  - Path B (FF-gated UI-stub) і Path C (defer) — більше не на столі; не активуємо їх навіть як fallback без явного re-decision у цьому ж §10.
- **Перевірка готовності 0010 phase 3:** перед стартом PR-20a — guard-checklist у [`paywall-ux-placement.md` §10](./paywall-ux-placement.md#10-acceptance-criteria-для-pr-20) acceptance criterion #6 (`usePlan()` повертає `'pro'`/`'free'` без 500 на повний Pro/Free cohort у staging).
- **Conversion-window start-clock:** не стартує з цього decision; стартує з реального flag-flip `paywall_post_ftux_v1=on` у production (на cohort-flag-flip = day-0 для 30-day window `STRIPE_CHECKOUT_COMPLETED / PAYWALL_POST_FTUX_VIEWED ≥ 3%`).
- **Next-action owner:** Devin → моніторити merge-event `0010-revenue-first-launch` phase 3 → автоматично відкрити PR-20a draft після того як `apps/web/src/core/billing/hooks/usePlan.ts` з’явиться у main.
