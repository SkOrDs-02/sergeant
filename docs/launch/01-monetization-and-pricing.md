# 01. Монетизація і ціноутворення

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Pre-MVP draft. Числа орієнтовні, тіри/ціни — для брейнштормінгу і A/B-тесту.
> Джерело: `sergeant-monetization-plan.md` (ч.1), `sergeant-launch-checklist.md` (§3–§5).

---

## 1. Модель: Freemium + підписка

Freemium — найкращий вибір для Sergeant, бо:

- Продукт вирішує щоденну проблему (tracking) — юзер повинен спробувати перед покупкою.
- Конверсія freemium для B2C productivity apps: **2–5 %** (медіана), **8–12 %** (топ-перформери).
  - Референс: [First Page Sage, 2021–2025](https://firstpagesage.com/reports/saas-conversion-rate-benchmarks/) (80+ SaaS): traditional freemium → paid = **3,7 %**; Financial/Fintech = **3,7 %**; Healthcare/MedTech = **4,0 %**. Free-trial → paid значно вищий: **8–25 %** ([Lenny Rachitsky, 2024](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion)).
- Local-first архітектура дозволяє дати реальну цінність безкоштовно (дані локальні, сервер не потрібен для базових фіч).
- PWA не має 30 % комісії Apple/Google — маржа вища.

> **Benchmark:** MyFitnessPal (тільки їжа+фітнес) має 14M+ продуктів у базі та три тіри. YNAB (тільки фінанси) — $109/рік, 0 free-tier. Обидва вужчі за Sergeant, але з вищою ціною. Наш freemium з 4 модулями = ширший value prop за нижчою ціною.

---

## 2. Тарифні плани

### 2.1 Варіант А — два тіри (простий, рекомендований для MVP)

|                         | **Free**           | **Pro**                         |
| ----------------------- | ------------------ | ------------------------------- |
| **Ціна**                | ₴0                 | ₴99/міс або ₴799/рік (~₴67/міс) |
| **Модулі**              | Всі 4 базово       | Всі 4 повністю                  |
| **AI-чат**              | 5 повідомлень/день | Безлімітний                     |
| **AI-брифінг/підсумок** | —                  | Щоденно                         |
| **AI-фото (їжа)**       | 3/день             | Безлімітно                      |
| **CloudSync**           | —                  | Між пристроями                  |
| **Крос-модульні звіти** | —                  | Повні                           |
| **Monobank sync**       | Тільки ручне       | Авто-синхронізація              |
| **Фізрук: програми**    | 1 активна          | Безлімітно                      |
| **Харчування: сканер**  | Є                  | Є                               |
| **Експорт CSV/PDF**     | —                  | Є                               |
| **Push-нагадування**    | 2 звички           | Безлімітно                      |
| **Тема**                | Стандартна         | Теми + кастомізація             |

### 2.2 Варіант Б — три тіри (з decoy ефектом)

|                         | **Free**     | **Plus**     | **Pro**              |
| ----------------------- | ------------ | ------------ | -------------------- |
| **Ціна**                | ₴0           | ₴59/міс      | ₴99/міс або ₴799/рік |
| **Модулі**              | Всі 4 базово | Всі 4 базово | Всі 4 повністю       |
| **AI-чат**              | 5/день       | 25/день      | Безлімітний          |
| **AI-брифінг/підсумок** | —            | —            | Щоденно              |
| **AI-фото (їжа)**       | 3/день       | 10/день      | Безлімітно           |
| **CloudSync**           | —            | 2 пристрої   | Безлімітно           |
| **Крос-модульні звіти** | —            | Тижневі      | Повні + порівняння   |
| **Monobank sync**       | Ручне        | Авто         | Авто + мульти-банк   |
| **Фізрук: програми**    | 1 активна    | 3 активних   | Безлімітно           |
| **Харчування: сканер**  | Є            | Є            | Є                    |
| **Експорт CSV/PDF**     | —            | —            | Є                    |
| **Push-нагадування**    | 2 звички     | 5 звичок     | Безлімітно           |
| **Тема**                | Стандартна   | Стандартна   | Теми + кастомізація  |

> **Psycho-pricing:** ₴99 виглядає привабливо vs ₴59, бо «всього ₴40 більше, а отримуєш значно більше». Plus служить якорем (decoy), який штовхає до Pro.

### 2.3 Варіант В — pay-per-feature (модульний)

| Модуль-апгрейд                  | Ціна                   |
| ------------------------------- | ---------------------- |
| AI Pack (чат + брифінг + фото)  | ₴59/міс                |
| CloudSync                       | ₴39/міс                |
| Analytics Pack (звіти + тренди) | ₴29/міс                |
| Все разом (Pro)                 | ₴99/міс (~25 % знижка) |

> Дозволяє платити тільки за цінне. Складніше в реалізації, але вищий perceived fairness.

---

## 3. Ціноутворення: ринковий контекст

> **Примітка щодо валюти.** Ціни на старті — у ₴ (UAH), бо:
>
> 1. **Цільовий ринок — Україна.** Гривневі ціни знижують когнітивний бар'єр: юзер бачить «₴99», а не «$2.25 → конвертувати → комісія».
> 2. **Нижчий perceived cost.** ₴99 звучить як «менше ста» — психологічно дешево.
> 3. **Регуляторна простота.** ФОП може виставляти інвойси в UAH без валютних ліцензій.
> 4. Для англомовного ринку (фаза 4+) додамо USD-ціни: $4.99/міс.
>
> Курс: **₴1 ≈ $0.023** ([НБУ, квітень 2026](https://bank.gov.ua/ua/markets/exchangerates), ~₴44/$1). Тобто ₴99 ≈ **$2.25**, ₴799/рік ≈ **$18.16**.

| Конкурент             | Ціна                      | Що дає                        | Джерело          | Перевірено |
| --------------------- | ------------------------- | ----------------------------- | ---------------- | ---------- |
| MyFitnessPal Premium  | $19.99/міс або $79.99/рік | Тільки їжа+фітнес             | myfitnesspal.com | 2026-02    |
| MyFitnessPal Premium+ | $24.99/міс або $99.99/рік | +Meal Planner                 | myfitnesspal.com | 2026-02    |
| YNAB                  | $14.99/міс або $109/рік   | Тільки фінанси (0 free tier)  | ynab.com         | 2026-02    |
| Fabulous Premium      | ~$3.33/міс або $39.99/рік | Тільки звички                 | thefabulous.co   | 2026-02    |
| Streaks               | $5.99 one-time            | Тільки звички (iOS)           | App Store        | 2026-02    |
| Fealthy (UA)          | Безкоштовно               | Фін-освіта + трекер           | fealthy.com.ua   | 2026-02    |
| **Sergeant Pro**      | **₴99/міс (~$2.25)**      | **Все разом (4 модулі + AI)** | —                | —          |

> **Конкурентна перевага:** за ~$2.25/міс юзер отримує те, за що в окремих додатках платив би $50+/міс (MFP Premium + YNAB + Fabulous). Гривневі ціни знижують поріг для UA-ринку.

### Альтернативні ціни (для тесту)

- **₴149/міс** — якщо AI-фічі дійсно сильні.
- **$4.99/міс** — для англомовного ринку (подвійне ціноутворення UAH/USD).
- **Lifetime deal: ₴2999** — для ранніх адоптерів (early access hype).

---

## 4. Платіжні провайдери

### 4.1 Для PWA (основний канал — 0 % комісії платформи)

| Провайдер              | Комісія     | Підписки                        | UA ФОП      | Зусилля                        |
| ---------------------- | ----------- | ------------------------------- | ----------- | ------------------------------ |
| **Stripe**             | 2.9 % + 30¢ | Billing API, Customer Portal    | ✅          | Середні, найкраща документація |
| **LiqPay**             | 2.75 %      | Підписки є, API старіший        | ✅ (рідний) | Низькі                         |
| **Fondy**              | від 2.35 %  | Рекурентні платежі              | ✅          | Низькі                         |
| **Monobank Acquiring** | ~1.5 %      | Інвойсинг, не класичні підписки | ✅          | Високі (API сирий для subs)    |
| **Paddle**             | 5 % + 50¢   | Повний lifecycle + податки      | ✅ (MoR)    | Мінімальні (вони все роблять)  |
| **WayForPay**          | від 2.1 %   | Є рекурентні                    | ✅          | Низькі                         |

### 4.2 Decision tree: який провайдер обрати

```
Потрібен payment provider?
│
├─ MVP (Україна, ₴, ФОП)?
│   ├─ Хочеш мінімум зусиль?
│   │   └─► LiqPay — рідний для UA, рекурентні платежі, Mono-екосистема
│   └─ Хочеш нижчу комісію?
│       └─► Fondy (від 2.35 %) або WayForPay (від 2.1 %)
│
├─ Масштабування (міжнародні картки, webhooks, DX)?
│   └─► Stripe — Customer Portal, Billing API, invoices,
│       найкраща документація. Стає must-have при виході на EN-ринок.
│
├─ Не хочеш морочитися з податками (VAT, sales tax)?
│   └─► Paddle — Merchant of Record, вони все роблять.
│       Trade-off: 5 %+50¢ комісія (найвища).
│
└─ Нативні білди (Play Store / App Store)?
    ├─ Google Play Billing: 15 % (перші $1M/рік), далі 30 %
    └─ Apple IAP: 15 % (<$1M), далі 30 %
        └─ Можна направляти юзерів на веб для оплати
           (як Spotify/Netflix) — легально, але Apple воює.
```

**Прескриптивний висновок для Sergeant:**

1. **Місяць 1–3 (MVP, UA):** обрати **LiqPay** — найшвидший старт, рідний для UA, знайома checkout-сторінка для Mono-юзерів.
2. **Місяць 3–6 (масштаб):** додати **Stripe** паралельно — міжнародні картки, Customer Portal, subscription lifecycle webhooks.
3. **Місяць 6+ (EN-ринок):** оцінити **Paddle** як MoR для автоматичного VAT.
4. **Нативні додатки:** Google Play Billing + Apple IAP обов'язкові для in-app purchases. Де можливо — redirect на PWA для оплати (маржа вища).

> **TL;DR:** старт з LiqPay → додати Stripe для масштабу → Paddle за потреби. Нативні сторінки — IAP обов'язково, але штовхати до PWA-оплати.

Технічна імплементація Stripe webhook + env vars → [03 §2: Що додати](./03-services-and-toolstack.md#2-що-додати-нові-сервіси). Week-by-week план → [03 §7](./03-services-and-toolstack.md#7-порядок-дій-week-by-week).

---

## 5. Альтернативні моделі (для брейнштормінгу)

| Модель                            | Опис                                                                                           | Висновок                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Tip Jar / Донати**              | "Безкоштовний, але купи каву ☕". Monobank Jar — формат звичний для UA.                        | Дохід мінімальний.                                               |
| **Affiliate**                     | Реко фінпродуктів у Фініку (Mono), спорт-товари у Фізруку, доставка в рецептах (Glovo, Silpo). | Може виглядати рекламно. Ризик трасту.                           |
| **B2B / Corporate wellness**      | Продаж компаніям як wellness-інструмент. Окремий HR-дашборд (анонімована аналітика).           | Висока LTV, потрібна sales-команда.                              |
| **Marketplace / Premium контент** | Тренери продають програми, дієтологи — meal plans. Sergeant бере комісію 20–30 %.              | Модель Udemy/YouTube для wellness.                               |
| **Data insights (анонімізовані)** | Агреговані тренди ритейлерам, фітнес-мережам.                                                  | Етичний ризик; потрібна жорстка privacy policy.                  |
| **White-label / API**             | Ліцензувати CloudSync engine, AI-chat framework іншим розробникам.                             | Довгостроковий потенціал, але відволікає від основного продукту. |
| **Freemium + Ads**                | Реклама у безкоштовній версії.                                                                 | ❌ Не рекомендую: руйнує UX, personal data + ads = trust killer. |

---

## 6. Технічна реалізація paywall

```
Вже є:                              Потрібно додати:
─────────────────────────           ─────────────────────────
✓ Better Auth (юзери)               □ Таблиця `subscriptions`
✓ ai_usage_daily (AI ліміти)        □ Міграція 009_subscriptions.sql
✓ CloudSync (sync engine)           □ Stripe/LiqPay webhook handler
✓ Модульна архітектура              □ Middleware checkPlan() / requirePlan()
✓ Push notifications                □ PaywallGate компонент (web)
✓ Feature flags (shared)            □ Billing settings page
                                    □ Customer portal / manage sub
```

**Estimated effort:** ~1–2 тижні для MVP paywall зі Stripe/LiqPay. Технічна декомпозиція по тижнях — у [03 §7: week-by-week](./03-services-and-toolstack.md#7-порядок-дій-week-by-week).

### 6.1 Pricing UX (як показувати ціну)

- [ ] **Завжди показувати річну ціну першою** — ₴799/рік виглядає дешевше ніж ₴99/міс.
- [ ] **Показати економію** — «Зеконом ₴389/рік з річним планом».
- [ ] **Показати вартість per-day** — «Менше ₴3/день — дешевше за каву».
- [ ] **Social proof** — «150+ людей вже на Pro» (навіть якщо це бета-юзери).
- [ ] **Money-back guarantee** — «30 днів гарантія повернення» — знижує бар'єр входу.

### 6.2 Paywall UI: upgrade invitation, не "стіна"

- Конкретна вигода, не абстракція: «AI-брифінг кожен ранок», а не «Pro features».
- Preview Pro-фіч (blur / skeleton) перед paywall — юзер бачить що втрачає.
- Кнопка «Не зараз» — не примушувати.
- Анімований sheet / bottom-drawer, не блокуючий popup.

### 6.3 Paywall placement: сценарії + UX wireframes

| Стратегія                      | Конверсія                     | UX                            |
| ------------------------------ | ----------------------------- | ----------------------------- |
| **Hard paywall** (одразу)      | Вища серед тих хто доходить   | Відлякує більшість            |
| **Soft paywall** (після value) | Нижча, але більше total users | Кращий UX                     |
| **Metered paywall** (ліміт)    | Середня                       | Юзер сам натикається на стіну |

**Рекомендація для Sergeant:** **Metered + Soft.** Free юзер отримує реальну цінність (всі 4 модулі базово), але натикається на ліміти (5 AI/день, без sync). Paywall з'являється тільки коли юзер реально хоче Pro-фічу — це справедливо і не дратує.

#### Сценарій A: після першого AI-ліміту

```
┌──────────────────────────────────────────────┐
│  HubChat                                     │
│  ─────────────────────────────────           │
│  Юзер: "Скільки я витратив цього тижня?"    │
│  AI: "Ти витратив ₴4 320 — на 12 % менше…"  │
│  ...                                          │
│  Юзер: "А що з калоріями?"                   │
│  ┌────────────────────────────────────┐      │
│  │  🔒  5/5 AI-запитів використано    │      │
│  │                                     │      │
│  │  Отримай безлімітний AI-чат,       │      │
│  │  щоденний брифінг і AI-фото їжі.   │      │
│  │                                     │      │
│  │  [Спробуй Pro — 7 днів безкоштовно]  │      │
│  │  [Не зараз]                        │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

**PostHog event:** `paywall_viewed { source: "ai_limit", day: N }`

#### Сценарій B: після 7 днів використання (soft upsell)

```
┌──────────────────────────────────────────────┐
│  Dashboard                                    │
│  ─────────────────────────────────           │
│  ┌────────────────────────────────────┐      │
│  │  🎉 7 днів з Sergeant!             │      │
│  │                                     │      │
│  │  За цей час ти:                     │      │
│  │  • Залогував 23 транзакції          │      │
│  │  • Провів 4 тренування             │      │
│  │  • Відстежив 5 звичок              │      │
│  │                                     │      │
│  │  Розблокуй все:                    │      │
│  │  CloudSync · Безлім AI · Звіти      │      │
│  │                                     │      │
│  │  [Спробуй Pro — 7 днів безкоштовно]  │      │
│  │  [Плани]  [Не зараз]               │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

**PostHog event:** `paywall_viewed { source: "day_7_milestone", day: 7 }`

#### Сценарій C: при кліку на Pro-фічу (feature gate)

```
┌──────────────────────────────────────────────┐
│  Фінік → Звіти                               │
│  ─────────────────────────────────           │
│  ┌─── Тижневий звіт (blur) ──────────┐      │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │      │
│  │  ░░░ Витрати по категоріях ░░░░░  │      │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │      │
│  │  ░░░ Тренд за 4 тижні ░░░░░░░░░  │      │
│  └────────────────────────────────────┘      │
│  ┌────────────────────────────────────┐      │
│  │  🔒 Крос-модульні звіти — Pro      │      │
│  │                                     │      │
│  │  Побач фінанси + фітнес +        │      │
│  │  харчування + звички в одному.     │      │
│  │                                     │      │
│  │  [Спробуй Pro]  [Не зараз]          │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

**PostHog event:** `paywall_viewed { source: "feature_gate", feature: "cross_module_reports" }`

### 6.4 Pricing experiments

- [ ] **A/B ціни** — ₴79 vs ₴99 vs ₴149 (PostHog feature flags).
- [ ] **A/B з trial** — 7 днів trial vs без trial.
- [ ] **A/B paywall position** — після 3 днів vs 7 днів vs при першому AI-запиті.

---

## 7. Activation і конверсія у платників

### 7.1 Activation funnel — найважливіша метрика

Юзер, який не "активувався" за перші 3 дні, не заплатить ніколи.

```
Activated = юзер додав хоча б 1 запис у ≥2 модулі за перші 72 години

Приклад:
  ✅ Додав витрату (Finyk) + залогував тренування (Fizruk) = Activated
  ❌ Тільки відкрив додаток і подивився = NOT activated
```

**Вже є:** OnboardingWizard, seedDemoData, FirstActionSheet, Vibe Picks, useFirstEntryCelebration. Це гарна база.

### 7.2 PostHog analytics events (activation tracking)

Трекати в PostHog (або analytics sink, який його замінить).

> **Примітка:** назви `onboarding_completed`, `paywall_viewed`, `bank_connect_success` вже існують у `packages/shared/src/lib/analyticsEvents.ts` (`ANALYTICS_EVENTS`). Інші події в таблиці — заплановані; при реалізації додати їх до `ANALYTICS_EVENTS`.

| Подія (event name)            | Властивості (properties)                                                        | Коли спрацьовує              |
| ----------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| `user_signed_up`              | `method: "email" \| "google"`, `source: "soft_auth" \| "direct"`                | Реєстрація (анонім → акаунт) |
| `onboarding_completed`        | `vibe_picks: string[]`, `modules_selected: string[]`                            | Завершення OnboardingWizard  |
| `module_first_entry`          | `module: "finyk" \| "fizruk" \| "nutrition" \| "routine"`                       | Перший запис у модулі        |
| `activation_achieved`         | `modules: string[]`, `hours_since_signup: number`                               | ≥2 модулі мають ≥1 запис     |
| `ai_chat_message_sent`        | `message_count_today: number`, `is_limit_hit: boolean`                          | Кожне повідомлення в HubChat |
| `ai_limit_hit`                | `limit_type: "chat" \| "photo"`, `plan: "free"`                                 | Юзер досяг AI-ліміту         |
| `paywall_viewed`              | `source: "ai_limit" \| "day_7_milestone" \| "feature_gate"`, `feature?: string` | Показ paywall UI             |
| `paywall_cta_clicked`         | `source: string`, `cta: "start_trial" \| "view_plans" \| "dismiss"`             | Клік на кнопку paywall       |
| `subscription_started`        | `plan: "pro"`, `period: "monthly" \| "annual"`, `trial: boolean`                | Успішна підписка             |
| `subscription_cancelled`      | `reason?: string`, `months_active: number`                                      | Скасування підписки          |
| `subscription_payment_failed` | `attempt: number`, `provider: "stripe" \| "liqpay"`                             | Невдалий платіж              |
| `cloudsync_first_sync`        | `device_count: number`                                                          | Перша успішна синхронізація  |
| `bank_connect_success`        | `account_count: number`                                                         | Підключення Monobank         |
| `export_attempted`            | `format: "csv" \| "pdf"`, `plan: "free" \| "pro"`                               | Спроба експорту              |

> **Aha-moment гіпотези** (перевірити через cohort-аналіз у PostHog):
>
> 1. Перший AI-інсайт (`ai_chat_message_sent` + відповідь з інсайтом).
> 2. Перша синхронізація Mono (`bank_connect_success`).
> 3. Завершення першого тижня з ≥3 streak-днями.
>
> Найсильніший корелят retention → зробити частиною onboarding.

### 7.3 Progressive paywall timeline

**Що додати:**

- [ ] **"Aha moment" tracking** — визначити, який момент найбільше корелює з retention (скоріш за все: перший AI-інсайт або перша синхронізація Mono).
- [ ] **Progressive paywall** — не показувати paywall у перший день. Дати 3–5 днів цінності, потім м'яко показати Pro.
- [ ] **Trial of Pro features** — 7 днів повного Pro безкоштовно (без картки). Після — авто Free.
- [ ] **Onboarding email drip** — 5–7 листів після реєстрації:
  - День 0: «Ласкаво просимо! Ось як почати»
  - День 1: «Підключи Monobank за 30 секунд»
  - День 3: «Бачив свій перший AI-брифінг?»
  - День 5: «Ти вже [N] днів із Sergeant»
  - День 7: «Розблокуй повний потенціал — Pro»

### 7.4 Soft Auth → Hard Auth → Paid

```
Анонім (local-first)
  │ [soft auth prompt після first real entry]
  ▼
Зареєстрований (Free)
  │ [paywall після 3-7 днів або при Pro-фічі]
  ▼
Paid (Pro)
```

**Ключовий момент:** при переході Анонім → Зареєстрований — дані мають зберегтися (вже реалізовано через CloudSync). Це конкурентна перевага.

---

## 8. Retention і churn prevention

### 8.1 Retention benchmarks (Health & Fitness apps, 2026)

| Метрика     | Середня (індустрія) | Хороша | Відмінна | Sergeant target |
| ----------- | ------------------- | ------ | -------- | --------------- |
| **D1**      | 24 %                | 30 %   | 38 %+    | ≥30 %           |
| **D7**      | 14 %                | 18 %   | 24 %+    | ≥20 %           |
| **D30**     | 5–7 %               | 10 %   | 15 %+    | ≥10 %           |
| **WAU/MAU** | —                   | 40 %   | 60 %+    | ≥50 %           |

> Джерела: [Adjust Global App Trends, 2024](https://www.adjust.com/resources/ebooks/mobile-app-trends/); [Appalize Mobile Retention Report, 2026](https://appalize.com/reports/retention-2026/); [04 §4.2: Funnel метрики](./04-launch-readiness.md#42-funnel-метрики).

### 8.2 Push notification стратегія

Вже є push (web + native). Потрібна **стратегія**, а не «просто відправити нотифікацію».

**Конкретні cadence-правила:**

| #   | Trigger                                  | Delay             | Message text (приклад)                                    |
| --- | ---------------------------------------- | ----------------- | --------------------------------------------------------- |
| 1   | Звичка не відмічена (за розкладом юзера) | +2 год після часу | «Час для ранкової рутини 🌅»                              |
| 2   | Streak at risk (1 пропущений день)       | +20:00 того дня   | «Ти на 14-денному стріку! Не зламай його 🔥»              |
| 3   | AI weekly insight ready (понеділок)      | Понеділок 09:00   | «Цього тижня ти зекономив на 23 % більше — дивись звіт»   |
| 4   | 3+ днів неактивності                     | Day 3, 10:00      | «Давно не бачились! Подивись що нового 👋»                |
| 5   | 7+ днів неактивності                     | Day 7, 10:00      | «Ми скучили! Ось твій AI-підсумок за тиждень»             |
| 6   | Payment failed                           | +1 год після fail | «Оплата не пройшла — оновіть картку, щоб не втратити Pro» |
| 7   | Subscription ending (3 дні до)           | -3 дні до renewal | «Твій Pro закінчується через 3 дні. Продовж?»             |
| 8   | Перший AI-інсайт після Mono sync         | Одразу            | «Mono підключено! Ось твій перший фін-інсайт від AI 🤖»   |

**Правила:**

- Максимум **2 пуші/день** (hard cap).
- Per-category контроль у Settings (habit reminders / AI insights / billing / re-engagement).
- Юзер може вимкнути будь-яку категорію.
- Re-engagement пуші (рядки 4–5) — максимум 1 раз на тиждень.

### 8.3 Churn signals і реакція

| Сигнал            | Дія                                                   |
| ----------------- | ----------------------------------------------------- |
| Не заходив 3 дні  | Re-engagement push (#4)                               |
| Не заходив 7 днів | Email "Ми скучили" + push (#5)                        |
| Натиснув "Cancel" | Retention flow: «Чому? Може знижка 50 %?»             |
| Платіж failed     | Grace period 7 днів + 3 email reminders               |
| Downgrade → Free  | Зберегти дані 30 днів. Нагадати, що зникнуть без sync |

### 8.4 Winback campaign

- Через 30 днів після cancel: «Ми покращили Sergeant — подивись що нового» + знижка 30 % на 3 місяці.
- Через 90 днів: «Повернись — перший місяць безкоштовно».

---

## 9. Unit Economics: формули з цифрами

> Числа побудовані на таргетах з [04 §4: Метрики успіху](./04-launch-readiness.md#4-метрики-успіху). Актуалізувати після перших 3 місяців реальних даних.

### 9.1 LTV (Lifetime Value)

```
ARPU           = ₴99/міс (Pro monthly) або ₴67/міс (Pro annual)
Blended ARPU   = ₴99 × 0.4 + ₴67 × 0.6 = ₴79.80/міс
                 (гіпотеза: 40 % monthly, 60 % annual)

Avg lifetime   = 1 / monthly_churn
               = 1 / 0.05 = 20 місяців (при churn 5 %)
               = 1 / 0.08 = 12.5 місяців (при churn 8 %, песимістичний)

LTV (optimistic)  = ₴79.80 × 20 = ₴1 596 (~$36.27)
LTV (pessimistic) = ₴79.80 × 12.5 = ₴997.50 (~$22.67)
LTV (conservative, з 04) = ₴99 × 8 = ₴792 (~$18)
```

### 9.2 CAC (Customer Acquisition Cost)

```
Organic (SEO, DOU, Product Hunt, referral):   CAC ≈ ₴0–10
Paid (Facebook/Instagram, Google Ads UA):      CAC ≈ ₴40–80
Blended (70 % organic / 30 % paid):           CAC ≈ ₴20–35

Таргет з 04: CAC ₴20–40
```

### 9.3 LTV:CAC ratio

```
LTV (conservative) / CAC (blended max) = ₴792 / ₴40 = 19.8:1
LTV (optimistic)   / CAC (blended min) = ₴1596 / ₴20 = 79.8:1

Діапазон: 20:1 → 80:1  (>3:1 = здорово, >5:1 = відмінно)
```

### 9.4 Breakeven

```
Фіксовані витрати:
  Railway (server)       ≈ $20/міс   = ₴880
  Anthropic API          ≈ $50/міс   = ₴2 200  (при 500 active AI users)
  Vercel (frontend)      ≈ $0        = ₴0      (free tier)
  Resend (email)         ≈ $0        = ₴0      (free tier до 3K/міс)
  Domain + Cloudflare    ≈ $2/міс    = ₴88
  PostHog (analytics)    ≈ $0        = ₴0      (free tier до 1M events/міс)
  ──────────────────────────────────────────
  Total fixed            ≈ $72/міс   = ₴3 168

Змінні витрати per Pro subscriber:
  Payment provider fee   ≈ 3 % × ₴99  = ₴2.97/міс
  AI API marginal cost   ≈ ₴5/міс     (більше запитів ніж Free)
  ──────────────────────────────────────────
  Total variable         ≈ ₴8/міс per Pro sub

Net revenue per Pro sub  = ₴99 − ₴8 = ₴91/міс

Breakeven subscribers    = ₴3 168 / ₴91 ≈ 35 Pro subscribers
```

> **Висновок:** з ~35 Pro-підписниками покриваємо всі фіксовані витрати. При 100 Pro subs: MRR = ₴9 900, net = ₴9 900 − ₴800 (variable) − ₴3 168 (fixed) = **₴5 932 profit/міс**. Детальна cost projection → [03 §9: Monthly Cost Projection](./03-services-and-toolstack.md#9-повна-monthly-cost-projection).

---

## Pointers

- Маркетинг, контент, фази запуску, growth engine → [02-go-to-market.md](./02-go-to-market.md).
- Stripe / Better Auth інтеграція, env vars, week-by-week tech roadmap → [03-services-and-toolstack.md](./03-services-and-toolstack.md).
  - Payment provider імплементація → [03 §2](./03-services-and-toolstack.md#2-що-додати-нові-сервіси).
  - Week-by-week план → [03 §7](./03-services-and-toolstack.md#7-порядок-дій-week-by-week).
  - Monthly cost projection → [03 §9](./03-services-and-toolstack.md#9-повна-monthly-cost-projection).
- Legal/GDPR, billing edge cases, метрики, ризики, повний пре-launch чеклист → [04-launch-readiness.md](./04-launch-readiness.md).
  - North Star Metrics → [04 §4.1](./04-launch-readiness.md#41-north-star-metrics).
  - Funnel метрики → [04 §4.2](./04-launch-readiness.md#42-funnel-метрики).
  - Unit Economics targets → [04 §4.3](./04-launch-readiness.md#43-unit-economics-target).
  - Ризики монетизації → [04 §5](./04-launch-readiness.md#5-ризики-та-мітигація).
- Операційні зони, n8n + OpenClaw, daily/weekly ритуал → [05-operations-and-automation.md](./05-operations-and-automation.md).
