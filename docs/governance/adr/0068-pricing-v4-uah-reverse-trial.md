# ADR-0068: Pricing v4 — UAH monthly default та цільовий reverse trial

- **Status:** Accepted
- **Date:** 2026-06-27
- **Last validated:** 2026-09-04 against the codebase graph. **Next review:** 2026-12-03.
- **Supersedes:** [ADR-0051](./0051-pricing-v3-single-tier.md)
- **Related:** [ADR-0001](./0001-monetization-architecture.md), [ADR-0085](./0085-free-ai-quota-five-per-day.md).

## Поточний стан

`PRO_MONTHLY_UAH_KOPIYKAS=19900` є committed monthly UAH default. Це
конфігурація інтеграцій, а не доказ live paywall, активного merchant provider
чи опублікованої оферти. `effectiveLimits()` реалізує Free/Pro entitlement:
Free має 5 AI-запитів на добу, два cloud-sync пристрої та не має Monobank
auto-sync; Pro має unlimited для перших двох полів і auto-sync. AI число
належить ADR-0085.

## Рішення

Залишаємо одну paid модель Free + Pro та UAH monthly default. UA provider
вибирається лише з увімкнених LiqPay/Plata, а Stripe лишається non-UA шляхом
через provider abstraction. Наявність коду провайдера не доводить, що він
увімкнений у production.

Reverse trial на 7 днів — цільовий product policy, але не shipped behavior:
`trial_ends_at` існує у схемі, однак у checkout немає верифікованого issuance,
expiry, downgrade та notification path. Annual ₴1,490 configuration і annual
checkout також не реалізовані. Їх не можна показувати як доступні продукти,
доки code та operations не закриють ці контракти.

## Наслідки

- Зміна published pricing, trial або package проходить крізь entitlement,
  provider integration, copy та production verification разом.
- Стара таблиця «15 AI на день», анонімний AI та USD/annual promises не є
  чинною частиною цього ADR.
- Production provider set, merchant credentials і legal/tax procedure
  залишаються операційними рішеннями founder-а.
