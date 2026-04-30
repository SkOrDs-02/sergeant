# 04. Launch readiness: legal, ops, edge cases, метрики, чеклист

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

> Pre-MVP draft. Покриває все, що треба перевірити перед запуском платного продукту.
> Джерело: `sergeant-launch-checklist.md` (§1, §2, §5, §6, §10),
> `sergeant-monetization-plan.md` (ч.3–6).
>
> **Cross-refs:**
> [01 — Monetization](./01-monetization-and-pricing.md) ·
> [02 — GTM](./02-go-to-market.md) ·
> [03 — Services](./03-services-and-toolstack.md) ·
> [05 — Operations](./05-operations-and-automation.md)

---

## 1. Юридичне та compliance

### 1.1 Обов'язкові документи

| Документ                                       | Навіщо                                                                | Пріоритет         | Template / закон                                                                                                                                                                                                                      | Owner           |
| ---------------------------------------------- | --------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Privacy Policy (Політика конфіденційності)** | Google Play, Stripe, GDPR, Apple — всі вимагають. Health + financial. | 🔴 Блокер запуску | [Termly Privacy Generator](https://termly.io/products/privacy-policy-generator/); GDPR [Art. 13–14](https://gdpr-info.eu/art-13-gdpr/); ЗУ «Про захист персональних даних» [ст. 12](https://zakon.rada.gov.ua/laws/show/2297-17#n155) | Founder         |
| **Terms of Service**                           | Юридичний захист для платних підписок. Refund policy.                 | 🔴 Блокер запуску | [Termly T&C Generator](https://termly.io/products/terms-and-conditions-generator/); ЗУ «Про електронну комерцію» [ст. 8–11](https://zakon.rada.gov.ua/laws/show/675-19#n74)                                                           | Founder         |
| **Cookie Policy**                              | Better Auth використовує cookies. Для EU — обов'язково.               | 🟡 До запуску     | [Iubenda Cookie Solution](https://www.iubenda.com/en/cookie-solution); Директива ePrivacy [2009/136/EC](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32009L0136)                                                         | Founder         |
| **Публічна оферта**                            | Для UA-ринку. ФОП може оформити сам.                                  | 🟡 До запуску     | Шаблон від [Дія.Бізнес](https://business.diia.gov.ua/); ЦКУ [ст. 633–641](https://zakon.rada.gov.ua/laws/show/435-15#n3529)                                                                                                           | Founder + юрист |

**Мінімальний чеклист для Privacy Policy (health + financial app, UA + EU):**

- [ ] **Перелік категорій даних:** PII, фінансові, здоров'я, поведінкові, AI-контекст. — _Ref:_ GDPR [Art. 13(1)(d)](https://gdpr-info.eu/art-13-gdpr/). _Owner:_ Founder.
- [ ] **Правова підстава обробки:** consent для health-даних, legitimate interest для аналітики. — _Ref:_ GDPR [Art. 6](https://gdpr-info.eu/art-6-gdpr/). _Owner:_ Founder + юрист.
- [ ] **Спеціальні категорії даних:** health data потребує explicit consent. — _Ref:_ GDPR [Art. 9](https://gdpr-info.eu/art-9-gdpr/). _Owner:_ Founder + юрист.
- [ ] **Треті сторони та sub-processors:** Stripe, Anthropic, Sentry, PostHog, Resend, Monobank, Railway, Vercel, Firebase/APNs. — _Ref:_ GDPR [Art. 28](https://gdpr-info.eu/art-28-gdpr/). _Owner:_ Founder.
- [ ] **Права суб'єкта даних:** access, rectification, erasure, portability, restriction, objection. — _Ref:_ GDPR [Art. 15–22](https://gdpr-info.eu/art-15-gdpr/). _Owner:_ Dev.
- [ ] **Міжнародні трансфери:** дані йдуть до US-серверів (Anthropic, Stripe, Sentry) — потрібен механізм (SCCs або рішення про адекватність). — _Ref:_ GDPR [Art. 46](https://gdpr-info.eu/art-46-gdpr/). _Owner:_ Founder + юрист.
- [ ] **Data retention periods:** скільки зберігаються дані після видалення акаунту. — _Ref:_ GDPR [Art. 5(1)(e)](https://gdpr-info.eu/art-5-gdpr/). _Owner:_ Founder.
- [ ] **Контактні дані DPO** або відповідальної особи. — _Ref:_ GDPR [Art. 37–39](https://gdpr-info.eu/art-37-gdpr/). _Owner:_ Founder.
- [ ] **Cookie disclosure:** перелік cookies, їх призначення, тривалість. — _Ref:_ Директива ePrivacy [2009/136/EC](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:32009L0136). _Owner:_ Dev.
- [ ] **Вік користувачів:** заборона < 16 років (GDPR) або < 18 (ЗУ «Про захист персональних даних»). — _Ref:_ GDPR [Art. 8](https://gdpr-info.eu/art-8-gdpr/); ЗУ [ст. 8](https://zakon.rada.gov.ua/laws/show/2297-17#n101). _Owner:_ Founder + Dev.
- [ ] **Процедура повідомлення про breach** (72 години). — _Ref:_ GDPR [Art. 33](https://gdpr-info.eu/art-33-gdpr/). _Owner:_ Founder.
- [ ] **Посилання на Cookie Policy та Terms of Service.** — _Owner:_ Dev.

### 1.2 Data classification

Sergeant збирає **чутливі дані**. Класифікація по полях:

| Поле / група даних          | Категорія            | Де зберігається                 | Коли видаляється                          |
| --------------------------- | -------------------- | ------------------------------- | ----------------------------------------- |
| email, name, image          | PII                  | PostgreSQL `user`               | При `DELETE /api/me` (Better Auth)        |
| password hash               | PII (credential)     | PostgreSQL `user`               | При видаленні акаунту                     |
| session tokens              | PII (credential)     | PostgreSQL `session`            | TTL / при видаленні акаунту               |
| транзакції, баланси         | Financial            | PostgreSQL `module_data` (sync) | При видаленні акаунту + 30 днів retention |
| бюджети / ліміти            | Financial            | localStorage / MMKV (local)     | При видаленні акаунту (sync cleanup)      |
| Monobank token              | Financial credential | PostgreSQL `mono_connection`    | При відключенні Mono / видаленні акаунту  |
| вага, тренування, tonnage   | Health               | localStorage / MMKV → sync      | При видаленні акаунту + 30 днів retention |
| калорії, їжа, meal log      | Health               | localStorage / MMKV → sync      | При видаленні акаунту + 30 днів retention |
| звички, streak, heatmap     | Behavioral           | localStorage / MMKV → sync      | При видаленні акаунту + 30 днів retention |
| AI Memory Bank (user facts) | AI-context (PII)     | PostgreSQL (chat context)       | `DELETE /api/me` + Anthropic cache purge  |
| push subscription endpoint  | PII (device)         | PostgreSQL `push_subscriptions` | При видаленні акаунту                     |
| analytics events            | Behavioral           | PostHog (зовнішній)             | PostHog retention policy (90 днів)        |
| error reports               | PII (leaked in logs) | Sentry (зовнішній)              | Sentry retention policy (30 днів)         |

**Що зробити:**

- [ ] Класифікувати всі поля по категоріях (PII, financial, health) — таблиця вище є стартом, звірити з міграціями `001`–`008`. _Owner:_ Dev.
- [ ] Переконатися що sensitive data НЕ потрапляє в analytics (`analytics.ts` вже має коментар про це). _Owner:_ Dev.
- [ ] Переконатися що Sentry не логує sensitive payload (вже є `delete event.request.cookies` — розширити на body/headers). _Owner:_ Dev.
- [ ] AI Memory Bank — додати опцію «Видалити всі мої дані з AI пам'яті». _Owner:_ Dev.

### 1.3 Юридична форма

| Опція                                | Для чого               | Плюси                                            | Мінуси                                           |
| ------------------------------------ | ---------------------- | ------------------------------------------------ | ------------------------------------------------ |
| **ФОП (3 група)**                    | UA-ринок, до ₴7.8M/рік | Простий, 5 % податок                             | Не підходить для Stripe (треба валютний рахунок) |
| **ФОП (3 група) + валютний рахунок** | UA + intl              | Stripe працює                                    | Потрібна валютна ліцензія                        |
| **Paddle як MoR**                    | Міжнародний ринок      | Paddle = Merchant of Record, сам платить податки | 5 % + 50¢ комісія                                |
| **ТОВ (LLC)**                        | Масштаб, інвестори     | Серйозніше для B2B, інвесторів                   | Складніше адміністрування                        |

> **Рекомендація для старту:** ФОП 3 група + Stripe (або Paddle, якщо не
> хочеш морочитись з податками в різних юрисдикціях).
> Див. також [01 § Платіжні провайдери](./01-monetization-and-pricing.md#4-платіжні-провайдери).

**Реєстрація ФОП — посилання та оцінки:**

| Крок                                   | Де                                                                                    | Час            | Вартість    | Owner   |
| -------------------------------------- | ------------------------------------------------------------------------------------- | -------------- | ----------- | ------- |
| Реєстрація ФОП                         | [Дія](https://diia.gov.ua/) або [ДПС кабінет](https://cabinet.tax.gov.ua/)            | 1–3 робочі дні | Безкоштовно | Founder |
| Вибір групи оподаткування (3 група)    | [ДПС кабінет](https://cabinet.tax.gov.ua/) → заява про застосування спрощеної системи | 1 день         | Безкоштовно | Founder |
| Відкриття банківського рахунку (UAH)   | Monobank / Приватбанк                                                                 | 1 день         | Безкоштовно | Founder |
| Відкриття валютного рахунку (USD/EUR)  | Приватбанк / ПУМБ / Укрсиббанк                                                        | 3–5 днів       | Безкоштовно | Founder |
| Реєстрація платника ЄСВ                | Автоматично при реєстрації ФОП                                                        | —              | ~₴1,760/міс | Founder |
| Підключення РРО / ПРРО (якщо потрібен) | [Дія](https://diia.gov.ua/) або [checkbox.ua](https://checkbox.ua/)                   | 1 день         | Від ₴0–300  | Founder |
| **Загалом**                            |                                                                                       | **5–10 днів**  | **~₴2,000** |         |

> ЄСВ (єдиний соціальний внесок) — мінімум 22 % від мінімальної зарплати.
> Станом на 2026 рік ~₴1,760/міс. 5 % єдиний податок — від обороту.
> Деталі щодо бюджету → [03 § Monthly Cost Projection](./03-services-and-toolstack.md#9-повна-monthly-cost-projection).

### 1.4 GDPR / Data rights

Better Auth вже має `deleteUser: enabled: true`
(`apps/server/src/auth.ts:65`). Для повного GDPR потрібно більше:

- [ ] **Right to access (Art. 15)** — `GET /api/me/export` → JSON/ZIP з усіма даними юзера. — _Ref:_ GDPR [Art. 15](https://gdpr-info.eu/art-15-gdpr/). _Owner:_ Dev.
- [ ] **Right to erasure (Art. 17)** — `DELETE /api/me` → cascade delete з БД + cleanup у зовнішніх сервісах. — _Ref:_ GDPR [Art. 17](https://gdpr-info.eu/art-17-gdpr/). _Owner:_ Dev.
- [ ] **Right to portability (Art. 20)** — `GET /api/me/export` повертає машиночитний JSON. — _Ref:_ GDPR [Art. 20](https://gdpr-info.eu/art-20-gdpr/). _Owner:_ Dev.
- [ ] **Consent management** — `GET /api/me/preferences` → поточні consent-и; `PATCH /api/me/preferences` → оновлення. — _Ref:_ GDPR [Art. 7](https://gdpr-info.eu/art-7-gdpr/). _Owner:_ Dev.
- [ ] **Data retention policy** — скільки зберігаються дані після видалення акаунту? Рекомендація: 30 днів (grace для undo), потім hard delete. — _Ref:_ GDPR [Art. 5(1)(e)](https://gdpr-info.eu/art-5-gdpr/). _Owner:_ Founder + Dev.

**API endpoints що треба реалізувати:**

```
GET  /api/me/export
  Auth: requireSession()
  Response: 200 → application/json або application/zip
  Логіка:
    1. SELECT * FROM user WHERE id = :userId
    2. SELECT * FROM module_data WHERE user_id = :userId
    3. SELECT * FROM mono_connection WHERE user_id = :userId
    4. SELECT * FROM push_subscriptions WHERE user_id = :userId
    5. SELECT * FROM ai_usage_daily WHERE subject_key = 'u:' || :userId
    6. Зібрати в JSON, опціонально ZIP
  Handler: apps/server/src/routes/me.ts → додати export handler
  Файл: apps/server/src/modules/gdpr/export.ts (новий)

DELETE /api/me
  Auth: requireSession()
  Response: 204 No Content
  Логіка:
    1. Cancel Stripe subscription (якщо active)
    2. Видалити push subscriptions (PostgreSQL)
    3. Видалити mono_connection (PostgreSQL)
    4. Видалити module_data (PostgreSQL)
    5. Видалити ai_usage_daily (PostgreSQL)
    6. auth.api.deleteUser(userId) — Better Auth cascade
    7. Запланувати async cleanup:
       - Sentry: delete user data (API)
       - PostHog: delete person (API)
       - Resend: delete contact (API)
       - Stripe: delete customer (API)
    8. Логувати deletion event для audit trail
  Handler: apps/server/src/auth.ts → deleteUser hook (вже enabled)
  Файл: apps/server/src/modules/gdpr/delete.ts (новий)

GET  /api/me/preferences
  Auth: requireSession()
  Response: 200 → { analytics: bool, aiMemory: bool, pushNotifications: bool }
  Handler: apps/server/src/routes/me.ts → додати preferences handler
  Файл: apps/server/src/modules/gdpr/preferences.ts (новий)

PATCH /api/me/preferences
  Auth: requireSession()
  Body: { analytics?: bool, aiMemory?: bool, pushNotifications?: bool }
  Response: 200 → оновлені preferences
  Файл: apps/server/src/modules/gdpr/preferences.ts (новий)
```

> Потрібна нова міграція `009_user_preferences.sql` для таблиці
> `user_preferences (user_id, analytics, ai_memory, push_notifications)`.

---

## 2. Технічні edge cases

Зведена таблиця всіх виявлених edge cases із зазначенням поточного стану,
очікуваної поведінки та способу тестування.
Деталі (flow-діаграми, sequence-діаграми) — у підрозділах нижче.

| #     | Сценарій                                | Поточна поведінка                     | Очікувана поведінка                                                                          | Trigger тесту                                                        |
| ----- | --------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| EC-01 | Webhook не доставлено після оплати      | Не реалізовано                        | Polling: перевірити статус підписки в Stripe при кожному login (`pollPlan.ts`)               | `stripe trigger invoice.paid` із вимкненим webhook endpoint          |
| EC-02 | Chargeback (`charge.disputed`)          | Не реалізовано                        | Downgrade → Free + email юзеру (`handleDispute.ts`)                                          | `stripe trigger charge.disputed`                                     |
| EC-03 | Оплата з двох акаунтів                  | Не реалізовано                        | Stripe customer прив'язаний до `user.id`; один customer = один user (`ensureOneCustomer.ts`) | Створити 2 акаунти → спробувати прив'язати той самий Stripe customer |
| EC-04 | Видалення акаунту з active subscription | `deleteUser` hook існує (Better Auth) | Cancel Stripe sub → delete → cascade cleanup (`handleSubDeleted.ts`)                         | Створити Pro-акаунт → `DELETE /api/me` → перевірити Stripe Dashboard |
| EC-05 | Timezone billing                        | Stripe працює в UTC                   | UI показує `period_end` у Kyiv timezone (`Europe/Kyiv`)                                      | Перевірити відображення дати закінчення підписки в UI                |
| EC-06 | Валюта                                  | Stripe auto-convert                   | UI показує ціну в локальній валюті                                                           | Змінити browser locale → перевірити pricing page                     |
| EC-07 | Downgrade Pro → Free                    | Не реалізовано                        | Дані залишаються, sync вимикається (`handleSubUpdated.ts`)                                   | Stripe Dashboard → cancel subscription → перевірити UI               |
| EC-08 | Free юзер перевищує AI quota            | `requireAiQuota.ts` існує             | Grandfather: grace period 30 днів для юзерів зареєстрованих до paywall                       | Реєстрація до paywall → 6-й AI запит → перевірити grace              |
| EC-09 | Payment failed (карта declined)         | Не реалізовано                        | Stripe retry 3× за 3 тижні → downgrade + email (`handlePaymentFailed.ts`)                    | Stripe test card `4000 0000 0000 0341` (decline after attach)        |
| EC-10 | Subscription renewed (`invoice.paid`)   | Не реалізовано                        | Оновити `current_period_end`, підтвердити Pro (`handleInvoicePaid.ts`)                       | `stripe trigger invoice.paid`                                        |
| EC-11 | Офлайн з valid Pro                      | Plan cache в localStorage/MMKV        | Pro-фічі працюють офлайн без обмежень                                                        | DevTools → Network: offline → використати Pro-фічу                   |
| EC-12 | Офлайн з expired Pro (< 72 год)         | Не реалізовано                        | Grace mode: Pro працює + банер «Підключіться до інтернету»                                   | DevTools → offline → змінити `cache.expiresAt` на −48 год            |
| EC-13 | Офлайн з expired Pro (> 72 год)         | Не реалізовано                        | Downgrade до Free локально; дані залишаються, sync/AI заблоковано                            | DevTools → offline → змінити `cache.expiresAt` на −96 год            |
| EC-14 | Online після grace period               | Не реалізовано                        | `GET /api/billing/plan` → оновити cache + toast «Ваш план: …»                                | Відновити з'єднання після grace → перевірити toast і cache           |
| EC-15 | Оплата на вебі → відкрити мобілку       | Не реалізовано                        | `usePlan()` → `GET /api/billing/plan` → Pro на всіх пристроях                                | Оплатити на вебі → відкрити мобілку → перевірити план                |
| EC-16 | Push про зміну плану                    | Не реалізовано                        | Push «Ваш план оновлено до Pro на всіх пристроях» на всі девайси                             | Оплатити → перевірити push на іншому пристрої                        |

> **Webhook entry point (створити):**
> `apps/server/src/routes/stripe-webhook.ts` → `POST /api/stripe/webhook`
> з `express.raw()` middleware для Stripe signature verification.
> Технічна реалізація paywall →
> [01 § Paywall](./01-monetization-and-pricing.md#6-технічна-реалізація-paywall).

### 2.1 Offline + Billing (деталі)

Sergeant — local-first. Що відбувається коли юзер офлайн?

- **Plan cache:** зберігати план в localStorage/MMKV. Якщо кеш каже
  «Pro» — дозволити Pro-фічі навіть офлайн.
- **Grace period:** якщо план expired, але юзер офлайн — дати 72 години
  grace.
- **Sync on reconnect:** при поверненні online — перевірити план на
  сервері, оновити кеш.

**Grace period flow:**

```
Юзер відкриває додаток (офлайн)
  │
  ▼
Читаємо plan cache (localStorage / MMKV)
  │
  ├─ cache.plan === "pro" AND cache.expiresAt > now()
  │    → Дозволити Pro-фічі. Нормальна робота.
  │
  ├─ cache.plan === "pro" AND cache.expiresAt <= now()
  │    │
  │    ▼
  │  Перевіряємо grace:
  │  now() - cache.expiresAt < 72 години?
  │    │
  │    ├─ ТАК → Grace mode: Pro-фічі працюють.
  │    │         UI показує банер: "Підписка потребує перевірки.
  │    │         Підключіться до інтернету."
  │    │
  │    └─ НІ  → Downgrade до Free локально.
  │              UI: "Підписка закінчилась. Підключіться для оновлення."
  │              Дані залишаються, sync/AI/звіти заблоковані.
  │
  └─ cache.plan === "free"
       → Free mode. Без змін.

Юзер повертається online
  │
  ▼
GET /api/billing/plan
  │
  ├─ Сервер: перевіряє subscriptions table + Stripe API
  │
  ▼
Оновлюємо cache: { plan, expiresAt, checkedAt }
  │
  ├─ Якщо plan змінився → UI toast: "Ваш план: Pro / Free"
  └─ Якщо був grace → логуємо grace_resolved event
```

### 2.2 Multi-device billing (деталі)

Юзер оплатив на вебі → відкрив мобілку → мобілка повинна бачити Pro.

**Рішення:** `usePlan()` → `GET /api/billing/plan` → сервер перевіряє
`subscriptions` table → кеш.

Push-нотифікація при зміні плану: «Ваш план оновлено до Pro на всіх
пристроях».

**Sequence diagram (plan sync між пристроями):**

```
Web Browser              Server                    Mobile App
    │                       │                          │
    │  POST /api/stripe     │                          │
    │  /create-checkout     │                          │
    │ ─────────────────────>│                          │
    │                       │                          │
    │  ← redirect to        │                          │
    │    Stripe Checkout     │                          │
    │<─────────────────────-│                          │
    │                       │                          │
    │         ...юзер оплачує на Stripe...              │
    │                       │                          │
    │                       │  Stripe webhook:         │
    │                       │  invoice.paid            │
    │                       │<======================== │
    │                       │                          │
    │                       │  1. UPDATE subscriptions │
    │                       │     SET plan='pro',      │
    │                       │     period_end=...       │
    │                       │                          │
    │                       │  2. Push notification    │
    │                       │     to ALL user devices  │
    │                       │ ─────────────────────────>│
    │                       │                          │
    │                       │                          │  onPush: "План
    │                       │                          │  оновлено до Pro"
    │                       │                          │
    │  GET /api/billing     │                          │  GET /api/billing
    │  /plan                │                          │  /plan
    │ ─────────────────────>│<─────────────────────────│
    │                       │                          │
    │  ← { plan: "pro",    │  → { plan: "pro",        │
    │    expiresAt: ... }   │    expiresAt: ... }      │
    │<─────────────────────-│─────────────────────────>│
    │                       │                          │
    │  Update localStorage  │             Update MMKV  │
    │  plan cache           │             plan cache   │
    │                       │                          │
```

---

## 3. Operations: support, monitoring, incidents

### 3.1 Ops checklist

#### Pre-launch

- [ ] FAQ / Help center — сторінка в додатку або окремий сайт (Notion, GitBook, Mintlify). _Owner:_ Founder.
- [ ] Email support налаштовано (`support@sergeant.com` або Telegram-бот). _Owner:_ Founder.
- [ ] In-app feedback — кнопка «Є ідея / Знайшов баг» → email або Telegram. _Owner:_ Dev.
- [ ] Telegram канал/група для community. _Owner:_ Founder.
- [ ] Status page — [uptimerobot.com](https://uptimerobot.com/) (безкоштовно) або [Instatus](https://instatus.com/). _Owner:_ Dev.
- [ ] On-call Telegram alert channel створено. _Owner:_ Founder.
- [ ] Rollback plan протестовано — Railway instant rollback на staging. _Owner:_ Dev.
- [ ] DB backup verification — відновити бекап на test-інстансі. _Owner:_ Dev.
- [ ] Sentry alerts configured (error rate, unhandled exceptions). _Owner:_ Dev.
- [ ] Billing email templates (Resend) — welcome, invoice, payment failed, churn. _Owner:_ Dev.
- [ ] Push notification strategy задокументовано (не спамити). _Owner:_ Founder.
- [ ] Всі monitoring алерти з §3.2 активні. _Owner:_ Dev.
- [ ] Incident runbook template готовий (див. §3.3). _Owner:_ Dev.

#### Launch day

- [ ] Status page показує «Operational». _Owner:_ Dev.
- [ ] Telegram alert channel моніториться в реальному часі. _Owner:_ Founder.
- [ ] Свіжий DB backup створено перед деплоєм. _Owner:_ Dev.
- [ ] Railway rollback протестовано на staging ще раз. _Owner:_ Dev.
- [ ] Stripe production webhooks активні та verified. _Owner:_ Dev.
- [ ] Error rate baseline зафіксовано (Grafana / Sentry). _Owner:_ Dev.
- [ ] PostHog dashboards для funnel та NSM відкриті. _Owner:_ Dev.

#### Post-launch

- [ ] Bug reporting кнопка «Надіслати звіт про помилку» додана в додаток. _Owner:_ Dev.
- [ ] Щомісячний DB backup recovery test. _Owner:_ Dev.
- [ ] Щотижневий review інцидентів (заповнювати runbook §3.3). _Owner:_ Founder.
- [ ] Щомісячний risk review (§5) — перевірити pre-mortem flags. _Owner:_ Founder.
- [ ] PostHog dashboards: NSM + funnel + unit economics (§4). _Owner:_ Dev.
- [ ] Churn analysis pipeline налаштовано. _Owner:_ Dev.

> Операційні зони та автоматизація →
> [05 § Шість зон](./05-operations-and-automation.md#1-шість-операційних-зон).
> Daily/weekly ритуал →
> [05 § Ритуал](./05-operations-and-automation.md#3-daily--weekly--monthly-ритуал).

### 3.2 Monitoring та alerting для платного продукту

Sentry + Prometheus вже є. Потрібно додати **бізнес-алерти**.
Про те, де саме жити Grafana/Loki (managed vs self-host) і коли мігрувати —
див. [`docs/architecture/hosting-evolution.md`](../architecture/hosting-evolution.md).

| Алерт               | Тригер                                  | Поріг                             | Де вимірюється               | Канал                |
| ------------------- | --------------------------------------- | --------------------------------- | ---------------------------- | -------------------- |
| Payment failed rate | Stripe webhook `invoice.payment_failed` | > 10 % від усіх invoices за добу  | Grafana (custom metric)      | Telegram bot / email |
| Signup rate drop    | PostHog daily cohort                    | > 50 % падіння vs попередній день | PostHog (trends)             | Email                |
| API error rate      | Prometheus `http_request_errors_total`  | > 5 % від загального трафіку      | Grafana (Prometheus)         | Telegram             |
| DB storage limit    | Railway metrics                         | > 80 % від ліміту плану           | Railway Dashboard (manual)   | Email                |
| AI API budget       | Anthropic usage API                     | > $40/міс (80 % від бюджету $50)  | Anthropic Dashboard (manual) | Email                |
| Churn spike         | Custom metric: `subscription_canceled`  | > 3 скасувань на день             | PostHog (custom event)       | Telegram             |

### 3.3 Incident response

Для платного продукту потрібен мінімальний incident plan:

- [ ] **Status page** — uptimerobot.com або Instatus. _Owner:_ Dev.
- [ ] **On-call** — solo-founder, але потрібен Telegram alert channel. _Owner:_ Founder.
- [ ] **Rollback plan** — Railway підтримує instant rollback. Тестувати заздалегідь. _Owner:_ Dev.
- [ ] **DB backup verification** — раз на місяць перевіряти що backup відновлюється. _Owner:_ Dev.

**Runbook template (1 інцидент = 1 заповнений runbook):**

```
============================================================
RUNBOOK: [Назва інциденту]
============================================================
Severity:     SEV-1 / SEV-2 / SEV-3
Date/time:    YYYY-MM-DD HH:MM UTC
Duration:     ____ хв
Reporter:     ____
On-call:      ____

------------------------------------------------------------
1. DETECTION
------------------------------------------------------------
Як виявлено:  [ ] Алерт (який?)  [ ] Юзер-репорт  [ ] Моніторинг
Час виявлення: HH:MM UTC
Час початку:   HH:MM UTC (якщо відрізняється)

------------------------------------------------------------
2. IMPACT
------------------------------------------------------------
Affected users:    ____ (кількість або %)
Affected modules:  [ ] Finyk  [ ] Fizruk  [ ] Routine  [ ] Nutrition
                   [ ] Auth   [ ] Sync    [ ] AI       [ ] Billing
Revenue impact:    ₴____ (оцінка)
Data loss:         [ ] Так  [ ] Ні

------------------------------------------------------------
3. TIMELINE
------------------------------------------------------------
HH:MM  — Виявлено проблему
HH:MM  — Почато діагностику
HH:MM  — Визначено root cause
HH:MM  — Застосовано fix / rollback
HH:MM  — Підтверджено відновлення
HH:MM  — Опубліковано postmortem

------------------------------------------------------------
4. ROOT CAUSE
------------------------------------------------------------
[Опис root cause. Чому це сталося? Чому не було виявлено раніше?]

------------------------------------------------------------
5. RESOLUTION
------------------------------------------------------------
Що зроблено:
  - [ ] Rollback (Railway instant rollback)
  - [ ] Hotfix (PR #____)
  - [ ] DB fix (migration #____)
  - [ ] Config change (env var: ____)
  - [ ] External provider fix (Stripe / Anthropic / ...)

------------------------------------------------------------
6. ACTION ITEMS (prevent recurrence)
------------------------------------------------------------
| # | Action                        | Owner | Deadline   | Status  |
|---|-------------------------------|-------|------------|---------|
| 1 |                               |       | YYYY-MM-DD | [ ] Done|
| 2 |                               |       | YYYY-MM-DD | [ ] Done|
| 3 |                               |       | YYYY-MM-DD | [ ] Done|

------------------------------------------------------------
7. LESSONS LEARNED
------------------------------------------------------------
What went well:
  -

What went wrong:
  -

What was lucky:
  -
============================================================
```

---

## 4. Метрики готовності

### 4.1 North Star Metrics

| Фаза              | Метрика                   | Поріг go/no-go | Target               | Формула / визначення                                         | Де вимірюється                               |
| ----------------- | ------------------------- | -------------- | -------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Beta              | WAU (weekly active users) | ≥ 50 WAU       | 200                  | `COUNT(DISTINCT user_id) WHERE last_active >= now() - 7d`    | PostHog: `$active_event` weekly unique users |
| Launch (місяць 1) | MAU                       | ≥ 500 MAU      | 1,000–5,000          | `COUNT(DISTINCT user_id) WHERE last_active >= now() - 30d`   | PostHog: monthly active users cohort         |
| Growth (місяць 3) | Paid subscribers          | ≥ 50 paid      | 100–250              | `COUNT(*) FROM subscriptions WHERE status = 'active'`        | Stripe Dashboard + SQL query                 |
| Growth (місяць 6) | MRR                       | ≥ ₴5K MRR      | ₴15K–25K (~$375–625) | `SUM(plan_price) FROM subscriptions WHERE status = 'active'` | Stripe Dashboard MRR + SQL view              |
| Scale (рік 1)     | MRR                       | ≥ ₴50K MRR     | ₴100K+ (~$2,500)     | `SUM(plan_price) FROM subscriptions WHERE status = 'active'` | Stripe Dashboard MRR                         |

> Ринкові бенчмарки: B2C beta 100–500 WAU; indie launch 1K–10K MAU;
> 2–5 % free→paid conversion; indie SaaS $500–2K MRR за 6 міс.

### 4.2 Funnel метрики

| Етап funnel            | Метрика                 | Поріг go/no-go | Target  | Формула                                            | Де вимірюється                                           |
| ---------------------- | ----------------------- | -------------- | ------- | -------------------------------------------------- | -------------------------------------------------------- |
| Visit → Sign up        | Landing conversion      | ≥ 5 %          | 10–20 % | `signups / unique_visitors × 100 %`                | PostHog: `$pageview` (landing) → `user_signed_up` funnel |
| Sign up → Active       | Activation rate         | ≥ 20 %         | 40–60 % | `users_with_2plus_modules_in_3d / signups × 100 %` | PostHog: `module_data_created` funnel (≥2 modules, ≤3d)  |
| Active → Retained      | D7 retention            | ≥ 10 %         | 20–30 % | `users_active_on_day7 / activated_users × 100 %`   | PostHog: retention cohort (D7)                           |
| Retained → Paywall hit | Paywall impression rate | ≥ 30 %         | 50–80 % | `users_who_saw_paywall / WAU × 100 %`              | PostHog: `paywall_hit` event / WAU                       |
| Paywall → Paid         | Free→Pro conversion     | ≥ 2 %          | 3–8 %   | `new_subscribers / paywall_impressions × 100 %`    | PostHog: `paywall_hit` → `subscription_created` funnel   |
| Paid → Retained        | Monthly churn           | ≤ 8 %          | < 5 %   | `churned / total_start_of_month × 100 %`           | SQL: `subscriptions` WHERE `canceled_at` in month        |
| Retained → Advocate    | Viral coefficient       | ≥ 0.1          | > 0.3   | `referrals_converted / active_referrers`           | SQL: `referrals` + PostHog                               |

> Retention / churn UX →
> [01 § Retention](./01-monetization-and-pricing.md#8-retention-і-churn-prevention).
> Activation і конверсія →
> [01 § Activation](./01-monetization-and-pricing.md#7-activation-і-конверсія-у-платників).

### 4.3 Unit Economics Target

| Метрика                     | Формула                                 | Target              | Де вимірюється                        | Benchmark             |
| --------------------------- | --------------------------------------- | ------------------- | ------------------------------------- | --------------------- |
| LTV (Pro subscriber)        | ARPU × avg_lifetime_months = ₴99 × 8    | ₴792                | SQL + Stripe                          | B2C SaaS LTV: $50–200 |
| CAC (blended)               | total_marketing_spend / new_subscribers | ₴20–40              | Ads dashboard + SQL (manual)          | Indie B2C CAC: $5–30  |
| LTV:CAC ratio               | LTV / CAC                               | 20:1 → 40:1         | Розрахунок (manual)                   | Здорово: > 3:1        |
| Gross margin                | (revenue - COGS) / revenue × 100 %      | > 80 %              | Stripe revenue − infra costs (manual) | SaaS: 70–85 %         |
| Breakeven point             | fixed_costs / ARPU = ₴2,800 / ₴99       | ~30 Pro subscribers | Розрахунок (manual)                   | —                     |
| ARPU (avg revenue per user) | MRR / total_active_subscribers          | ₴99                 | Stripe MRR / subscribers count        | —                     |

```
Breakeven деталізація:
  - Stripe fees:           ~3 % від revenue
  - Server (Railway):      ~$20/міс = ~₴800/міс
  - AI API (Anthropic):    ~$50/міс = ~₴2,000/міс при 500 active AI users
  - Total fixed:           ~$70/міс = ~₴2,800/міс
  - Breakeven:             ~30 Pro subscribers (₴99 × 30 = ₴2,970)
```

> Деталі витрат → [03 § Monthly Cost Projection](./03-services-and-toolstack.md#9-повна-monthly-cost-projection).

---

## 5. Ризики та мітигація

### Likelihood × Impact матриця

```
                    │ Low Impact     │ Medium Impact    │ High Impact      │ Critical Impact
────────────────────┼────────────────┼──────────────────┼──────────────────┼──────────────────
High Likelihood     │                │                  │ [R6] Юзери не   │ [R1] Низька
                    │                │                  │ хочуть all-in-1  │ конверсія free→Pro
────────────────────┼────────────────┼──────────────────┼──────────────────┼──────────────────
Medium Likelihood   │                │ [R3] AI API      │ [R2] Високий    │
                    │                │ costs зростають  │ churn            │
────────────────────┼────────────────┼──────────────────┼──────────────────┼──────────────────
Low Likelihood      │                │ [R4] Конкурент   │                  │ [R5] Apple
                    │                │ з'являється      │                  │ блокує PWA
────────────────────┼────────────────┼──────────────────┼──────────────────┼──────────────────
```

### Деталізація ризиків

| ID  | Ризик                          | Likelihood | Impact   | Pre-mortem flag                                                                 | Мітигація                                                                                                                              |
| --- | ------------------------------ | ---------- | -------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Низька конверсія free→Pro      | High       | Critical | Якщо через 30 днів після launch conversion < 1 % — paywall занадто м'який       | A/B тест paywall-ів, survey «чому не платиш», гнучкі тіри                                                                              |
| R2  | Високий churn                  | Medium     | High     | Якщо monthly churn > 10 % протягом 2 місяців — onboarding не створює звичку     | Onboarding wizard, push re-engagement, «ти пропустив 3 дні»                                                                            |
| R3  | AI API costs зростають         | Medium     | Medium   | Якщо AI cost per user > ₴10/міс — unit economics від'ємна                       | Кешування, rate limits, локальні моделі (llama) для простих задач                                                                      |
| R4  | Конкурент з'являється          | Low        | Medium   | Якщо з'являється UA all-in-one трекер з AI — потрібна швидша ітерація           | Швидкість ітерацій, community, Mono-lock-in                                                                                            |
| R5  | Apple блокує PWA               | Low        | Critical | Якщо Apple обмежує PWA API (push, install) — втрата iOS юзерів                  | Нативний додаток як fallback (Expo вже є)                                                                                              |
| R6  | Юзери не хочуть «все в одному» | High       | High     | Якщо > 60 % юзерів використовують тільки 1 модуль — pivot до модульного pricing | Модульний підхід: pay-per-feature (Вар. В з [01 § Моделі](./01-monetization-and-pricing.md#5-альтернативні-моделі-для-брейнштормінгу)) |

> **Trigger для перегляду ризиків:** щомісячний review перших 3 місяців
> після launch. Якщо pre-mortem flag спрацював — ескалація до зміни
> стратегії протягом 1 тижня.

---

## 6. Roadmap монетизації

```
Місяць 1:   ┌─ MVP paywall (Stripe)
            ├─ Free + Pro тіри
            ├─ Landing page + waitlist
            ├─ Telegram channel
            ├─ Privacy Policy + ToS сторінки (§1.1) ← блокер
            └─ ФОП реєстрація (§1.3) ← блокер

Місяць 2:   ┌─ Closed beta (100–200 юзерів)
            ├─ Referral system
            ├─ Onboarding optimization
            ├─ GDPR endpoints (§1.4): export, delete, preferences
            ├─ Збір фідбеку + NPS
            └─ Stripe webhook handlers (§2)

Місяць 3:   ┌─ Public launch (Product Hunt + DOU + AIN)
            ├─ Founder's Lifetime Deal
            ├─ Content marketing start
            ├─ Вірусні share cards
            ├─ Status page + incident runbook (§3.3)
            └─ Метрики dashboards (§4)

Місяць 4–6: ┌─ Google Play (Capacitor або Expo)
            ├─ SEO articles
            ├─ Paid ads test (₴5K budget)
            ├─ B2B pilot (1–2 компанії)
            ├─ Risk review: R1–R6 pre-mortem check (§5)
            └─ Ітерація pricing за даними

Місяць 7–12:┌─ App Store
            ├─ Розширення на Польщу
            ├─ Партнерство з Mono
            ├─ Marketplace контенту (тренери, дієтологи)
            └─ Target: ₴100K MRR
```

> Cross-reference з §7 (Pre-launch checklist): всі items з міток
> «Блокер» та «До запуску» мають бути завершені до кінця Місяця 1.
> GDPR endpoints та Stripe webhook handlers — до кінця Місяця 2
> (перед public launch).
> Фази запуску детально → [02 § Фази](./02-go-to-market.md#1-стратегія-запуску-фази).
> Week-by-week план → [03 § Week-by-week](./03-services-and-toolstack.md#7-порядок-дій-week-by-week).

---

## 7. Pre-launch чеклист

| #   | Категорія  | Задача                                                      | Owner   | Deadline    | Статус |
| --- | ---------- | ----------------------------------------------------------- | ------- | ----------- | ------ |
| 1   | Юридичне   | Privacy Policy сторінка (§1.1)                              | Founder | Місяць 1 W1 | [ ]    |
| 2   | Юридичне   | Terms of Service сторінка (§1.1)                            | Founder | Місяць 1 W1 | [ ]    |
| 3   | Юридичне   | Cookie consent banner (EU) (§1.1)                           | Dev     | Місяць 1 W2 | [ ]    |
| 4   | Юридичне   | ФОП реєстрація + банківський рахунок (§1.3)                 | Founder | Місяць 1 W2 | [ ]    |
| 5   | Юридичне   | Data classification audit (§1.2)                            | Dev     | Місяць 1 W3 | [ ]    |
| 6   | Продукт    | Paywall UI (не дратує, soft + metered)                      | Dev     | Місяць 1 W2 | [ ]    |
| 7   | Продукт    | Pricing page / модалка                                      | Dev     | Місяць 1 W2 | [ ]    |
| 8   | Продукт    | Billing Settings секція                                     | Dev     | Місяць 1 W3 | [ ]    |
| 9   | Продукт    | `GET /api/me/export` — Data export (GDPR) (§1.4)            | Dev     | Місяць 2 W1 | [ ]    |
| 10  | Продукт    | `DELETE /api/me` — повний cascade + external cleanup (§1.4) | Dev     | Місяць 2 W1 | [ ]    |
| 11  | Продукт    | `GET/PATCH /api/me/preferences` (§1.4)                      | Dev     | Місяць 2 W2 | [ ]    |
| 12  | Продукт    | FAQ / Help page                                             | Founder | Місяць 1 W4 | [ ]    |
| 13  | Маркетинг  | Landing page                                                | Dev     | Місяць 1 W1 | [ ]    |
| 14  | Маркетинг  | Store screenshots (якщо Play Store)                         | Founder | Місяць 4    | [ ]    |
| 15  | Маркетинг  | Demo video (30–60 с)                                        | Founder | Місяць 1 W3 | [ ]    |
| 16  | Маркетинг  | Telegram канал                                              | Founder | Місяць 1 W1 | [ ]    |
| 17  | Маркетинг  | Product Hunt page drafted                                   | Founder | Місяць 2 W4 | [ ]    |
| 18  | Маркетинг  | DOU стаття drafted                                          | Founder | Місяць 2 W4 | [ ]    |
| 19  | Маркетинг  | OG meta tags для social sharing                             | Dev     | Місяць 1 W3 | [ ]    |
| 20  | Технічне   | DB backups verified                                         | Dev     | Місяць 1 W3 | [ ]    |
| 21  | Технічне   | Stripe production keys + webhook endpoint (§2)              | Dev     | Місяць 1 W2 | [ ]    |
| 22  | Технічне   | Staging environment                                         | Dev     | Місяць 1 W1 | [ ]    |
| 23  | Технічне   | Rate limiting через Redis (не in-memory)                    | Dev     | Місяць 1 W3 | [ ]    |
| 24  | Технічне   | Sentry alerts configured                                    | Dev     | Місяць 1 W2 | [ ]    |
| 25  | Технічне   | Status page — uptimerobot.com (§3.3)                        | Dev     | Місяць 1 W4 | [ ]    |
| 26  | Технічне   | Error rate monitoring (Prometheus + Grafana) (§3.2)         | Dev     | Місяць 1 W3 | [ ]    |
| 27  | Технічне   | Stripe webhook handlers: all events (§2)                    | Dev     | Місяць 2 W2 | [ ]    |
| 28  | Технічне   | Offline grace period flow (§2.1)                            | Dev     | Місяць 2 W3 | [ ]    |
| 29  | Технічне   | Multi-device plan sync + push (§2.2)                        | Dev     | Місяць 2 W3 | [ ]    |
| 30  | Операційне | Support email або Telegram                                  | Founder | Місяць 1 W1 | [ ]    |
| 31  | Операційне | Incident rollback tested (Railway) (§3.3)                   | Dev     | Місяць 1 W4 | [ ]    |
| 32  | Операційне | Billing email templates (Resend)                            | Dev     | Місяць 1 W3 | [ ]    |
| 33  | Операційне | Push notification strategy (не спамити)                     | Founder | Місяць 1 W4 | [ ]    |
| 34  | Операційне | Analytics (PostHog) working + dashboards (§4)               | Dev     | Місяць 1 W3 | [ ]    |
| 35  | Операційне | Метрики: NSM + funnel + unit economics dashboards (§4)      | Dev     | Місяць 2 W4 | [ ]    |
| 36  | Операційне | Incident runbook template ready (§3.3)                      | Dev     | Місяць 1 W4 | [ ]    |

---

## Pointers

- Бізнес-модель, тіри, retention/churn UX →
  [01-monetization-and-pricing.md](./01-monetization-and-pricing.md):
  [Тарифні плани](./01-monetization-and-pricing.md#2-тарифні-плани),
  [Paywall](./01-monetization-and-pricing.md#6-технічна-реалізація-paywall),
  [Retention](./01-monetization-and-pricing.md#8-retention-і-churn-prevention).
- Launch фази, маркетинг, growth engine →
  [02-go-to-market.md](./02-go-to-market.md):
  [Фази](./02-go-to-market.md#1-стратегія-запуску-фази),
  [Pre-launch](./02-go-to-market.md#2-фаза-0--pre-launch),
  [Public launch](./02-go-to-market.md#4-фаза-2--public-launch).
- Технічна імплементація (env vars, week-by-week, бюджети) →
  [03-services-and-toolstack.md](./03-services-and-toolstack.md):
  [Env-змінні](./03-services-and-toolstack.md#5-env-змінні--повний-список-для-production),
  [Week-by-week](./03-services-and-toolstack.md#7-порядок-дій-week-by-week),
  [Costs](./03-services-and-toolstack.md#9-повна-monthly-cost-projection).
- Operations: 6 зон, n8n + OpenClaw, daily/weekly ритуал →
  [05-operations-and-automation.md](./05-operations-and-automation.md):
  [Зони](./05-operations-and-automation.md#1-шість-операційних-зон),
  [Ритуал](./05-operations-and-automation.md#3-daily--weekly--monthly-ритуал),
  [n8n + OpenClaw](./05-operations-and-automation.md#6-зона-6-у-деталях-n8n--openclaw).
