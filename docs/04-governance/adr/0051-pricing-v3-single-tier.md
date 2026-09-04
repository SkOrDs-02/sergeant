# ADR-0051: Pricing v3 — один платний tier

- **Status:** Superseded by ADR-0068
- **Date:** 2026-05-06
- **Last validated:** 2026-09-04. **Next review:** —
- **Supersedes:** —
- **Superseded by:** [ADR-0068](./0068-pricing-v4-uah-reverse-trial.md)

## Історичний запис

Цей ADR обрав просту модель Free + один paid tier замість Plus/Pro, lifetime
deal або pay-per-feature. Структурний вибір одного paid tier лишився в
поточному entitlement contract, але ціни в USD, Stripe-only rollout, classic
trial та перелік feature limits з цієї редакції не є поточною політикою.

Поточний план/ліміти визначаються [ADR-0001](./0001-monetization-architecture.md),
ADR-0068 та [ADR-0085](./0085-free-ai-quota-five-per-day.md). Цей файл
зберігає лише рішення, від якого відмовилися, й не може бути джерелом
customer-facing copy або production readiness.
