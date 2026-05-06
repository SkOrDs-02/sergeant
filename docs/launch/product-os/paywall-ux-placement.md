# Paywall UX placement — sketch + decision doc

> **Last validated:** 2026-05-06 by @Skords-01.
> **Next review:** 2026-06-06 (post-PR-20 implementation review).
> **Status:** Active draft (sketch). Закриває tracker `PR-19` per [ftux-master-tracker §3.4](./ftux-master-tracker.md#34-хвиля-4--paywall--polish-week-5-6-4-pr).
> **Owner:** @Skords-01 + Devin (sketch session 2026-05-06).

> Тільки UX-placement sketch для FTUX-релевантного paywall touch-point-у. Технічний skeleton (Stripe, webhooks, gating-middleware, ADR list) — у [Архітектура монетизації v2](../business/06-monetization-architecture.md) та [Initiative 0010](../../initiatives/0010-revenue-first-launch.md). Цей документ — **тільки про те, ДЕ і КОЛИ** показуємо paywall новому юзеру, а не **ЯК** його технічно реалізуємо. Імплементація — `PR-20`.

---

## 1. TL;DR

Перший paywall-контакт нового юзера = **post-first-real-entry sheet** (sheet, не модал, не повноекранна wall) з offering 14-day Pro trial, БЕЗ payment method, з очевидним «Залишитись на free» secondary CTA. Тригер — той самий момент, який зараз стріляє `first_real_entry` PostHog event ([`apps/web/src/core/onboarding/firstRealEntry.ts`](../../../apps/web/src/core/onboarding/firstRealEntry.ts)) і відкриває [`CelebrationModal`](../../../apps/web/src/core/onboarding/CelebrationModal.tsx). Sheet з'являється **після** celebration-аніма­ції (4 sec delay), не замість. FF-gated за `paywall_post_ftux_v1` (default OFF до 0010 phase 3).

**Чому не «у момент signup»:** [audit-roast 2026-05-03 §B-1](../../audits/2026-05-03-ftux-onboarding-roast.md) і вся `disciplined-helper` рамка PR-04 — paywall до першої цінності = бренд-самогубство. Чекаємо на `first_real_entry` як proof-of-fit signal.

---

## 2. Decision context

### 2.1. Що FTUX-master-tracker вимагає від PR-19

Per `ftux-master-tracker.md` §3.4:

| Поле              | Вимога                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Назва             | `docs(paywall): UX placement sketch + decision doc`                                                 |
| Розмір            | ~250 рядків doc                                                                                     |
| Deps              | —                                                                                                   |
| Метрика виконання | Paywall placement clearly defined (читач знає де/коли/чому без додаткових питань)                   |
| Метрика для PR-20 | `paywall_conversion_rate ≥ 3%` за перші 30 днів post-impl (на free→Pro upgrade за активний контакт) |

### 2.2. Що НЕ робить цей PR

- ❌ Не вирішує **ціну** (це ADR-1.9 у [06-monetization-architecture.md §1](../business/06-monetization-architecture.md)).
- ❌ Не вирішує **plan-cache TTL / RQ keys / webhook idempotency** (це ADR-1.3, ADR-1.8 там само).
- ❌ Не пише **код** (це PR-20).
- ❌ Не вибирає **provider** (Stripe-primary, ADR-1.1, прийнято).
- ❌ Не draft-ить **pricing page** (це окремий PR за межами FTUX-tracker — див. [Initiative 0010 фаза 4 PR 4.2](../../initiatives/0010-revenue-first-launch.md)).

### 2.3. Які рішення цей PR закриває

1. **Placement** — куди саме у FTUX-flow вставляємо paywall touch-point.
2. **Trigger event** — який існуючий або новий event запускає sheet.
3. **Frequency / dismissal** — скільки разів і як часто можна показати.
4. **Friction model** — soft (sheet з opt-out) vs hard (повноекранна wall з required action).
5. **Copy candidates** — 3 варіанти hero-копії для A/B post-launch.
6. **Telemetry contract** — які `PAYWALL_*` events стріляємо і з якими props.
7. **Acceptance criteria for PR-20** — checklist, який PR-20 має задовольнити перед merge.

---

## 3. Placement candidates considered

Розглянуто 5 кандидатів. Скоринг — суб'єктивний 1-5 за `match-with-disciplined-helper` (бренд), `proof-of-fit-strength` (юзер вже відчув цінність?), і `dev-cost` (зараз vs пізніше).

| #   | Кандидат                                              | Бренд | Proof | Dev-cost | Total | Висновок                       |
| --- | ----------------------------------------------------- | ----- | ----- | -------- | ----- | ------------------------------ |
| A   | Hard wall у момент signup                             | 1     | 1     | 5        | 7     | ❌ Reject (brand-killing)      |
| B   | Soft sheet після `first_real_entry`                   | 5     | 5     | 4        | 14    | ✅ **Selected**                |
| C   | Limit-aware — 5+ AI requests / day-2 cohort           | 4     | 4     | 2        | 10    | 🔵 Phase 2 (post-PR-20)        |
| D   | Day-7 streak celebration moment                       | 4     | 5     | 3        | 12    | 🔵 Phase 2                     |
| E   | Module-level locked features (e.g. AI insights gated) | 3     | 3     | 2        | 8     | ❌ Reject (module-fragmenting) |

### 3.1. Чому не A (hard wall у момент signup)

- Юзер ще не побачив цінність → conversion ≤ 1%, а bounce — 50-70% (SaaS heuristics, Mind the Product 2024).
- Прямо суперечить `disciplined-helper` копірайту PR-04 («менше хаосу, більше зробленого»).
- Закриває майбутні telemetry-cohort можливості (юзер, що bounce-нув, не лишає `first_real_entry` patterns для cold-start outcome-card PR-09).

### 3.2. Чому не E (module-level gates)

- Локалізує paywall у 4-х `surfaces` (Фінік / Фізрук / Рутина / Харчування) — 4× UX-сурфейсів, 4× телеметричних воронок, 4× edge cases для plan-cache invalidation.
- Створює асиметрію: «Фізрук free, але з графіками лише по AI insights» = friction без чіткої проп-вели.
- Кращий power-user-варіант (виглядає як «гурман» monetization), але slow-burn для 30-day metric. PR-20 має MVP-target.

### 3.3. Чому B (post-first-real-entry sheet) — selected

- **Одна точка enforcement** — sheet один, surface один, telemetry один. Audit-able.
- **Перетинає proof-moment** — юзер щойно побачив, що `first_real_entry` + Sergeant дає йому immediate feedback (CelebrationModal). Це найкоротша дистанція між «це працює» і «давай Pro».
- **Reversible** — sheet, не modal-blocker. «Залишитись на free» = повертається у Hub без штрафу. PostHog `PAYWALL_DISMISSED_AS_FREE` логується для cohort segmentation.
- **Не ламає cold-start outcome-card (PR-09)** — sheet поверх dashboard, а не замість. PR-09 рендерить як було, sheet відкривається 4 sec пізніше.

---

## 4. Selected solution: post-first-real-entry sheet

### 4.1. Trigger contract

```ts
// Стається у CelebrationModal close handler
// (apps/web/src/core/onboarding/CelebrationModal.tsx)
//
// 1. CelebrationModal завершує fade-out (≈600ms)
// 2. Затримка 4 sec → юзер встигає глянути на dashboard
// 3. PostFtuxPaywallSheet.open() якщо:
//    a. FF `paywall_post_ftux_v1` = ON
//    b. usePlan() === 'free'
//    c. localStorage.getItem('paywall_post_ftux_v1.dismissed_at') відсутній
//       АБО (now - dismissed_at) > 14 days
//    d. user.created_at < 90 days ago (anti-stale-cohort guard)
```

### 4.2. UX sketch (text wireframe)

```
┌──────────────────────────────────────────────┐
│  Sheet (bottom-up на mobile, modal на desktop) │
├──────────────────────────────────────────────┤
│                                                │
│  [Hero copy — див. §6]                         │
│                                                │
│  [Sub copy — proof-anchor + value-prop]        │
│                                                │
│  ┌─ pricing tease ─────────────────────────┐  │
│  │   14 днів Pro безкоштовно                │  │
│  │   • без payment method                   │  │
│  │   • повна функціональність              │  │
│  │   • можна вимкнути будь-коли             │  │
│  │   • після trial — повертається до free  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  [Primary CTA: «Спробувати 14 днів Pro»]       │
│  [Secondary CTA: «Залишитись на free»]         │
│                                                │
│  [Footer link: «Що таке Pro? →» (/pricing)]    │
└──────────────────────────────────────────────┘
```

**A11y:**

- `role="dialog"` + `aria-labelledby` на hero-копію.
- Focus trap у sheet, focus return на dashboard після close.
- ESC = secondary CTA action (не просто close — фіксується як explicit `dismiss_as_free`).
- VoiceOver/TalkBack: hero копія читається першою, потім pricing tease, потім CTA pair. Trial-bullet-list — `<ul role="list">`.

### 4.3. Frequency cap + dismissal

| Подія               | Дія                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Primary CTA click   | `PAYWALL_OPENED_CHECKOUT` → redirect to `/pricing?via=post_ftux` (PR-20 wires до Stripe Checkout) |
| Secondary CTA click | `PAYWALL_DISMISSED_AS_FREE` → `dismissed_at = now` у localStorage → close                         |
| ESC                 | Те саме що Secondary CTA                                                                          |
| Backdrop click      | NO-OP (не вважаємо за dismiss — занадто легко випадково тицьнути)                                 |
| Re-trigger          | Дозволяється не раніше ніж через 14 днів від `dismissed_at`                                       |
| Hard-stop           | Якщо юзер dismissed 2 рази підряд — sheet більше не показуємо (сегмент `paywall_fatigue_cohort`)  |

### 4.4. Що robustness гарантує

- Якщо PostHog не завантажився — sheet все одно відкривається (не блокуємо UX на телеметрію).
- Якщо `usePlan()` ще `loading` — не відкриваємо sheet, чекаємо resolve. Не показуємо paywall Pro-юзеру через race condition.
- Якщо FF flip-нувся з ON на OFF після того як sheet відкрився — sheet залишається відкритим (юзер вже бачить — закриваємо тільки за його дією).

---

## 5. Telemetry contract (PostHog events)

| Event                           | Trigger                                         | Props                                                                     |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `PAYWALL_POST_FTUX_VIEWED`      | Sheet open (after 4s delay)                     | `variant_id`, `cohort_age_days`, `first_real_entry_at`, `time_to_view_ms` |
| `PAYWALL_POST_FTUX_CTA_CLICKED` | Primary CTA click                               | `variant_id`, `time_to_click_ms`                                          |
| `PAYWALL_DISMISSED_AS_FREE`     | Secondary CTA / ESC                             | `variant_id`, `time_to_dismiss_ms`, `is_repeat_dismissal`                 |
| `PAYWALL_FATIGUE_HARD_STOP`     | 2nd consecutive dismiss → sheet permanently off | `total_dismissals`, `cohort_age_days`                                     |
| `PAYWALL_OPENED_CHECKOUT`       | Redirect до `/pricing?via=post_ftux`            | `variant_id` (передається у URL для атрибуції на checkout)                |

**Voronka для метрики `paywall_conversion_rate ≥ 3%`:**

```
PAYWALL_POST_FTUX_VIEWED
  → PAYWALL_POST_FTUX_CTA_CLICKED          (CTR-1)
    → PAYWALL_OPENED_CHECKOUT              (intent)
      → STRIPE_CHECKOUT_COMPLETED          (paid conversion ← з 0010 webhook)
```

`paywall_conversion_rate = STRIPE_CHECKOUT_COMPLETED / PAYWALL_POST_FTUX_VIEWED` (за 30-day cohort).

---

## 6. Copy variants (3 candidates)

> Всі — UA-only (per [Q4 decision у master-tracker §7](./ftux-master-tracker.md#7-decisions-log)). Tone match: `disciplined-helper` (як winner PR-04). Жоден не повторює axis-and §4.1 master-tracker D-I (ті — для welcome-screen, ці — для proof-moment).

### 6.1. Variant α — Outcome-anchored

- **Hero:** «Один запис є. Тепер — інструменти, щоб з нього виріс тиждень.»
- **Sub:** «14 днів Pro безкоштовно: AI-інсайти, хмарна синхронізація, експорт. Без карти. Можна вимкнути коли захочеш.»
- **Primary CTA:** «Спробувати 14 днів Pro»
- **Secondary CTA:** «Залишитись на free»

### 6.2. Variant β — Disciplined / matter-of-fact

- **Hero:** «Перший крок — за тобою. Решту — спростимо.»
- **Sub:** «Pro додає те, що економить час: AI-розбір, sync між пристроями, експорт у CSV. 14 днів безкоштовно.»
- **Primary CTA:** «Підключити Pro на 14 днів»
- **Secondary CTA:** «Не зараз»

### 6.3. Variant γ — Self-sovereignty (data-as-asset)

- **Hero:** «Твої дані заслуговують на бекап. І на дорогу далі.»
- **Sub:** «Pro: хмарна синхронізація, AI-інсайти, експорт. Без зобов'язань — 14 днів trial без карти.»
- **Primary CTA:** «14 днів Pro безкоштовно»
- **Secondary CTA:** «Поки що — free»

### 6.4. A/B-план (PR-20 + 2 тижні після)

- 3 варіанти, weights `[0.34, 0.33, 0.33]`, PostHog FF `paywall_post_ftux_copy_v1`.
- Winner-критерій: `STRIPE_CHECKOUT_COMPLETED / PAYWALL_POST_FTUX_VIEWED` за cohort.
- Min sample size: 200 views per arm (інакше — не promote, продовжуємо ротацію).
- Loser-arms — у backlog для post-launch ітерації.

---

## 7. Dependencies на 0010 (Initiative «revenue-first-launch»)

PR-20 без цих елементів існувати не може:

| 0010 element                                    | Статус (2026-05-06)       | PR-20 чекає?                                         |
| ----------------------------------------------- | ------------------------- | ---------------------------------------------------- |
| ADR-0001 monetization-architecture              | accepted (06-mon-arch §1) | ❌ ні (вже є)                                        |
| `subscriptions` table migration                 | proposed                  | ✅ так — потрібен `getUserPlan(userId)`              |
| `requirePlan` / `requireAiQuota` middleware     | proposed                  | ✅ так — без них paywall не enforce-ить нічого       |
| `/api/billing/checkout-session` endpoint        | proposed                  | ✅ так — для `PAYWALL_OPENED_CHECKOUT` redirect      |
| Stripe webhook handler + idempotent event-store | proposed                  | 🟡 для PR-20 — ні (тільки для conversion-метрики)    |
| `usePlan()` hook + RQ key `billingKeys.plan()`  | proposed                  | ✅ так — sheet gate-ить через `usePlan() === 'free'` |
| `STRIPE_ENABLED` env-flag                       | accepted, default false   | ✅ так — PR-20 респектує цей flag                    |

**Висновок:** PR-20 у full-impl формі **залежить** від 0010 phases 1-3. Як FF-gated UI-stub з `usePlan()`-stub, що повертає `'free'` — може бути scaffold-ом, але без real conversion-funnel метрика `paywall_conversion_rate ≥ 3%` не вимірюється.

---

## 8. Out of scope для PR-19/PR-20

- ❌ Pricing-page redesign (окремий PR у 0010 phase 4).
- ❌ LiqPay integration (phase 2 per ADR-1.1).
- ❌ Email-кампанії та analytics-dashboard для billing (post-MVP per 06-mon-arch §0).
- ❌ Refund / proration policy (passive Stripe handling per 06-mon-arch §0).
- ❌ Localization beyond UA (post-launch backlog per Q4).
- ❌ Mobile parity для paywall (це PR-21 mobile FTUX parity sweep).

---

## 9. Open questions (для founder ↔ Devin sync перед PR-20)

1. **14-day cap для re-trigger** — достатньо чи треба 30 днів? Аргумент за 14: швидший ітераційний цикл для копії-винника. За 30: менш-настирно. **Default тут: 14, можна змінити в PR-20 review.**
2. **Backdrop click як NO-OP** — чи дозволяти все ж dismiss-як-free? **Default тут: NO-OP, перестраховка від accidental dismiss.**
3. **Hard-stop після 2 dismissals** — vs 3 dismissals? **Default тут: 2, бо 30-day cohort короткий.**
4. **Trial без payment method** — підтверджено по ADR-1.5 (accepted у 06-mon-arch §1). Не питання, але закріпимо ще раз для протоколу.
5. **`/pricing` redirect query-param** — `?via=post_ftux` достатньо, чи додавати `?variant=α|β|γ` для атрибуції до конкретного arm? **Default тут: додати variant_id.**
6. **CelebrationModal → 4 sec → paywall delay** — vs 2 sec? vs trigger через user-initiated dashboard scroll? **Default тут: 4 sec константа, переглядається у PR-20 retro.**

---

## 10. Acceptance criteria для PR-20

PR-20 НЕ merge-ається без:

- [ ] `PostFtuxPaywallSheet.tsx` створений у `apps/web/src/core/paywall/` із sketch-у §4.2.
- [ ] FF `paywall_post_ftux_v1` доданий у `apps/web/src/core/lib/featureFlags.ts` (default: false).
- [ ] PostHog FF `paywall_post_ftux_copy_v1` із 3-ма arms (variants α/β/γ §6) налаштований у [PostHog dashboard](https://us.posthog.com/project/sergeant).
- [ ] 5 PostHog events з §5 firing з правильними props (тести у `apps/web/src/core/paywall/PostFtuxPaywallSheet.test.tsx`).
- [ ] Frequency cap (14d) + hard-stop (2 dismissals) implemented + tested.
- [ ] A11y: focus trap, ESC=secondary, focus-return — playwright/RTL tests.
- [ ] `usePlan()` hook використовується з 0010 PR (не stub) — ЯКЩО PR-20 виходить після 0010 фази 3. Якщо до — stub з `'free'` + TODO-comment-anchor.
- [ ] PR description посилається на цей doc (`docs/launch/product-os/paywall-ux-placement.md`).
- [ ] Master-tracker §3.4 PR-20 рядок змінено на ✅ Closed з лінком.

---

## 11. Cross-refs

- [Initiative 0010 — revenue-first-launch](../../initiatives/0010-revenue-first-launch.md) — phases 1-4 для billing-stack.
- [06 Архітектура монетизації v2](../business/06-monetization-architecture.md) — ADR list (1.1–1.10), risk register, rollout-plan з FF.
- [01 Монетизація і ціноутворення](../business/01-monetization-and-pricing.md) — pricing strategy, що годує copy-варіанти §6.
- [FTUX master-tracker §3.4](./ftux-master-tracker.md#34-хвиля-4--paywall--polish-week-5-6-4-pr) — PR-19/PR-20 положення у sprint-плані.
- [FTUX master-tracker §7 Decisions log → «Paywall»](./ftux-master-tracker.md#7-decisions-log) — sketch-session decision.
- [Audit roast 2026-05-03 §B-1](../../audits/2026-05-03-ftux-onboarding-roast.md) — чому НЕ paywall у signup.
- [`apps/web/src/core/onboarding/firstRealEntry.ts`](../../../apps/web/src/core/onboarding/firstRealEntry.ts) — trigger event source.
- [`apps/web/src/core/onboarding/CelebrationModal.tsx`](../../../apps/web/src/core/onboarding/CelebrationModal.tsx) — hand-off modal перед sheet.

---

> **Status update path:** після PR-20 merge → bump `Last validated` тут на дату merge, `Status` залишається `Active draft` до post-launch retro (orientовно 2026-Q4), потім або `Active` (working as designed) або `Superseded` (якщо placement змінився).
