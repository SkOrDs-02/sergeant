# 05. Operations і автоматизація: як контролювати, відстежувати, організовувати

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Як адмініструвати весь стек, не вигорівши: 6 операційних зон, правило «3 вкладки», daily/weekly ритуал, автоматизація через n8n + OpenClaw.
> Pre-MVP draft. Цифри (вартість self-host, LLM, час на task) — оцінкові.

---

## TL;DR

> **Дві ключові ідеї:**
>
> 1. **n8n = конвеєр (робить).** Тригер → дія → запис у БД/Telegram. Нон-стоп. Без думання.
> 2. **OpenClaw = асистент (думає і доповідає).** Раз на день/тиждень синтезує що відбулось у системі, пише вердикт у Telegram, відповідає на ad-hoc запити.
>
> Разом вони зводять щоденне адміністрування Sergeant до **5 хвилин на день / 30 хвилин на тиждень** і до **однієї вкладки** (Telegram).

> [!NOTE]
> **OpenClaw** — узагальнена назва для self-hosted AI ops-агента. На момент написання немає єдиного OSS-проєкту
> під цим брендом. Реалізація може бути: [OpenHands](https://github.com/All-Hands-AI/OpenHands),
> кастомний скрипт на Anthropic SDK / OpenAI Assistants API, AutoGPT-варіант, або навіть Claude Projects з MCP.
> Конкретні фічі нижче описано як _бажану поведінку_; перевіряй можливості обраного рішення перед впровадженням.

---

## 1. Шість операційних зон

Все що відбувається в Sergeant можна класифікувати по 6 зонах. Кожна зона має:

- **Власника** (зараз — ти; пізніше — найманий або делегований).
- **Основний інструмент** (де живуть дані).
- **Алерти** (що автоматично йде в Telegram).
- **Daily/weekly ритуал**.

| #   | Зона                   | Стек                              | Власник | Daily? | Weekly? |
| --- | ---------------------- | --------------------------------- | ------- | ------ | ------- |
| 1   | **Product**            | Vercel + Railway + Sentry         | ти      | 1 хв   | 5 хв    |
| 2   | **Revenue**            | Stripe + Postgres `subscriptions` | ти      | 1 хв   | 5 хв    |
| 3   | **Analytics & Growth** | PostHog + Loops + Buffer          | ти      | 1 хв   | 10 хв   |
| 4   | **DevOps & CI**        | GitHub + Railway + Renovate       | ти      | 1 хв   | 5 хв    |
| 5   | **Support**            | Crisp + Telegram bot + Canny      | ти      | 1 хв   | 5 хв    |
| 6   | **Automation**         | n8n + OpenClaw                    | ти      | 0 хв   | 0 хв    |

**Total:** 5 хвилин/день, 30 хвилин/тиждень.
Зона 6 (Automation) — це **мета-зона**: вона обслуговує інші п'ять. Якщо налаштована правильно, її саму контролювати не треба.

---

### Зона 1 — Product

| Що               | Де                                   | Алерт у Telegram           |
| ---------------- | ------------------------------------ | -------------------------- |
| Frontend health  | Vercel deployments                   | Build failed               |
| Backend uptime   | Railway / Prometheus `/metrics`      | API 5xx > 1 % за 5 хв      |
| Errors           | Sentry (web + server)                | New issue / spike > 10/хв  |
| Performance      | Vercel Speed Insights, Lighthouse CI | Core Web Vitals деградація |
| PWA install rate | PostHog                              | < 5 % за тиждень           |
| API latency      | Prometheus `http_request_duration`   | p95 > 1 с протягом 10 хв   |

**Daily check:** Vercel dashboard (1 deployment column) → Sentry Issues (Today) → готово.
**Weekly:** прогнати по 5 ключових ендпоінтах метрики p50/p95/p99, переглянути top-5 Sentry issues.

#### Incident playbook — Product

| Symptom                               | Action                                                              | Owner | Escalation                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| Vercel build failed                   | Перевірити logs, rollback до останнього green deploy                | ти    | —                                                                                                                     |
| API 5xx > 1 % протягом 5 хв           | Railway logs → знайти причину; якщо OOM — scale up або hotfix       | ти    | Якщо > 10 хв — rollback image                                                                                         |
| Sentry spike > 10 issues/хв           | Mute алерт; bisect останній deploy; hotfix або revert commit        | ти    | Якщо user-facing > 30 хв — [§4 incident response](./04-launch-readiness.md#3-operations-support-monitoring-incidents) |
| Core Web Vitals деградація (LCP > 3s) | Lighthouse CI diff; перевірити bundle size + lazy loading           | ти    | Створити P1 issue в GitHub                                                                                            |
| PWA install rate < 5 %                | Перевірити prompt timing, A2HS banner; A/B test у PostHog           | ти    | Переглянути UX install flow                                                                                           |
| API p95 > 1 с протягом 10 хв          | `SELECT * FROM pg_stat_activity` → знайти slow query; додати індекс | ти    | Якщо query plan не допомагає — scale DB                                                                               |

---

### Зона 2 — Revenue

| Що                     | Де                                    | Алерт у Telegram                          |
| ---------------------- | ------------------------------------- | ----------------------------------------- |
| MRR                    | Stripe Dashboard / БД view            | Drop > 10 % WoW                           |
| New subscriptions      | Stripe webhook → БД                   | Кожна нова Pro-підписка (motivational)    |
| Churn                  | Stripe webhook `subscription.deleted` | Кожен cancel + причина (з retention flow) |
| Failed payments        | `invoice.payment_failed`              | Кожен failed → одразу email + Telegram    |
| Disputes / chargebacks | `charge.disputed`                     | Кожен → critical                          |
| Refunds                | Manual у Stripe Dashboard             | —                                         |

**Daily check:** Stripe Dashboard → MRR + new subs за 24 год.
**Weekly:** churn по причинах (з cancel survey), revenue per user, conversion free→Pro.

#### Incident playbook — Revenue

| Symptom                         | Action                                                                   | Owner | Escalation                                |
| ------------------------------- | ------------------------------------------------------------------------ | ----- | ----------------------------------------- |
| MRR drop > 10 % WoW             | Stripe → filter by cancelled; перевірити cancel survey responses         | ти    | Якщо системна причина — P0 issue          |
| Spike failed payments (> 5/day) | Stripe → перевірити чи проблема з PSP; якщо ні — перевірити webhook flow | ти    | Звʼязатись зі Stripe support              |
| Dispute/chargeback              | Stripe → зібрати evidence; respond протягом 24 год                       | ти    | Якщо > 3/міс — переглянути refund policy  |
| Webhook не доходить (n8n down)  | Railway → перевірити n8n health; перезапустити                           | ти    | Stripe retry queue покриває до 72 год     |
| Неочікуваний refund request     | Перевірити Terms of Service; зробити refund якщо обґрунтовано            | ти    | Якщо fraud pattern — заблокувати + Stripe |

---

### Зона 3 — Analytics & Growth

| Що                      | Де                     | Алерт у Telegram             |
| ----------------------- | ---------------------- | ---------------------------- |
| Signups (DAU нових)     | PostHog                | Drop > 50 % vs 7-day average |
| Activation rate         | PostHog funnel         | Drop > 20 % WoW              |
| D1 / D7 / D30 retention | PostHog cohorts        | Drop > 10 % WoW              |
| Paywall hit rate        | PostHog `paywall_hit`  | —                            |
| Free→Pro conversion     | PostHog + Stripe       | < 2 % за тиждень             |
| Email campaigns         | Loops dashboard        | Bounce rate > 5 %            |
| Social posts            | Buffer / Typefully     | —                            |
| Referrals               | БД `referrals` таблиця | Top-3 рефералери за тиждень  |

**Daily check:** PostHog Today → signups + activation funnel.
**Weekly:** повна аналітика на 7-day cohort, content review (що з постів зайшло).

#### Incident playbook — Analytics & Growth

| Symptom                    | Action                                                                | Owner | Escalation                      |
| -------------------------- | --------------------------------------------------------------------- | ----- | ------------------------------- |
| Signups drop > 50 % vs avg | PostHog → перевірити funnel; Vercel → чи landing працює; SEO → зміни? | ти    | Якщо landing broken — P0 hotfix |
| Activation drop > 20 % WoW | PostHog funnel → знайти крок де drop; перевірити onboarding UX        | ти    | A/B test на onboarding flow     |
| Retention D7 drop > 10 %   | Cohort analysis; перевірити push-нагадування, content loop            | ти    | Engagement feature prioritize   |
| Bounce rate > 5 % (email)  | Loops → перевірити email template, subject line; check spam score     | ти    | Якщо > 10 % — pause campaigns   |
| PostHog quota наближається | Перевірити event volume; filter out noisy events                      | ти    | Upgrade plan або sampling       |

---

### Зона 4 — DevOps & CI

| Що                 | Де                 | Алерт у Telegram               |
| ------------------ | ------------------ | ------------------------------ |
| CI status          | GitHub Actions     | Failed workflow на main        |
| PR queue           | GitHub             | Devin Review failed            |
| Renovate PRs       | GitHub             | Major-version PR опен > 7 днів |
| Migrations         | Railway pre-deploy | Migration failed               |
| DB backups         | Railway            | Backup failed                  |
| DB storage         | Railway metrics    | > 80 % capacity                |
| Redis storage      | Railway metrics    | > 80 %                         |
| Container restarts | Railway logs       | > 3/год                        |
| Secrets expiry     | Manual / GitHub    | < 30 днів до expiry            |

**Daily check:** GitHub Actions main branch → green?
**Weekly:** Renovate queue, dependency audit (`pnpm audit`), backup verification.

#### Incident playbook — DevOps & CI

| Symptom                          | Action                                                               | Owner | Escalation                                                          |
| -------------------------------- | -------------------------------------------------------------------- | ----- | ------------------------------------------------------------------- |
| CI failed on main                | GitHub Actions → перевірити logs; rerun якщо flaky; fix якщо реальне | ти    | Якщо блокує deploys > 1 год — hotfix                                |
| Migration failed (Railway)       | Railway logs → SQL error; fix migration file; `pnpm db:migrate`      | ти    | Якщо data loss risk — [§4 two-phase rule](./04-launch-readiness.md) |
| DB storage > 80 %                | `VACUUM FULL`; archive old data; scale disk                          | ти    | Якщо > 95 % — emergency scale up                                    |
| Container restart loop (> 3/год) | Railway logs → OOM? crash? check memory limits                       | ти    | Scale up або hotfix memory leak                                     |
| Secret expires in < 30 днів      | Rotate key; update env vars in Railway + GitHub                      | ти    | Calendar reminder 7 днів до expiry                                  |
| Renovate major PR > 7 днів       | Рев'ю changelog; merge або закрити з коментарем                      | ти    | Якщо breaking — створити issue з планом                             |

---

### Зона 5 — Support

| Що                             | Де                   | Алерт у Telegram                  |
| ------------------------------ | -------------------- | --------------------------------- |
| Live chat (in-app)             | Crisp                | Нове повідомлення (з делеєм 5 хв) |
| Telegram bot inbox             | @sergeant_bot        | Кожне нове DM                     |
| Email support                  | support@…            | Forward → Telegram                |
| Bug reports                    | Sentry user feedback | Кожен з відсутнім matching issue  |
| Feature requests               | Canny                | Daily digest ranks                |
| App reviews (Play / App Store) | Manual / API         | Review < 4★                       |

**Daily check:** Telegram bot inbox → answer.
**Weekly:** Canny top requests, NPS digest з Loops, recap відповідей.

#### Incident playbook — Support

| Symptom                                  | Action                                                     | Owner | Escalation                        |
| ---------------------------------------- | ---------------------------------------------------------- | ----- | --------------------------------- |
| Unanswered support > 24 год              | Відповісти; якщо потребує fix — створити GitHub issue      | ти    | —                                 |
| Bug report з Sentry (без matching issue) | Створити issue; link до Sentry; assign пріоритет           | ти    | Якщо critical для юзера — P1      |
| Review < 4★ (App Store/Play)             | Відповісти на review; якщо bug — fix; якщо feature — Canny | ти    | Якщо pattern (> 3 однакових) — P1 |
| Support volume spike (> 2× avg)          | Шукати спільну причину; перевірити останній deploy         | ти    | Якщо обумовлено багом — P0 hotfix |
| Canny request набирає > 20 votes         | Рев'ю request; add to roadmap або відповісти з ETA         | ти    | Включити в найближчий sprint      |

---

### Зона 6 — Automation (мета-зона)

Це шар, який обслуговує всі інші 5 зон. Деталі — у [§5](#5-платформи-автоматизації--порівняння)–[§6](#6-зона-6-у-деталях-n8n--openclaw).

```
              ┌───────────────────────┐
              │   n8n (конвеєр)       │  ← робить
              │   self-hosted, $5/міс │
              └───────────┬───────────┘
                          │
         тригери з всіх 5 зон
                          │
              ┌───────────▼───────────┐
              │   Telegram            │
              │   #sergeant-alerts    │
              └───────────────────────┘
                          ▲
                          │
              ┌───────────┴───────────┐
              │   OpenClaw (асистент) │  ← думає і доповідає
              │   self-hosted, $3-5   │
              │   + LLM API           │
              └───────────────────────┘
```

#### Incident playbook — Automation

| Symptom                      | Action                                                         | Owner | Escalation                     |
| ---------------------------- | -------------------------------------------------------------- | ----- | ------------------------------ |
| n8n workflow зупинився       | Railway logs → restart; перевірити webhook endpoints           | ти    | Якщо > 1 год down — manual ops |
| OpenClaw не відправив digest | Перевірити Railway logs; LLM API key valid?; cron schedule OK? | ти    | Manual digest до fix           |
| n8n DB disk full             | Видалити старі execution logs; збільшити volume                | ти    | Migrate to larger Railway plan |
| LLM API rate limit           | Перевірити usage; зменшити frequency або switch model          | ти    | Fallback на дешевшу модель     |

---

## 2. Правило «3 вкладки» (а потім — 1 вкладки)

Замість 8+ дашбордів які треба обходити вручну — звести моніторинг до **3 вкладок**:

| Вкладка                        | Навіщо                                           | Кого алертить |
| ------------------------------ | ------------------------------------------------ | ------------- |
| **Telegram #sergeant-alerts**  | Всі критичні алерти автоматично, push на телефон | Тебе          |
| **Grafana / Notion dashboard** | MRR, DAU, errors, queue depth — одним поглядом   | —             |
| **GitHub / Railway**           | Тільки коли реально кодиш / деплоїш              | —             |

**З OpenClaw — можна скоротити до 1 вкладки (Telegram).** OpenClaw сам приходить вранці з digest `«За ніч: 3 нові підписки, 0 інцидентів, 1 PR від Renovate (auto-merge готовий), 12 сігнапів. Усе зелене»`. Тоді ти відкриваєш дашборд тільки якщо OpenClaw сказав щось ненормальне.

### Setup checklist — Telegram ops hub

Покроковий чекліст від нуля до працюючого Telegram ops hub:

- [ ] **Канал:** створи приватний Telegram-канал `sergeant-alerts`
  - Settings → Channel type → Private
- [ ] **Topics:** увімкни Topics (Settings → Topics → Enable)
  - Створи теми: `#incidents`, `#revenue`, `#ops`, `#digest`, `#support`
- [ ] **Бот:** створи бота через [@BotFather](https://t.me/BotFather)
  - `/newbot` → ім'я: `Sergeant Ops Bot` → username: `sergeant_ops_bot`
  - Збережи `BOT_TOKEN`
- [ ] **Додай бота як адміна** каналу (Channel Settings → Administrators → Add → бот)
  - Дозволи: Post messages, Edit messages
- [ ] **Отримай `CHAT_ID`:**
  ```bash
  curl "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates"
  ```
  Знайди `"chat":{"id":-100XXXXXXXXXX}` — це твій `CHAT_ID`
- [ ] **Env vars** (Railway + n8n):
  ```env
  TELEGRAM_BOT_TOKEN=<BOT_TOKEN>
  TELEGRAM_ALERT_CHAT_ID=<CHAT_ID>
  ```
- [ ] **Тест:** відправ тестове повідомлення:
  ```bash
  curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/sendMessage" \
    -d chat_id=<CHAT_ID> \
    -d text="✅ Sergeant Ops Bot connected!"
  ```
- [ ] **Push-сповіщення:** переконайся що в Telegram увімкнено push для цього каналу
  - Channel → Mute → вимкни (або налаштуй custom notifications)
- [ ] **n8n інтеграція:** перший workflow Stripe → Telegram (див. [§6.2 Billing pipeline](#1-billing-pipeline))

### Anti-pattern — як НЕ моніторити

```
❌ 8 вкладок: Vercel + Railway + Sentry + Stripe + PostHog + GitHub + Crisp + Loops
❌ Перевірка вранці: відкрив всі 8, по 30 секунд на кожну = 4 хв витратив, нічого не зрозумів
❌ Алерти на email — губляться у пошті
❌ Алерти у Slack без push — не побачиш до вечора
❌ "Я подивлюсь дашборд коли буду думати про це"
```

```
✅ 1 канал у Telegram з push на телефон → бачиш ВСЕ що важливо за 30 секунд
✅ Дашборд — раз на тиждень для тренду, не для тригеру
✅ OpenClaw raster: щоранку 1 повідомлення в Telegram з резюме
```

---

## 3. Daily / Weekly / Monthly ритуал

### Daily (5 хв; з OpenClaw — 1 хв)

- [ ] Telegram `#sergeant-alerts` → є red flag? Розібратись. Нема? Далі.
- [ ] OpenClaw morning brief (якщо налаштовано):
      `«За ніч: X сігнапів, Y підписок, Z errors. Все ок? Так — ✓; Ні — деталі»`
- [ ] Stripe → нові підписки (для emotional fuel)
- [ ] Telegram bot inbox → support
- [ ] _(опціонально)_ PostHog Today якщо є гіпотеза

### Weekly (30 хв, в неділю ввечері)

- [ ] Grafana dashboard → MRR / DAU / churn / errors WoW
- [ ] PostHog → cohorts, funnels, top events
- [ ] GitHub → PR queue: Renovate, code review, mergeable
- [ ] Stripe → revenue summary, refunds, disputes
- [ ] Canny → top 5 feature requests
- [ ] Loops → email metrics (open / click / unsub)
- [ ] Sentry → top 5 issues, чи є те що треба фіксити
- [ ] Buffer → next week content schedule
- [ ] Notion / GitHub Projects → roadmap update
- [ ] OpenClaw weekly report (якщо налаштовано):
      AI генерує summary тижня + 3 рекомендації

### Monthly (2 год, перше число місяця)

- [ ] Financial review: revenue, costs, margin, runway
- [ ] Cohort analysis: D30 retention, LTV trend
- [ ] Pricing experiment review (з PostHog feature flags)
- [ ] Roadmap update: що зробив, що далі (місячний план)
- [ ] Content audit: що зайшло (top 5 постів), що ні
- [ ] Tooling review: чи треба ще щось додати? Викинути?
- [ ] Backup test: відновити staging з backup
- [ ] Security review: `pnpm audit`, expired secrets
- [ ] Personal: чи не вигораю? Що покращити в процесі?

---

## 4. Telegram як operational hub

Один канал = одна точка істини. Архітектура:

```
@sergeant_alerts (приватний канал)
   ├─ #incidents          (errors, downtime, payment fails) [critical]
   ├─ #revenue            (нові підписки, churn)            [info+motivational]
   ├─ #growth             (signups, activation, top users)   [info]
   ├─ #ops                (CI fails, Renovate, deploy)       [info]
   ├─ #support            (нові тікети) [info]
   └─ #digest             (OpenClaw morning + weekly)        [info]

@sergeant_bot (DM bot)
   ├─ Support inbox: юзер DM → forward тобі
   ├─ Команди: /mrr, /errors, /signups → quick metric
   └─ /ops → передає в OpenClaw → AI відповідь
```

### Bot commands — повний список

| Команда        | Що робить                           | Приклад output                                                           |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `/mrr`         | Поточний MRR зі Stripe              | `MRR: ₴12,400 (+₴198 за 24h). 126 Pro subs.`                             |
| `/errors`      | Sentry issues за 24h                | `3 нових issues, 0 fatal. Top: "TypeError in DashboardPage" (12 events)` |
| `/signups`     | Кількість сігнапів за 24h з PostHog | `Signups: 23 (avg 7d: 18, +28%). Top source: DOU article.`               |
| `/churn`       | Churn stats за тиждень              | `Cancel: 4 (1.2%). Top причина: "не користувався" (2). LTV avg: ₴594`    |
| `/deploy`      | Статус останнього deploy            | `Vercel: ✓ 2h ago (abc1234). Railway: ✓ 3h ago. All green.`              |
| `/ci`          | GitHub Actions статус main          | `CI main: ✓ all passing. PRs: 2 open (1 Renovate auto-merge ready).`     |
| `/backup`      | Статус останнього DB backup         | `Last backup: today 03:00 UTC, 142MB, verified ✓.`                       |
| `/ops <query>` | Ad-hoc запит до OpenClaw            | `/ops чому signups впали?` → AI-аналіз з гіпотезою + лінками             |
| `/help`        | Список всіх команд                  | Таблиця вище                                                             |

### BotFather command list (copy-paste ready)

Відправ це в [@BotFather](https://t.me/BotFather) → `/setcommands` → вибери свого бота → paste:

```
mrr - Поточний MRR зі Stripe
errors - Sentry issues за 24h
signups - Signups за 24h з PostHog
churn - Churn stats за тиждень
deploy - Статус останнього deploy
ci - GitHub Actions статус main
backup - Статус останнього DB backup
ops - Ad-hoc запит до OpenClaw AI
help - Список всіх команд
```

### Налаштування — мінімальний MVP

1. Створи приватний Telegram-канал.
2. Створи бота в @BotFather, отримай `BOT_TOKEN`.
3. Додай бота адміном у канал, отримай `CHAT_ID`.
4. У n8n / Railway env-vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`.
5. Перший workflow у n8n: Stripe webhook `customer.subscription.created` → Telegram message.

---

## 5. Платформи автоматизації — порівняння

| Критерій                    | **n8n** 🥇             | **OpenClaw** 🤖     | **Make.com** 🥈                                                                                                        | **Zapier** 🥉                                                                                                                | **Klaviyo** ❌                                                                                                              | **Switch trigger** |
| --------------------------- | ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **Роль**                    | Конвеєр (робить)       | Асистент (думає)    | Конвеєр (робить)                                                                                                       | Конвеєр (робить)                                                                                                             | Email marketing                                                                                                             | —                  |
| **Хостинг**                 | Self-host (Docker)     | Self-host (Docker)  | SaaS                                                                                                                   | SaaS                                                                                                                         | SaaS                                                                                                                        | —                  |
| **Open-source**             | ✅ Apache 2.0          | ✅                  | ❌                                                                                                                     | ❌                                                                                                                           | ❌                                                                                                                          | —                  |
| **Вартість MVP**            | $3–5/міс (Railway)     | $3–5/міс + LLM API  | Free tier 1K ops/міс                                                                                                   | $19+/міс                                                                                                                     | $45+/міс                                                                                                                    | —                  |
| **Вартість scale**          | $10–20/міс             | $10 + LLM ($20–50)  | $9–29+/міс                                                                                                             | $69–599/міс                                                                                                                  | $100+/міс                                                                                                                   | —                  |
| **Інтеграції**              | 400+ нативних          | будь-що через MCP   | 1500+                                                                                                                  | 6000+                                                                                                                        | Вузький: email/SMS                                                                                                          | —                  |
| **AI / LLM**                | Optional nodes         | First-class         | Optional                                                                                                               | Optional                                                                                                                     | Optional                                                                                                                    | —                  |
| **Visual builder**          | ✅ Node-based          | ❌ Prompt-based     | ✅ Best-in-class                                                                                                       | ✅ Step-based                                                                                                                | ✅                                                                                                                          | —                  |
| **Self-hosted = privacy**   | ✅ Дані не лишають VPS | ✅                  | ❌                                                                                                                     | ❌                                                                                                                           | ❌                                                                                                                          | —                  |
| **Криві задачі**            | Складні multi-step     | Ad-hoc, аналітика   | Mid-complexity                                                                                                         | Простий if-this-then                                                                                                         | Email flows                                                                                                                 | —                  |
| **Підходить для Sergeant?** | ✅✅✅                 | ✅✅✅              | ⚠️ якщо не хочеш host                                                                                                  | ❌ дорого                                                                                                                    | ❌ overkill                                                                                                                 | —                  |
| **Switch trigger**          | Дефолт для Sergeant    | Дефолт для Sergeant | Мігрувати сюди якщо self-host не вдалось стабілізувати за 2 тижні; або якщо потрібна нативна інтеграція відсутня в n8n | Мігрувати якщо Make.com free tier скінчився і self-host все ще неприйнятний; або > 5 team members потребують no-code builder | Мігрувати тільки якщо email marketing стає core loop (e-commerce товарні каталоги, складні сегментації) і Loops не покриває |

### Висновки

1. **n8n + OpenClaw — основа.** Self-host обидва на Railway за ~$8/міс. Безкоштовний open-source. Privacy. Гнучкість.
2. **Make.com — fallback** якщо self-host лякає (1K ops/міс free на старті вистачить).
3. **Zapier — пропустити.** Все що Zapier робить — n8n робить дешевше.
4. **Klaviyo — пропустити.** Email marketing вже покривається Loops (в [03 §6.4](./03-services-and-toolstack.md#64-email)). Klaviyo — для e-commerce з товарними каталогами.

**Коли мігрувати (switch triggers):**

| З        | На         | Тригер                                                                                       |
| -------- | ---------- | -------------------------------------------------------------------------------------------- |
| n8n      | Make.com   | Self-host нестабільний > 2 тижні; або потрібна інтеграція відсутня в n8n і немає часу писати |
| Make.com | n8n        | Перевищено free tier і self-host вже не лякає                                                |
| Make.com | Zapier     | > 5 людей у команді потребують no-code builder                                               |
| Loops    | Klaviyo    | Email стає core product loop з товарними каталогами                                          |
| OpenClaw | Claude MCP | Self-host agent нестабільний; Claude Projects + MCP покриває потреби                         |

---

## 6. Зона 6 у деталях: n8n + OpenClaw

### 6.1 Розділення відповідальності

```
┌─────────────────────────────────────────────────────────────────┐
│ ТРИГЕР                  → ХТО ОБРОБЛЯЄ → ВИХІД                  │
├─────────────────────────────────────────────────────────────────┤
│ Stripe webhook          → n8n          → БД + Telegram          │
│ Sentry alert            → n8n          → Telegram               │
│ GitHub failed CI        → n8n          → Telegram               │
│ Cron "9:00 щоранку"     → OpenClaw     → Telegram digest        │
│ Cron "Sun 18:00"        → OpenClaw     → Weekly report          │
│ Юзер DM боту /churn     → OpenClaw     → AI-аналіз churn        │
│ PR opened (Renovate)    → OpenClaw     → Comment з risk score   │
│ Posthog drop > 50 %     → OpenClaw     → Telegram з гіпотезою   │
└─────────────────────────────────────────────────────────────────┘
```

**Правило:** якщо це **детермінований конвеєр** (тригер X → дія Y) — це **n8n**. Якщо це **синтез / аналіз / контекст** (з'ясувати чому, написати recap, відповісти на питання) — це **OpenClaw**.

### 6.2 6 конкретних автоматизацій для n8n

#### 1. Billing pipeline

⏱ **Орієнтовний час налаштування:** ~45 хв
🔗 **n8n-шаблон:** [n8n.io/workflows → "Stripe to Telegram"](https://n8n.io/workflows/?q=stripe+telegram)

```
Stripe webhook (subscription.created)
  → Validate signature
  → Update БД user.plan = 'pro'
  → Send Telegram: "🎉 Нова Pro: user@email (yearly, ₴799)"
  → Send Resend email: welcome to Pro
  → Increment PostHog event: plan_upgraded
```

#### 2. Failed payment recovery

⏱ **Орієнтовний час налаштування:** ~1 год
🔗 **n8n-шаблон:** [n8n.io/workflows → "Stripe failed payment"](https://n8n.io/workflows/?q=stripe+failed+payment)

```
Stripe webhook (invoice.payment_failed)
  → Send Telegram: "⚠️ Failed payment: user@email"
  → Send Resend: "Update your card" + magic link to portal
  → Schedule retry reminder T+24h, T+72h, T+7d
  → Якщо T+7d failed → downgrade to free + cancel email
```

#### 3. Sentry alert routing

⏱ **Орієнтовний час налаштування:** ~30 хв
🔗 **n8n-шаблон:** [n8n.io/workflows → "Sentry to Telegram"](https://n8n.io/workflows/?q=sentry+telegram)

```
Sentry webhook (new issue OR spike)
  → Filter: severity >= warning
  → Telegram message з link на Sentry issue
  → IF severity == fatal: ping @you
  → Update Notion incidents log
```

#### 4. Daily backup verification

⏱ **Орієнтовний час налаштування:** ~1.5 год
🔗 **n8n-шаблон:** [n8n.io/workflows → "database backup"](https://n8n.io/workflows/?q=database+backup+verify)

```
Cron 03:00 UTC
  → Railway API: list latest backup
  → Spin up staging instance (на Railway, ephemeral)
  → Restore backup
  → Run sanity SQL: SELECT count(*) FROM users
  → IF success: Telegram "✓ Backup OK ($DATE)"
  → IF fail: Telegram CRITICAL alert
```

#### 5. Renovate PR auto-handler

⏱ **Орієнтовний час налаштування:** ~1 год
🔗 **n8n-шаблон:** [n8n.io/workflows → "GitHub PR auto merge"](https://n8n.io/workflows/?q=github+pull+request+auto+merge)

```
GitHub webhook (pull_request opened, author=renovate[bot])
  → Run risk check: major / minor / patch
  → IF patch + CI green: auto-approve + automerge
  → IF minor: comment "ready for review", Telegram digest
  → IF major: post in Telegram з summary changelog
```

#### 6. Mono webhook → enrichment

⏱ **Орієнтовний час налаштування:** ~2 год
🔗 **n8n-шаблон:** [n8n.io/workflows → "webhook enrichment AI"](https://n8n.io/workflows/?q=webhook+ai+enrichment)

```
Mono webhook (нова transaction)
  → Save to module_data
  → Categorize via OpenAI/Claude (через AI node)
  → Update budget tracking
  → IF spending > budget threshold → Push to user
  → Telegram (admin) digest WoW spending behavior (агрегат)
```

### 6.3 6 конкретних задач для OpenClaw

#### 1. Daily morning briefing

```
Cron 08:30 Kyiv
  → OpenClaw збирає за останні 24h:
    - Stripe MRR delta
    - PostHog signups
    - Sentry new issues
    - GitHub PR queue
    - Open Telegram support тікети
  → Генерує текст ≤ 8 рядків
  → Telegram #digest:
    "Доброго ранку. За ніч:
     ├ MRR: ₴12.4K (+₴99 нова Pro річна)
     ├ Сігнапи: 23 (медіана 18, +28%)
     ├ Errors: 0 нових
     ├ Support: 2 тікети чекають
     └ PR queue: 1 Renovate (auto-merge готовий)
     Усе зелене. Що робимо сьогодні?"
```

**Prompt template:**

```
Ти — Sergeant Ops Bot. Збери дані за останні 24h з наступних джерел:
- Stripe API: MRR delta, нові підписки, cancellations
- PostHog API: signups count, 7-day average порівняння
- Sentry API: нові issues (severity >= warning)
- GitHub API: open PR count, failed CI count
- Telegram: open support threads count

Формат відповіді — Telegram message ≤ 8 рядків, українською. Структура:
"Доброго ранку. За ніч:
 ├ MRR: ₴{mrr} ({delta})
 ├ Сігнапи: {count} (медіана 7d: {avg}, {pct_change}%)
 ├ Errors: {count} нових
 ├ Support: {count} тікети чекають
 └ PR queue: {count} ({details})
 {verdict}. Що робимо сьогодні?"

Якщо все ОК — verdict = "Усе зелене".
Якщо є проблема — verdict = "⚠️ {issue}" + рекомендація.
```

#### 2. Ad-hoc запити (Telegram bot)

```
DM боту: "/ops чому signups впали?"
  → OpenClaw:
    - PostHog API: signups за 7 днів vs 7 попередніх
    - Vercel deploys: чи був deploy сьогодні?
    - Twitter mentions / Telegram channel посади
    - PostHog funnel: де відвал?
  → Відповідь з гіпотезою + лінки
```

**Prompt template:**

```
Ти — Sergeant Ops Bot. Юзер запитує: "{query}"

Зібери релевантні дані з доступних API (PostHog, Stripe, Sentry, GitHub, Vercel).
Сформулюй відповідь з:
1. Факти (числа, графіки, дати).
2. Гіпотеза (чому це могло статися).
3. Рекомендовані дії (1-3 конкретних кроки).
4. Лінки на відповідні дашборди.

Відповідь — українською, Telegram-friendly (≤ 15 рядків). Не спекулюй без даних.
```

#### 3. Контент-генератор

```
Cron Mon 10:00
  → OpenClaw:
    - Аналізує тиждень: top metric, цікавий тренд
    - Драфтує 3 варіанти X/Threads thread
    - Драфтує 1 пост у Telegram
    - Постить у Buffer queue (як draft)
  → Telegram: "Контент тижня готовий у Buffer. Approve?"
```

**Prompt template:**

```
Ти — контент-менеджер Sergeant. Проаналізуй метрики за минулий тиждень:
- PostHog: top event growth, цікаві тренди
- Stripe: revenue milestones
- GitHub: merged features/fixes

Створи:
1. **X/Threads thread** (3 варіанти, build-in-public стиль):
   - Hook (1 рядок, інтригуючий)
   - 3-5 tweets з конкретними цифрами/інсайтами
   - CTA (спробувати Sergeant / follow)
2. **Telegram post** (1 варіант, для @sergeant_channel):
   - Дружній тон, emoji помірно
   - Конкретні цифри або feature highlight

Tone: автентичний, не corporate. Цифри без NDA. Українською.
```

#### 4. Аналіз churn

```
Cron Sun 18:00 + Stripe subscription.deleted webhook
  → OpenClaw збирає cancel survey responses
  → Кластеризує причини (price / fitness only / bugs / not used)
  → Telegram weekly:
    "Цього тижня cancel-нули 4 (1.2 %). Top причина: 'не користувався'.
     Гіпотеза: переглянути onboarding day-3."
```

**Prompt template:**

```
Ти — аналітик retention Sergeant. Дані:
- Stripe API: cancelled subscriptions за тиждень
- Cancel survey responses (з webhook payload)
- PostHog: user activity before cancel (last 30 days)

Завдання:
1. Кластеризуй причини cancel (price / не потрібно / bugs / feature missing / інше).
2. Для кожного кластеру — % від total cancels.
3. Для top-1 причини — гіпотеза + конкретна рекомендація.
4. Порівняй з минулим тижнем.

Формат: Telegram message ≤ 10 рядків, українською.
"Churn тижня: {count} ({pct}%).
 ├ {reason_1}: {count_1} ({pct_1}%)
 ├ {reason_2}: {count_2}
 └ ...
 Top причина: {reason}. Гіпотеза: {hypothesis}. Дія: {action}."
```

#### 5. Trend detection

```
Cron daily 23:00
  → OpenClaw сканує:
    - PostHog: чи є event який зріс/упав > 50 % за 7 днів
    - Sentry: чи є issue що йде на повторюванні
    - Stripe: чи є dispute pattern
  → IF знайдено → Telegram з рекомендацією
  → ELSE → нічого (не спамити)
```

**Prompt template:**

```
Ти — trend detector Sergeant. Проскануй джерела:
- PostHog: events з delta > ±50% за 7 днів (порівняння з попередніми 7 днями)
- Sentry: issues з growing frequency (> 2x за 3 дні)
- Stripe: disputes або failed payments pattern

Правила:
- Якщо НІЧОГО аномального — НЕ відправляй повідомлення (return empty).
- Якщо є тренд — Telegram alert:
  "📊 Trend detected: {event_name} {direction} {pct}% за 7d.
   Контекст: {context}.
   Рекомендація: {action}."
- Максимум 1 alert на день (найважливіший тренд).
```

#### 6. Code review assistant (PR коменти)

```
GitHub webhook (pull_request opened, NOT renovate)
  → OpenClaw:
    - Читає diff
    - Читає AGENTS.md hard rules
    - Чекає на CI зеленість
    - Якщо зелений → коментар у PR з summary + risk
  → Не блокує merge, just информує
```

**Prompt template:**

```
Ти — code reviewer Sergeant. PR: #{pr_number} "{pr_title}".

Завдання:
1. Прочитай diff.
2. Перевір AGENTS.md hard rules (bigint coercion, RQ key factories, API contract
   тріада, migration rules, commit format, Tailwind opacity, WCAG contrast).
3. Оціни risk: low / medium / high.
4. Summary (3-5 речень): що змінилось, чи є потенційні проблеми.
5. Якщо є порушення hard rules — вкажи конкретний рядок + правило.

Формат: GitHub PR comment (markdown). НЕ блокуй merge.
Тон: конструктивний, конкретний. Без generic "looks good".
```

### 6.4 Data flow повністю

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Stripe           │     │ Sentry           │     │ GitHub           │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │webhook                 │webhook                 │webhook
         ▼                         ▼                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                          n8n (workflows)                            │
│  validate · enrich · route · transform · persist                    │
└────────┬───────────────┬──────────────────────┬────────────────────┘
         │               │                       │
         │persist        │alert (immediate)      │log (analytics)
         ▼               ▼                       ▼
   ┌──────────┐    ┌─────────────┐         ┌──────────┐
   │ Postgres │    │ Telegram    │         │ PostHog  │
   │          │    │ #incidents  │         │          │
   │          │    │ #revenue    │         │          │
   └────┬─────┘    │ #ops        │         └────┬─────┘
        │          └─────────────┘              │
        │                  ▲                    │
        │                  │                    │
        │      ┌───────────┴───────────┐        │
        └─────▶│      OpenClaw         │◀───────┘
               │                        │
               │ daily/weekly digest    │
               │ ad-hoc queries         │
               │ trend detection        │
               │ content drafting       │
               └───────────┬────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │ Telegram    │
                   │ #digest     │
                   │ DM @bot     │
                   └─────────────┘
```

Підсумок:

- **n8n** пише в `#incidents`, `#revenue`, `#ops` — миттєві технічні алерти.
- **OpenClaw** пише в `#digest` і відповідає у DM `@sergeant_bot` — синтез і аналіз.

---

## 7. Розгортання

### 7.1 n8n — self-host на Railway

```bash
# 1. New Railway project → Template "n8n"
#    або з нуля через Dockerfile:
#    https://hub.docker.com/r/n8nio/n8n

# 2. Persistent volume for /home/node/.n8n (workflows + credentials)
#    Railway: Volumes → mount /data

# 3. Env vars:
N8N_HOST=n8n.your-domain.com
N8N_PROTOCOL=https
N8N_PORT=5678
WEBHOOK_URL=https://n8n.your-domain.com/
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<pwgen>
N8N_ENCRYPTION_KEY=<openssl rand -hex 32>
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=<your-railway-postgres>
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=...
DB_POSTGRESDB_PASSWORD=...
TZ=Europe/Kyiv

# 4. Custom domain → Cloudflare DNS → CNAME до Railway
# 5. Перший workflow: Stripe → Telegram (test)
```

**Вартість:** ~$3–5/міс (Railway shared CPU + 512 MB RAM + 1 GB disk).

### 7.2 OpenClaw — self-host на Railway

> [!NOTE]
> **OpenClaw** — узагальнена назва для self-hosted AI ops-агента. Це НЕ конкретний продукт з офіційним Docker
> image. Реалізація може бути:
>
> - **[OpenHands](https://github.com/All-Hands-AI/OpenHands)** — OSS AI agent platform (найближчий аналог)
> - **Кастомний скрипт** на Anthropic SDK / OpenAI Assistants API
> - **[Claude Projects](https://claude.ai/projects)** з MCP-інтеграціями (без self-host)
> - **AutoGPT-варіант** або будь-який OSS agent framework
>
> Docker-команди нижче — _ілюстративні_. Підстав реальний image обраного рішення.

```bash
# Варіант A: Docker (ілюстративний приклад)
docker run -d \
  --name openclaw \
  --restart unless-stopped \
  -p 3030:3030 \
  -v openclaw-data:/data \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e TELEGRAM_BOT_TOKEN=... \
  -e TELEGRAM_CHAT_ID=... \
  -e POSTHOG_KEY=... \
  -e STRIPE_KEY=... \
  -e GITHUB_TOKEN=... \
  -e RAILWAY_TOKEN=... \
  your-chosen-agent-image:latest

# Варіант B: OpenHands (реальний OSS agent)
docker run -d \
  --name openhands \
  --restart unless-stopped \
  -p 3000:3000 \
  -v openhands-data:/opt/workspace \
  -e LLM_MODEL=claude-sonnet-4-5 \
  -e LLM_API_KEY=sk-ant-... \
  ghcr.io/all-hands-ai/openhands:latest

# Варіант C: Claude Projects (без self-host)
# → claude.ai/projects → New Project
# → Додай MCP інтеграції: Stripe, PostHog, GitHub, Sentry
# → Налаштуй scheduled tasks через n8n trigger
```

**Env vars (мінімум для self-hosted варіанту):**

```env
LLM_PROVIDER=anthropic        # або openai
ANTHROPIC_API_KEY=...
LLM_MODEL=claude-sonnet-4-5

# Інтеграції — credentials до сервісів які агент читає
STRIPE_SECRET_KEY=...
POSTHOG_API_KEY=...
SENTRY_AUTH_TOKEN=...
GITHUB_TOKEN=...
RAILWAY_TOKEN=...

# Telegram — куди писати
TELEGRAM_BOT_TOKEN=...
TELEGRAM_DIGEST_CHAT_ID=...

# Schedules
DAILY_BRIEF_CRON="30 8 * * *"
WEEKLY_REPORT_CRON="0 18 * * 0"
TZ=Europe/Kyiv
```

**Вартість:**

- Self-host (Railway): ~$3–5/міс (CPU + RAM).
- LLM API: ~$20–50/міс (Sonnet, ~10M tokens — щодня daily brief + weekly report + ad-hoc).
- Total: ~$25–55/міс.

### 7.3 Telegram bot

```bash
# 1. @BotFather → /newbot → @sergeant_ops_bot
#    Отримай BOT_TOKEN
# 2. Створи приватний канал @sergeant_alerts
# 3. Додай бота адміном у канал
# 4. /getUpdates щоб взяти CHAT_ID
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
# 5. Створи topics у каналі: #incidents, #revenue, #ops, #digest
#    (Telegram Topics — як підпапки в групі)
```

### 7.4 docker-compose — n8n + OpenClaw разом

Альтернатива окремим Railway services — один `docker-compose.yml` для всього ops stack:

```yaml
# docker-compose.ops.yml
# Запуск: docker compose -f docker-compose.ops.yml up -d
version: "3.8"

services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=${N8N_HOST:-localhost}
      - N8N_PROTOCOL=${N8N_PROTOCOL:-http}
      - N8N_PORT=5678
      - WEBHOOK_URL=${WEBHOOK_URL:-http://localhost:5678/}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER:-admin}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD:?Set N8N_PASSWORD}
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY:?Set N8N_ENCRYPTION_KEY}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=n8n-db
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${N8N_DB_PASSWORD:?Set N8N_DB_PASSWORD}
      - TZ=Europe/Kyiv
    volumes:
      - n8n-data:/home/node/.n8n
    depends_on:
      - n8n-db

  n8n-db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${N8N_DB_PASSWORD:?Set N8N_DB_PASSWORD}
    volumes:
      - n8n-db-data:/var/lib/postgresql/data

  # OpenClaw / AI agent — підстав реальний image
  # Приклад з OpenHands:
  ai-agent:
    image: ghcr.io/all-hands-ai/openhands:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - LLM_MODEL=${LLM_MODEL:-claude-sonnet-4-5}
      - LLM_API_KEY=${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_DIGEST_CHAT_ID=${TELEGRAM_DIGEST_CHAT_ID}
    volumes:
      - ai-agent-data:/opt/workspace

volumes:
  n8n-data:
  n8n-db-data:
  ai-agent-data:
```

**Запуск:**

```bash
# 1. Створи .env файл (НЕ комітити у репо!):
cat > .env.ops << 'EOF'
N8N_HOST=n8n.your-domain.com
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.your-domain.com/
N8N_USER=admin
N8N_PASSWORD=$(openssl rand -base64 24)
N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)
N8N_DB_PASSWORD=$(openssl rand -base64 24)
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_DIGEST_CHAT_ID=...
LLM_MODEL=claude-sonnet-4-5
EOF

# 2. Запусти stack:
docker compose -f docker-compose.ops.yml --env-file .env.ops up -d

# 3. Перевір:
docker compose -f docker-compose.ops.yml ps
# Очікуваний output: n8n (healthy), n8n-db (healthy), ai-agent (healthy)

# 4. Відкрий n8n UI:
# http://localhost:5678 (або через Cloudflare tunnel / Railway proxy)
```

---

## 8. GitHub Projects як roadmap і task-tracker

GitHub Issues + Projects вже є (зона 4). Як використовувати ефективно:

### 8.1 Структура проектів

```
Project: Sergeant Roadmap
  ├ Status: Backlog · This Week · In Progress · Review · Done
  ├ Priority: P0 (critical) · P1 · P2 · P3
  ├ Module: Finyk · Fizruk · Routine · Nutrition · Hub · Backend · DevOps · Marketing
  └ Type: feat · fix · docs · refactor · chore

Project: Sergeant Marketing
  ├ Status: Idea · Drafting · Scheduled · Posted · Analyzed
  ├ Channel: Twitter · Threads · Telegram · DOU · TikTok · Email
  └ Type: build-in-public · launch · educational · UGC

Project: Sergeant Operations
  ├ Status: Active · Resolved · Postponed
  ├ Severity: critical · high · medium · low
  └ Zone: Product · Revenue · Analytics · DevOps · Support
```

### 8.2 Створення Projects через UI

Покрокова інструкція (GitHub docs: [Planning and tracking — Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects)):

1. **Створити Project:**
   - GitHub repo → Projects tab → `New project`
   - Обери `Board` layout → назви `Sergeant Roadmap`
   - [docs.github.com: Creating a project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/creating-projects/creating-a-project)

2. **Додати custom fields:**
   - Project Settings (⚙) → Custom fields → `+ New field`
   - `Priority`: Single select → P0, P1, P2, P3
   - `Module`: Single select → Finyk, Fizruk, Routine, Nutrition, Hub, Backend, DevOps, Marketing
   - `Type`: Single select → feat, fix, docs, refactor, chore
   - [docs.github.com: Custom fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields)

3. **Налаштувати Views:**
   - `Board` view (Kanban) — group by Status
   - `Table` view — sort by Priority, filter by Module
   - `Roadmap` view (timeline) — для планування спрінтів
   - [docs.github.com: Customizing views](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project)

4. **Увімкнути Workflows (auto-actions):**
   - Project Settings → Workflows → Enable:
     - `Item added to project` → set Status = Backlog
     - `Item closed` → set Status = Done
     - `Pull request merged` → set Status = Done
   - [docs.github.com: Automating Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project)

5. **Повторити** для `Sergeant Marketing` і `Sergeant Operations` з відповідними полями.

### 8.3 Auto-create issues from automation

```
n8n workflow: Sentry critical issue → GitHub Issue (з лейблом zone:product, severity:high)
n8n workflow: Cancel survey "bug" → GitHub Issue (label: customer-bug)
OpenClaw weekly report → GitHub Issue (label: weekly-action-items)
```

Щоразу як OpenClaw знаходить тренд — він автоматично створює issue з контекстом.

---

## 9. Anti-patterns

| ❌ НЕ роби                                     | ✅ Замість цього                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Використовуй n8n для всього (включно з ad-hoc) | n8n для конвеєрів, OpenClaw для синтезу (див. [§6.1 розділення відповідальності](#61-розділення-відповідальності))         |
| Використовуй OpenClaw для billing pipeline     | Billing — детермінований flow → n8n. AI може галюцинувати (див. [§6.2 billing pipeline](#1-billing-pipeline))              |
| Алерти у email                                 | Алерти в Telegram з push на телефон (див. [§4 Telegram hub](#4-telegram-як-operational-hub))                               |
| 1 загальний канал на все                       | Topics: #incidents, #revenue, #ops, #digest, #support (див. [§2 setup checklist](#setup-checklist--telegram-ops-hub))      |
| Алерт на кожен event                           | Threshold-based: тільки якщо drop > X % або spike > Y (див. [§1 зони](#1-шість-операційних-зон))                           |
| Cron у `node-cron` всередині API process       | Окремий worker / n8n cron — щоб не падало з API (див. [§7.1 n8n deploy](#71-n8n--self-host-на-railway))                    |
| Захардкодити секрети в n8n workflows           | n8n credentials store + env vars (див. [§7.1 env vars](#71-n8n--self-host-на-railway))                                     |
| Автоматизувати раніше за PMF                   | Вручну → виміряй больові точки → потім автоматизуй (див. [§10 quick wins](#10-quick-wins-можна-зробити-цього-тижня))       |
| OpenClaw на проді з prod credentials у dev     | Dev OpenClaw → staging stack only (див. [§7.2 OpenClaw deploy](#72-openclaw--self-host-на-railway))                        |
| Запам'ятовувати алерти в голові                | Все що повторюється > 2 разів — у n8n (див. [§6.2 автоматизації](#62-6-конкретних-автоматизацій-для-n8n))                  |
| Залишати OpenClaw без guardrails               | Always-allow tools = read-only. Mutations — за approval (див. [§6.3 задачі OpenClaw](#63-6-конкретних-задач-для-openclaw)) |

---

## 10. Quick wins (можна зробити цього тижня)

### Понеділок

- [ ] Створити Telegram канал `#sergeant-alerts` + topics:
  ```bash
  # Через @BotFather:
  /newbot
  # Ім'я: Sergeant Ops Bot
  # Username: sergeant_ops_bot
  # Скопіюй BOT_TOKEN
  ```
- [ ] Додати GitHub repo secret:
  ```bash
  # GitHub → Settings → Secrets → Actions → New:
  # Name: TELEGRAM_BOT_TOKEN
  # Value: <BOT_TOKEN з BotFather>
  ```
- [ ] Встановити BotFather commands (copy-paste з [§4](#botfather-command-list-copy-paste-ready))

### Вівторок

- [ ] Розгорнути n8n на Railway (~30 хв):
  ```bash
  # Railway CLI:
  railway login
  railway init
  railway add --template n8n
  # Або через UI: railway.app → New Project → Template → n8n
  ```
- [ ] Перший workflow: Stripe webhook → Telegram (див. [§6.2 billing pipeline](#1-billing-pipeline))

### Середа

- [ ] Додати workflow: Sentry → Telegram (див. [§6.2 Sentry routing](#3-sentry-alert-routing)):
  ```
  n8n UI → New Workflow → Sentry Trigger → Telegram Send Message
  ```
- [ ] Додати workflow: GitHub Actions failed → Telegram:
  ```
  n8n UI → New Workflow → GitHub Trigger (workflow_run) → IF failed → Telegram
  ```

### Четвер

- [ ] Налаштувати OpenClaw / AI agent:
  ```bash
  # Варіант A: Docker (див. §7.2)
  docker run -d --name openclaw ...
  # Варіант B: Claude Projects → claude.ai/projects → New
  ```
- [ ] Daily morning brief workflow (див. [§6.3 prompt template](#1-daily-morning-briefing))

### П'ятниця

- [ ] GitHub Project `Sergeant Operations` — створити views:
  ```
  GitHub → Projects → New → Board → add fields (див. §8.2)
  ```
- [ ] Тестова прогонка тижневого ритуалу (чекліст з [§3 weekly](#weekly-30-хв-в-неділю-ввечері))

### Субота–Неділя

- [ ] Документувати setup у Notion / GitHub Wiki
- [ ] Перший weekly report від OpenClaw (запустити вручну для тесту)

---

## 11. Вартість operations-стеку

### Базовий сценарій (solo founder)

| Компонент                 | Вартість/міс       |
| ------------------------- | ------------------ |
| n8n (Railway)             | $3–5               |
| OpenClaw (Railway)        | $3–5               |
| OpenClaw LLM API          | $20–50             |
| Telegram bot              | 🟢 Free            |
| Grafana Cloud (free tier) | 🟢 Free            |
| GitHub Projects           | 🟢 Free (з GitHub) |
| UptimeRobot               | 🟢 Free            |
| **TOTAL**                 | **~$26–60/міс**    |

### Сценарії за розміром команди

| Сценарій                               | Команда | n8n                        | AI agent       | LLM API | Моніторинг                         | Support         | **Total/міс** |
| -------------------------------------- | ------- | -------------------------- | -------------- | ------- | ---------------------------------- | --------------- | ------------- |
| **Small** (solo founder, < 100 юзерів) | 1       | $3–5 (Railway)             | $3–5 (Railway) | $20–30  | Free (Grafana, UptimeRobot)        | Free (Telegram) | **$26–40**    |
| **Medium** (2-3 людини, 100–1K юзерів) | 2–3     | $10–15 (dedicated Railway) | $10–15         | $30–60  | $30 (Grafana Pro)                  | $25 (Crisp Pro) | **$105–170**  |
| **Large** (5+ людей, 1K–10K юзерів)    | 5+      | $20–40 (dedicated VPS)     | $20–40         | $50–100 | $50 (Datadog / Grafana Enterprise) | $50 (Intercom)  | **$190–380**  |

**Поріг окупності:**

| Сценарій   | Break-even при ₴99/міс Pro | Break-even при ₴799/рік Pro |
| ---------- | -------------------------- | --------------------------- |
| **Small**  | ~12 підписників            | ~5 річних                   |
| **Medium** | ~50 підписників            | ~20 річних                  |
| **Large**  | ~110 підписників           | ~45 річних                  |

---

## Пов'язані документи

- Каталог сервісів і фази впровадження → [03-services-and-toolstack.md](./03-services-and-toolstack.md).
- Метрики, алерти, incident response → [04-launch-readiness.md §3](./04-launch-readiness.md#3-operations-support-monitoring-incidents).
- Контент-плани і канали (що автоматизувати в content pipeline) → [02-go-to-market.md](./02-go-to-market.md).
- Billing edge cases (що n8n обробляє) → [04-launch-readiness.md §2.1](./04-launch-readiness.md#21-billing-edge-cases).
