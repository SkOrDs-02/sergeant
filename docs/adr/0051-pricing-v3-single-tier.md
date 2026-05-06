# ADR-0051: Pricing v3 — Free + Pro, single paid tier

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** pricing sections in [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md) (§2.2 Plus tier, §2.3 pay-per-feature, §3 Lifetime ₴2999)
- **Related:**
  - [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md)
  - [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md)

---

## Context and Problem Statement

`01-monetization-and-pricing.md` описує три варіанти тарифних планів (Variant A — 2 тіри, Variant B — 3 тіри з decoy, Variant C — pay-per-feature) і альтернативні ціни (₴149/міс, Lifetime ₴2999, $4.99 для EN-ринку). Жоден варіант не зафіксований як "прийнятий" — це залишає команду без чіткого плану реалізації. До першого Stripe-чека треба прийняти єдине рішення: яка модель іде у код.

Водночас ₴99/міс при ~$5 Anthropic API cost на Pro user = негативна gross margin на деяких сценаріях використання. Ціна потребує корекції перед production rollout.

## Considered Options

1. **Free + Pro $7/міс / $49/рік (USD), ₴ UA-only на старті** — один платний тір, trial без картки, USD-ціна для масштабування.
2. **Free + Plus + Pro (3 тіри, decoy)** — ₴59/₴99, складніше в реалізації, відволікає від shipping.
3. **Pay-per-feature** — модульні апгрейди, ще складніша реалізація.
4. **Do nothing** — лишити три варіанти без рішення; shipping білінгу неможливий.

## Decision

Приймаємо **варіант 1: Free + Pro, один платний тір**.

**Конкретні параметри:**

|                  | Free               | Pro                                     |
| ---------------- | ------------------ | --------------------------------------- |
| Ціна             | ₴0                 | **$7/міс** або **$49/рік** (~$4.08/міс) |
| Валюта на старті | —                  | ₴ (UAH) еквівалент для UA-ринку         |
| Trial            | —                  | 7 днів без прив'язки картки             |
| AI-чат           | 5 повідомлень/день | Безлімітний                             |
| CloudSync        | —                  | Між пристроями                          |
| Mono auto-sync   | Тільки ручне       | Авто-синхронізація                      |

**Видаляємо з активного скоупу:**

- Plus tier (₴59/міс) — decoy не виправдовує складність реалізації для MVP.
- Lifetime deal (₴2999) — привертає early adopters, але занижує LTV довгостроково; відкладено на post-launch.
- Pay-per-feature — занадто складно для першого Stripe-PR.
- $4.99 USD-ціна — додаємо в окремому PR після UA launch, коли буде EN landing.

**Stripe як єдиний провайдер для MVP.** LiqPay-паралель і нативні IAP — окремі фази post-launch (не blocking).

## Rationale

- Один тір → один `plan: 'free' | 'pro'` у `subscriptions` table → мінімум коду в Phase 2.
- $7/міс при ~$3–5 Anthropic cost = додатня gross margin навіть у песимістичному сценарії.
- 7-денний trial без картки знижує drop-off на signup (industry: +15–30% conversion до paid).
- ₴ UA-only на старті: гривневі ціни — когнітивно дешевші + ФОП-реєстрація простіша без валютних ліцензій. USD-ціни з'являться разом з EN-лендингом (Phase 6).

## Consequences

### Positive

- Реалізація Phase 2–3 (`subscriptions` SQL + Stripe checkout) простіша: один `plan` enum.
- `effectiveLimits()` у `apps/server/src/modules/billing/` потребує лише двох гілок логіки.
- Менше варіантів UI на `/pricing` → швидший Phase 4.2.

### Negative

- Відсутність Plus tier означає менший pricing anchor (decoy effect відсутній у MVP).
- Lifetime deal не доступний для early adopters до post-launch.

### Neutral

- Всі існуючі маркетингові документи (GTM, launch-readiness) посилаються на `₴99/міс` — вони будуть оновлені окремим PR у Phase 0 / Phase 1.

## Compliance

- Billing module (Phase 2) реалізує `plan: 'free' | 'pro'` — без Plus, без Lifetime.
- `subscriptions` SQL migration (Phase 2) має `plan TEXT NOT NULL DEFAULT 'free'`.
- Pricing page (`/pricing`) показує рівно два тіри — перевіряється у E2E Phase 4.2.
- `docs/launch/business/01-monetization-and-pricing.md` §2.2 і §2.3 мають позначку «Superseded by ADR-0051».

## Links

- [`docs/initiatives/0010-revenue-first-launch.md` § Phase 1.1](../initiatives/0010-revenue-first-launch.md)
- [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md)
- [`docs/audits/2026-05-04-revenue-and-marketing-roast.md`](../audits/2026-05-04-revenue-and-marketing-roast.md)
