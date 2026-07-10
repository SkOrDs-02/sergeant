# Sergeant — Launch & Monetization Docs

> **Last validated:** 2026-07-10 by @cursoragent. **Next review:** 2026-10-08.
> **Status:** Active

> **Канон ціни (2026-07-10):** [ADR-0068](../../04-governance/adr/0068-pricing-v4-uah-reverse-trial.md) — **₴199/міс / ₴1490/рік**, reverse trial 7 днів, Free AI 15 msg/day. У старих блоках нижче ₴99/₴799 — historical context.
>
> Робочі документи запуску — згруповані за логікою у три піддерева:
> бізнес-стратегія (`business/`), технічні roadmap-и продуктових сурфейсів (`tech/`),
> та FTUX delivery (`product-os/`). Стратегічні цифри — для брейнштормінгу та A/B-тестів; implementation truth — ADR-0068 + `apps/web/src/core/billing/`.

## Структура

```
docs/01-product/launch/
├── README.md  ← ви тут
├── business/                            бізнес-стратегія + операції (нумерована послідовність milestone-ів)
│   ├── 01-monetization-and-pricing.md     бізнес-модель, тіри, paywall
│   ├── 02-go-to-market.md                 фази запуску, growth, контент
│   ├── 03-services-and-toolstack.md       стек, бюджет, week-by-week план
│   ├── 04-launch-readiness.md             legal, edge cases, метрики, чеклист
│   ├── 05-operations-and-automation.md    6 зон, n8n + OpenClaw, ритуали
│   └── 06-monetization-architecture.md    технічний скелетон paywall, 10 PR-ів, ADR, risk register
├── tech/                                independent product-surface roadmaps (живуть власним темпом)
│   ├── ai-memory-activation.md            ADR-0028 rollout: pgvector, Voyage, recall flows
│   ├── openclaw-roadmap.md                OpenClaw v0 → v1 поетапний план у 4 фази
│   └── telegram-improvements-roadmap.md   Telegram-surfaces (DM + supergroup) — 4-wave PR-план
├── product-os/                          FTUX delivery (product-OS layer)
│   ├── ftux-master-tracker.md             FTUX SSOT — стан, sprint registry, PR plan, hero copy, sketch, SLO, decisions
│   ├── ftux-sprint-plan.md                (frozen reference — superseded by ftux-master-tracker.md)
│   └── sprint-retros/                     Per-sprint launch retrospectives (postmortems завершених PR-серій)
└── phases/                              послідовні execution phases для запуску з реальними юзерами (Web → Capacitor → Native)
    ├── README.md                          master synthesis plan-guide (TLDR, timeline, лендінг, блокери)
    ├── 00-readiness-audit.md              audit готовності 4 surface-ів (Web, Server, Capacitor, Native, Landing)
    ├── 01-web-launch-with-users.md        Phase 1 — Web launch with users (W-4 .. W+12)
    └── 02-capacitor-launch.md             Phase 2 — Capacitor launch with users (W+8 .. W+16)
                                           (Phase 3 Native Expo — conditional gate, inline у phases/README.md § Phase 3)
```

> **Конвенція:** `business/01-…06-` — це **послідовний launch-milestone sequence** (бізнес-модель → GTM → стек → readiness → ops → архітектура paywall-у). Файли в `tech/` — це **independent roadmaps** окремих ініціатив (AI-memory, OpenClaw, Telegram), які не вкладаються в milestone-послідовність і живуть власним темпом. `product-os/` — FTUX-program: master-tracker (SSOT) + frozen sprint-plan + per-sprint retros. `phases/` — **execution phases** запуску з реальними юзерами (Web → Capacitor → Native), з вхідними/вихідними критеріями і week-by-week планом.

## Як читати

| Питання                                                           | Документ                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Яка бізнес-модель і скільки коштує Pro?                           | [01 — Монетизація](./business/01-monetization-and-pricing.md#2-тарифні-плани)                        |
| Як побудувати paywall технічно?                                   | [01 — Paywall](./business/01-monetization-and-pricing.md#6-технічна-реалізація-paywall)              |
| Які фази запуску і що робити на кожній?                           | [02 — GTM](./business/02-go-to-market.md#1-стратегія-запуску-фази)                                   |
| Як зростати після запуску (SEO, referrals)?                       | [02 — Growth](./business/02-go-to-market.md#5-фаза-3--growth-ongoing)                                |
| Який стек зараз і що додати?                                      | [03 — Стек](./business/03-services-and-toolstack.md#1-поточний-стек-що-вже-є)                        |
| Скільки коштуватиме інфраструктура?                               | [03 — Бюджет](./business/03-services-and-toolstack.md#9-повна-monthly-cost-projection)               |
| Коли і на що мігрувати (managed vs self-host)?                    | [architecture/hosting-evolution](../../02-engineering/architecture/hosting-evolution.md)             |
| Що треба юридично перед запуском?                                 | [04 — Legal](./business/04-launch-readiness.md#1-юридичне-та-compliance)                             |
| Чеклист «все готово до запуску»?                                  | [04 — Чеклист](./business/04-launch-readiness.md#7-pre-launch-чеклист)                               |
| Як адмініструвати продукт і не вигоріти?                          | [05 — Операції](./business/05-operations-and-automation.md#1-шість-операційних-зон)                  |
| Як налаштувати n8n + OpenClaw?                                    | [05 — Автоматизація](./business/05-operations-and-automation.md#6-зона-6-у-деталях-n8n--openclaw)    |
| Як поетапно побудувати OpenClaw v0 → v1?                          | [openclaw-roadmap](./tech/openclaw-roadmap.md)                                                       |
| Які покращення Telegram-сурфейсів заплановано?                    | [telegram-improvements-roadmap](./tech/telegram-improvements-roadmap.md)                             |
| Який поточний стан FTUX (sprint registry, відкриті проблеми)?     | [ftux-master-tracker](./product-os/ftux-master-tracker.md)                                           |
| Як саме запускати з реальними юзерами (Web → Capacitor → Native)? | [phases/README — master plan-guide](./phases/README.md)                                              |
| Що готово, а що блокує запуск (readiness matrix)?                 | [phases/00 — Readiness audit](./phases/00-readiness-audit.md)                                        |
| Тижневий план Web-launch з юзерами (W-4 .. W+12)?                 | [phases/01 — Web launch with users](./phases/01-web-launch-with-users.md)                            |
| Як підключати бета-тестерів через TestFlight / Play?              | [phases/02 — Capacitor launch](./phases/02-capacitor-launch.md)                                      |
| Чи варто запускати окремо Native Expo (apps/mobile)?              | [phases/README § Phase 3](./phases/README.md#phase-3--native-expo--conditional) _(conditional gate)_ |
| Як виправляти FTUX-онбординг (історичний sprint plan)?            | [ftux-sprint-plan](./product-os/ftux-sprint-plan.md) _(frozen)_                                      |
| Як активувати AI-memory: pgvector, Voyage, recall (ADR-0028)?     | [ai-memory-activation](./tech/ai-memory-activation.md)                                               |
| S1 ретро — чесний value-prop, поточний стан спринту?              | [sprint-retros/s1-honest-valueprop](./product-os/sprint-retros/s1-honest-valueprop.md)               |
| S3 ретро — reward у правильний момент, поточний стан спринту?     | [sprint-retros/s3-reward-moments](./product-os/sprint-retros/s3-reward-moments.md)                   |
| Як реалізувати paywall технічно (DB schema, webhook, plan-cache)? | [06 — Архітектура](./business/06-monetization-architecture.md#5-уточнена-розбивка-pr-10-шт)          |
| Що може піти не так у monetization rollout?                       | [06 — Risk register](./business/06-monetization-architecture.md#7-risk-register)                     |

## Високорівнева ідея

```
Sergeant = один додаток замість п'яти
  Фінік · Фізрук · Routine · Nutrition + AI-коуч
      ▲                                    ▲
      │                                    │
 local-first PWA + native          AI бачить весь день
```

**Модель:** Freemium + підписка Pro (**₴199/міс | ₴1490/рік**, ADR-0068).
Soft metered paywall — всі модулі базово безкоштовно; ліміти на AI (15 msg/day Free), sync (2 devices Free), звіти.

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

| Дія                        | Деталі                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Share-картки               | OG-зображення з результатами тижня → [вірусні петлі](./business/02-go-to-market.md#53-вірусні-петлі-viral-loops)                                             |
| Telegram-канал             | Збирати аудиторію до запуску → [pre-launch](./business/02-go-to-market.md#2-фаза-0--pre-launch)                                                              |
| Founder's story на DOU     | Безкоштовний PR → [українські канали](./business/02-go-to-market.md#українські-канали)                                                                       |
| Billing scaffold (shipped) | `PaywallModal`, `PricingPage`, `usePlan()`, `/api/billing/*` → [06 — Архітектура](./business/06-monetization-architecture.md); open: prod Stripe env + legal |
| In-app landing (shipped)   | `LandingPage` на `/` + `WaitlistForm` → [phases §5](./phases/README.md#5-рішення-про-лендінг); open: standalone `sergeant.com.ua`                            |
| PWA install optimization   | Піднімати % установок → [PWA install rate](./business/05-operations-and-automation.md#зона-1--product)                                                       |
