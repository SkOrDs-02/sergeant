# Sergeant — Launch & Monetization Docs

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

> Робочі документи запуску: бізнес-модель, GTM, тулстек, чеклист готовності, операції.
> Всі цифри попередні — для брейнштормінгу та A/B-тестів.

## Структура

```
docs/launch/
├── README.md  ← ви тут
├── 01-monetization-and-pricing.md   бізнес-модель, тіри, paywall
├── 02-go-to-market.md               фази запуску, growth, контент
├── 03-services-and-toolstack.md     стек, бюджет, week-by-week план
├── 04-launch-readiness.md           legal, edge cases, метрики, чеклист
├── 05-operations-and-automation.md  6 зон, n8n + OpenClaw, ритуали
├── 06-monetization-architecture.md  технічний скелетон, 10 PR-ів, ADR, risk register
├── ai-memory-activation.md          ADR-0028 rollout: pgvector, Voyage, recall flows
├── ftux-master-tracker.md           FTUX SSOT — стан, sprint registry, PR plan, hero copy, sketch, SLO, decisions
├── ftux-sprint-plan.md               (frozen reference — superseded by ftux-master-tracker.md)
├── openclaw-roadmap.md               OpenClaw v0 → v1 поетапний план у 4 фази
├── telegram-improvements-roadmap.md  Telegram-surfaces (DM + supergroup) — 4-wave PR-план
└── sprint-retros/                    Per-sprint launch retrospectives (postmortems завершених PR-серій)
```

> **Конвенція файлів:** `01-..-06-` — це **послідовний launch-milestone sequence** (бізнес-модель → GTM → стек → readiness → ops → архітектура paywall-у). Файли **без числового префіксу** — це **independent roadmaps** окремих ініціатив (AI-memory, OpenClaw, Telegram), які не вкладаються в milestone-послідовність і живуть власним темпом. Вони навмисно лишаються без префіксу, щоб (а) сигналізувати незалежність і (б) не ламати посилання з 5 ADR-ів та `docs/governance/feature-flags.md`. Якщо колись ці roadmap-и завершаться або злиються в milestone — тоді префікс додасться разом з оновленням всіх крос-лінків.

## Як читати

| Питання                                                           | Документ                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Яка бізнес-модель і скільки коштує Pro?                           | [01 — Монетизація](./01-monetization-and-pricing.md#2-тарифні-плани)                     |
| Як побудувати paywall технічно?                                   | [01 — Paywall](./01-monetization-and-pricing.md#6-технічна-реалізація-paywall)           |
| Які фази запуску і що робити на кожній?                           | [02 — GTM](./02-go-to-market.md#1-стратегія-запуску-фази)                                |
| Як зростати після запуску (SEO, referrals)?                       | [02 — Growth](./02-go-to-market.md#5-фаза-3--growth-ongoing)                             |
| Який стек зараз і що додати?                                      | [03 — Стек](./03-services-and-toolstack.md#1-поточний-стек-що-вже-є)                     |
| Скільки коштуватиме інфраструктура?                               | [03 — Бюджет](./03-services-and-toolstack.md#9-повна-monthly-cost-projection)            |
| Коли і на що мігрувати (managed vs self-host)?                    | [architecture/hosting-evolution](../architecture/hosting-evolution.md)                   |
| Що треба юридично перед запуском?                                 | [04 — Legal](./04-launch-readiness.md#1-юридичне-та-compliance)                          |
| Чеклист «все готово до запуску»?                                  | [04 — Чеклист](./04-launch-readiness.md#7-pre-launch-чеклист)                            |
| Як адмініструвати продукт і не вигоріти?                          | [05 — Операції](./05-operations-and-automation.md#1-шість-операційних-зон)               |
| Як налаштувати n8n + OpenClaw?                                    | [05 — Автоматизація](./05-operations-and-automation.md#6-зона-6-у-деталях-n8n--openclaw) |
| Як поетапно побудувати OpenClaw v0 → v1?                          | [openclaw-roadmap](./openclaw-roadmap.md)                                                |
| Які покращення Telegram-сурфейсів заплановано?                    | [telegram-improvements-roadmap](./telegram-improvements-roadmap.md)                      |
| Який поточний стан FTUX (sprint registry, відкриті проблеми)?     | [ftux-master-tracker](./ftux-master-tracker.md)                                          |
| Як виправляти FTUX-онбординг (історичний sprint plan)?            | [ftux-sprint-plan](./ftux-sprint-plan.md) _(frozen)_                                     |
| Як реалізувати paywall технічно (DB schema, webhook, plan-cache)? | [06 — Архітектура](./06-monetization-architecture.md#5-уточнена-розбивка-pr-10-шт)       |
| Що може піти не так у monetization rollout?                       | [06 — Risk register](./06-monetization-architecture.md#7-risk-register)                  |

## Високорівнева ідея

```
Sergeant = один додаток замість п'яти
  Фінік · Фізрук · Routine · Nutrition + AI-коуч
      ▲                                    ▲
      │                                    │
 local-first PWA + native          AI бачить весь день
```

**Модель:** Freemium + підписка Pro (₴99/міс | ₴799/рік).
Soft metered paywall — всі модулі базово безкоштовно; ліміти на AI, sync, звіти.

**Ринок:** Україна → Польща → англомовний.

## Roadmap

| Місяць | Ціль                                                  |
| ------ | ----------------------------------------------------- |
| 1      | MVP paywall (Stripe), Free + Pro, landing, TG-канал   |
| 2      | Closed beta 100-200 юзерів, referral, NPS             |
| 3      | Public launch — Product Hunt, DOU, Founder's Lifetime |
| 4-6    | Google Play, SEO, paid ads тест, B2B-пілот            |
| 7-12   | App Store, Польща, партнерство Mono, ₴100K MRR        |

## Quick wins (можна починати зараз)

| Дія                      | Деталі                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Share-картки             | OG-зображення з результатами тижня → [вірусні петлі](./02-go-to-market.md#53-вірусні-петлі-viral-loops)       |
| Telegram-канал           | Збирати аудиторію до запуску → [pre-launch](./02-go-to-market.md#2-фаза-0--pre-launch)                        |
| Founder's story на DOU   | Безкоштовний PR → [українські канали](./02-go-to-market.md#українські-канали)                                 |
| Paywall skeleton         | `subscriptions` + `requirePlan()` → [paywall](./01-monetization-and-pricing.md#6-технічна-реалізація-paywall) |
| Waitlist landing         | Збір email → [landing page](./02-go-to-market.md#landing-page)                                                |
| PWA install optimization | Піднімати % установок → [PWA install rate](./05-operations-and-automation.md#зона-1--product)                 |
