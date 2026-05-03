# ADR-0001: Monetization architecture (16 рішень перед стартом)

- **Status:** proposed
- **Date:** 2026-04-27
- **Last reviewed:** 2026-04-27 by @Skords-01
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/launch/01-monetization-and-pricing.md`](../launch/01-monetization-and-pricing.md) — бізнес-модель, тіри, ціни.
  - [`docs/launch/06-monetization-architecture.md`](../launch/06-monetization-architecture.md) — технічний скелетон v2 (PR-розбивка, schema, risk register).
  - [ADR-0003](./0003-refund-and-dispute-handling.md) — refund / dispute flow (закриває open question з ADR-1.11).
  - [ADR-0016](./0016-user-deletion-and-pii-handling.md) — account-deletion flow + Stripe customer cleanup.

---

## 0. TL;DR

Цей ADR фіксує **16 архітектурних рішень**, які повинні бути затверджені **до старту PR-M.1**. Без цього ADR код не починаємо: ці питання випливуть посеред PR-M.7 (Stripe webhook) як суперечливі і доведеться переробляти.

| #    | Тема                          | Decision (коротко)                                                                                                |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1.1  | Payment provider              | Stripe primary; LiqPay — Phase 2 (поза MVP)                                                                       |
| 1.2  | Schema design                 | Single-row-per-user `subscriptions`; audit trail у follow-up `subscription_events`                                |
| 1.3  | Plan-cache TTL + invalidation | RQ `staleTime: 60s`; server LRU `ttl: 300s` + Postgres NOTIFY → SSE                                               |
| 1.4  | Grandfather policy            | **Withdrawn** — немає legacy-юзерів на момент launch                                                              |
| 1.5  | Trial для нових юзерів        | 14 днів Pro без payment method; anti-fraud — hard requirement перед PR-M.10                                       |
| 1.6  | AI-ліміт для free             | 5 chat msg/day, 3 photo/day; ENV-driven, A/B-тестабельно без міграції                                             |
| 1.7  | requireAiQuota ↔ requirePlan  | requireAiQuota читає план; requirePlan — лише на не-AI gates                                                      |
| 1.8  | Webhook event-id retention    | 90 днів у `stripe_webhook_events`; cron-purge у follow-up                                                         |
| 1.9  | Currency                      | UAH only на MVP; USD/EUR через Stripe Multi-currency у Phase 7                                                    |
| 1.10 | Tax handling                  | MVP: Stripe Tax OFF, UAH only. Legal entity — hard blocker. ФОП — паралельно                                      |
| 1.11 | Cancellation flow             | `cancel_at_period_end=true`: Pro до `current_period_end`, потім auto-деграда. Refund/dispute — окремо в ADR-0003. |
| 1.12 | Dunning / past_due strategy   | 7-day Stripe Smart Retries → graceful degrade у `past_due` → cancel на 7-й день                                   |
| 1.13 | Proration / mid-cycle change  | Upgrade — `create_prorations`; downgrade — у `current_period_end` без proration                                   |
| 1.14 | Stripe API version pinning    | `STRIPE_API_VERSION` env-var; bump раз/квартал зі snapshot-тестами на webhook payload                             |
| 1.15 | Client idempotency keys       | UUID v4 на client-initiated `POST /billing/*`; 24h server-side dedup-table                                        |
| 1.16 | Billing observability / SLO   | Webhook-latency p95 < 5s; refund-rate alert > 2%/тиждень; MRR/churn dashboard у Grafana                           |

### Phase glossary

ADR посилається на «Phase N» декілька разів. Глосарій (синхронізовано з [`docs/launch/04-launch-readiness.md`](../launch/04-launch-readiness.md)):

| Phase | Тригер                                                                                | Що відкривається                                                                                |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | Зараз — pre-launch, MVP-розробка.                                                     | PR-M.0 ... M.10. UAH only, free + Pro, без cancel-flow ADR.                                     |
| 1     | Перші 10 paying users.                                                                | Validate paywall conversion, refund-flow exercises, manual dunning.                             |
| 2     | LiqPay як secondary provider.                                                         | Дублюємо Stripe-flow для UA-cards (BIN 4149).                                                   |
| 7     | 100 paying users **AND** monetization stable for ≥30 днів **AND** ФОП зареєстрований. | Stripe Tax ON, USD/EUR prices, `subscription_events` table, EU/UK VAT registrations за потреби. |
| 8     | 1K concurrent active users.                                                           | Redis pub/sub замість Postgres NOTIFY, WebSocket замість SSE, sharded Postgres.                 |

Точні цифри пере-валідуємо при кожному review цього ADR.

### Internal dependencies (sub-ADR-и)

| Залежний | Залежить від      | Чому                                                                                                 |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------------- |
| ADR-1.3  | ADR-1.2           | NOTIFY-trigger пишеться на schema з ADR-1.2.                                                         |
| ADR-1.6  | ADR-1.7           | FREE_LIMITS читаються middleware-ом з ADR-1.7.                                                       |
| ADR-1.7  | ADR-1.2, ADR-1.3  | `getUserPlan` читає subscriptions через `planCache`.                                                 |
| ADR-1.11 | ADR-1.3           | NOTIFY-trigger скидає cache на `cancel_at_period_end`-toggle.                                        |
| ADR-1.12 | ADR-1.11          | Past-due → cancel переходить у канонічний cancel-flow.                                               |
| ADR-1.13 | ADR-1.2, ADR-1.11 | Proration пише в той самий schema; downgrade використовує `cancel_at_period_end`-механіку.           |
| ADR-1.14 | ADR-1.8           | Snapshot-тести на webhook event-shape запускаються на тих самих payload-ах, що зберігаються 90 днів. |
| ADR-1.15 | ADR-1.8           | Серверна dedup-table — по структурі аналогічна `stripe_webhook_events`.                              |
| ADR-1.16 | усі 1.1–1.15      | Observability покриває увесь pipeline.                                                               |
| ADR-0003 | ADR-1.8, ADR-1.11 | Refund-flow використовує webhook-events і cancel-семантику.                                          |
| ADR-0016 | ADR-1.2           | Account-deletion змінює `subscriptions` row + Stripe customer.                                       |

---

## ADR-1.1 — Payment provider: Stripe primary, LiqPay Phase 2

### Status

accepted (proposed → потребує merge цього PR-у).

### Context

Sergeant стартує в Україні. Для українських юзерів існує два реалістичні варіанти приймання платежів:

1. **Stripe** — глобальний, добре документований, повний SDK, customer portal, automatic tax, dispute management. Stripe на 2024-04 офіційно **не доступний для українських ФОП** як seller-account, але доступний для **Wise/Cyprus/Estonia** entity-структур, які багато локальних founder-ів вже використовують. Комісія: 2.9% + €0.25 для EU карт.
2. **LiqPay** (Privat24) — український, ФОП-friendly, нижча комісія (1.5–2.7%), але обмежений SDK, поганий webhook reliability, відсутній customer portal — треба будувати UI самим.

### Decision

**Stripe — primary provider.** LiqPay — Phase 2 (після MVP) як вторинний для українських юзерів, які не хочуть платити Stripe-комісію в EUR/USD.

### Consequences

**Позитивні:**

- Готовий Customer Portal — юзер сам керує підпискою, без нашого UI.
- Stripe Tax automatic — РСТ/VAT для EU, NDS для UA — Stripe рахує сам.
- Idempotent webhooks по `event.id` — пишемо один endpoint, retry-safe.
- Stripe має тестовий mode + Stripe CLI для локальної webhook-симуляції.

**Негативні:**

- Юридична структура: треба Wise / Estonian e-Residency / Cyprus LLC. На MVP — допустимо, бо вже є.
- Комісія в EUR при отриманні в UAH — додатковий FX spread ~1.5%.
- Stripe не приймає українські картки 4149 BIN — більшість юзерів платить картками інших банків. Acceptable на MVP (Privat domestic UA-cards залишаємо для LiqPay Phase 2).

### Alternatives considered

- **LiqPay primary**: відкинуто через відсутність Customer Portal, обмеженою webhook-документацією, складнішою interpretation refunds.
- **Mono Acquiring**: Mono pay-in API готовий тільки для b2c-merchants з фіз. товарами; для SaaS-підписок офіційного контракту немає (на 2026-04). Phase 3.
- **Paddle**: closed merchant-of-record, всі ризики на них, але комісія 5%+ і слабша tax-coverage у країнах, де ми будемо рости (UA, PL, EN).

---

## ADR-1.2 — Schema design: single-row-per-user

### Status

accepted.

### Context

Для зберігання підписок є два архітектурні патерни:

1. **Single-row-per-user**: одна `subscriptions` row на юзера, поточний стан перезаписується. Простіше query, простіше middleware (`SELECT * FROM subscriptions WHERE user_id = $1`).
2. **Append-only event log**: кожна зміна підписки — новий рядок (`subscription_events`); поточний стан — projection. Складніше, але повна історія аудиту "out of the box".

Для MVP нам потрібна швидка `getUserPlan(userId)`-перевірка на кожному API-запиті. Append-only вимагає або materialized view, або снапшот-таблиці — додаткова складність.

### Decision

**Single-row-per-user `subscriptions` table.** Аудит-трейл — окрема `subscription_events` table як **follow-up Phase 7** (поза MVP), що append-only-логує кожен webhook-event.

Schema див. [`docs/launch/06-monetization-architecture.md` §3.1](../launch/06-monetization-architecture.md#31-migration-009--subscriptions-правки-v1).

### Consequences

**Позитивні:**

- `getUserPlan(userId)` — single PK lookup, cacheable.
- Просто читати у Studio / psql без projection.
- Webhook handler upsert-ить one row замість append.

**Негативні:**

- Втрата історії підписок — після merge-у з Phase-7 events table, історію до того часу неможливо відновити (тільки те, що Stripe пам'ятає).
- Складніше робити cohort-аналіз "коли юзер X конвертнувся в Pro, скільки разів був past_due, ...". Mitigation: `stripe_webhook_events` таблиця зберігає raw events 90 днів.

### Alternatives considered

- **Append-only `subscription_events` зразу:** відкинуто через додаткову складність projection layer. Plan-перевірка на кожному запиті стає latest-event lookup замість PK-lookup — gain не виправдовує MVP-час.
- **Stripe як source of truth, без локального дублювання:** відкинуто, бо кожен API-запит з `requirePlan()` робив би 1 RTT до Stripe → +200ms latency. Кешувати без локальної БД — складніше.

---

## ADR-1.3 — Plan-cache TTL + invalidation

### Status

accepted.

### Context

`requirePlan()` middleware викликається на кожному захищеному ендпоінті. Без кешу — `SELECT FROM subscriptions` на кожен запит. З кешом — потрібна стратегія invalidation коли план змінюється (cancel, upgrade, past_due → active).

Stale plan = серйозний bug:

- Канселед Pro-юзер з cache-hit на 5 хвилин → користується Pro безкоштовно.
- Свіжий-апгрейднутий free → бачить paywall ще 5 хвилин.

### Decision

**Двошаровий кеш з NOTIFY-based invalidation:**

1. **Server LRU cache:** `lru-cache` з `ttl: 300s`, `max: 5_000`. Очищується миттєво через Postgres NOTIFY-trigger `subscription_changed` → server `LISTEN`-loop робить `planCache.delete(userId)`.
2. **Client RQ cache:** `staleTime: 60s`, `refetchOnWindowFocus: true`. Серверний SSE-stream `/api/me/plan-stream` емітить `updated`-event → клієнт `queryClient.invalidateQueries(billingKeys.plan())`.

Trigger див. [`docs/launch/06-monetization-architecture.md` §3.1](../launch/06-monetization-architecture.md#31-migration-009--subscriptions-правки-v1).

### Consequences

**Позитивні:**

- Latency на захищеному ендпоінті: ~0.1ms cache hit замість 2-5ms DB query.
- Stale-window: < 1s після webhook-у (NOTIFY → cache delete) у нормальних умовах.
- Без NOTIFY — fallback `staleTime` 60s гарантує eventual consistency.

**Негативні:**

- Memory cost: 5K юзерів × ~200 bytes = ~1MB per server instance. Прийнятно.
- Якщо Postgres LISTEN connection падає — cache не invalidate-иться. Mitigation: `LISTEN` reconnect-loop + Sentry alert на `pg_listen_disconnect_total` рост.
- SSE з'єднання — extra resource per connected client. На MVP < 1K concurrent — ok. На scale (Phase 8) — можливо WebSocket upgrade.

### Alternatives considered

- **Redis pub/sub:** додає інфраструктурну залежність на MVP. Postgres NOTIFY — вбудоване, безкоштовне, достатньо для < 100 webhook/min.
- **TTL-only без invalidation:** відкинуто через критичність stale Pro / canceled.
- **Polling кожні 30s:** відкинуто — спам-load на сервер при scale.

---

## ADR-1.4 — Grandfather policy: withdrawn

### Status

**withdrawn (2026-04-27).** Цей sub-ADR ніколи не дійшов до `accepted` — рішення відкликане у тому самому PR-і, що додав ADR-0001 (бо немає legacy-юзерів на момент launch, окрім автора-розробника). Grandfather-механізм не потрібен — немає legacy-когорти, яку треба грейсити. Див. README §«Status enum» — `withdrawn` означає саме це: розглядалось, не дійшло до merge.

### Context (historical)

Раніше планувалося давати всім юзерам з `created_at < 2026-05-01` статус `legacy_grace` на 90 днів, щоб після ввімкнення paywall не зник доступ до CloudSync / AI / photo-analyze. Це мало запобігти churn-у і соцмережному bash-у.

### Why withdrawn

- Немає legacy-юзерів на момент launch — тільки dev-акаунт автора.
- Автору Pro видається вручну (`INSERT INTO subscriptions` з `plan='pro', status='active'`, або через Stripe test customer).
- Якщо до запуску зʼявляться beta-юзери — відкриваємо новий ADR (TBD) з конкретною когортою і строками.

### Consequences

- Migration `011_grandfather_existing_users.sql` — **не створюється**.
- Status `legacy_grace` — **не додається** до схеми (ADR-1.2 трохи спрощується: enum статусів без `legacy_grace`).
- Email/in-app banner кампанія про закінчення grace-періоду — відмінена.
- PR-M.4 — **removed** з Implementation tracker.

### Alternatives considered

See original version in git history (`git log docs/adr/0001-monetization-architecture.md`).

---

## ADR-1.5 — Trial для нових юзерів: 14 днів Pro без payment method

### Status

accepted.

### Context

Onboarding-конверсія для freemium-продуктів значно вища при trial-flow ([Lenny Rachitsky 2024](https://www.lennysnewsletter.com/p/what-is-a-good-free-to-paid-conversion): 8-25% trial-to-paid vs 2-5% freemium-to-paid). Для нашого продукту, де реальна цінність розкривається після 2-3 тижнів використання (звички, фінансові патерни), critical зрозуміти продукт повністю.

### Decision

**14 днів Pro trial при реєстрації, без payment method.** По закінченню → free + paywall на Pro-features.

- `subscriptions.status = 'trialing'`, `current_period_end = NOW() + 14 days`.
- Cron щоночі (`scripts/expire-trials.mjs`) переводить `expired` trial-и в `free`.
- Користувач може upgrade-нути в будь-який момент trial → `active` Pro.

**Anti-fraud (hard requirement, Phase 7 — НЕ optional):**

- Один trial per email (unique constraint + перевірка normalized email: lowercase + strip `+tag`).
- Один trial per device fingerprint через Better Auth session metadata (user-agent + IP + canvas-hash).
- Rate limit: не більше 3 нових акаунтів з одного IP / 24h.
- Якщо юзер signup-ає з email, нормалізована форма якого вже має completed-trial → `status='free'` без trial (без error).
- Метрики: `trial_abuse_detected_total{reason}` у Sentry + weekly review.

Без цих anti-fraud guards PR-M.10 (`PAYWALL_ENABLED`) **не мерджиться**.

### Consequences

**Позитивні:**

- Низький friction onboarding — без payment-card форми.
- Конверсія значно вища (історично 8-25% vs 2-5% freemium).
- Onboarding wizard може показувати реальні Pro-фічі без paywall-блоків.

**Негативні:**

- Trial-abuse вимагає anti-fraud guards (hard requirement) перед PR-M.10 — див. Decision.
- Free-tier фічі стають "downgrade-experience" після trial. Mitigation: до закінчення trial — banner з конкретною ціною і CTA.

### Alternatives considered

- **Trial з payment method (ASAP charge):** вище 2× конверсія, але friction в onboarding fail-ить activation rate. Phase 7 — A/B-test.
- **7 днів trial:** замало щоб освоїти 4 модулі (Finyk + Fizruk + Routine + Nutrition).
- **30 днів trial:** дорожче. 14 — золота середина для productivity-apps (Notion, ClickUp, Todoist).

---

## ADR-1.6 — AI-ліміт для free: 5 chat / 3 photo

### Status

accepted (revertable без міграції — ENV-driven).

### Context

`requireAiQuota` зараз тримає liмит 120 chat/day per user (`AI_DAILY_USER_LIMIT`). Після monetization — free має різний liмит від Pro. Питання: який саме liмит для free.

### Decision

**Free тіr:**

- 5 chat-повідомлень / day
- 3 photo-аналізів / day
- 0 AI-brifing-ів / day (повністю за paywall)
- 0 day-summary-ів / day (повністю за paywall)

**Pro тіr:** unlimited (null), але soft warning у Sentry якщо single user > 1000 msg/day (потенційно abuse або bot).

Числа в `ENV-vars`: `PLAN_FREE_AI_CHAT_PER_DAY`, `PLAN_FREE_AI_PHOTO_PER_DAY` — **A/B-test без міграції**.

### Consequences

**Позитивні:**

- 5/3 ліміти достатньо щоб юзер відчув цінність AI, але не закрив daily-need.
- Banner "5/5 повідомлень. Перейди на Pro" — сильний conversion-trigger.
- ENV-driven → можемо A/B-test 3/5/10 і дивитись `free_to_paid_conversion_rate` без deploy-cycle.

**Негативні:**

- 5 msg/day може бути замало для power-users → frustration і churn замість conversion. Mitigation: показувати banner з конкретною ціною і CTA (не помилку 429).
- Photo-analyze 3/day — дорого для юзера, який реально юзає nutrition daily. Mitigation: explicit "lock icon" на 4-му використанні з roadmap CTA.

### Alternatives considered

- **3 chat/day:** замало для PMF — юзер не встигне зрозуміти продукт.
- **10 chat/day:** забагато — 90% free-юзерів вкладуться у liмит, conversion не trigger-иться.
- **Token-based liмит:** складніше комунікувати. "5 повідомлень" — простіше у банері.

---

## ADR-1.7 — Coordination з existing `requireAiQuota`

### Status

accepted.

### Context

`apps/server/src/modules/chat/aiQuota.ts` уже має `effectiveLimits()` що читає `AI_DAILY_USER_LIMIT` з ENV. Питання: як інтегрувати monetization без дублювання middleware.

### Decision

`requireAiQuota` стає **plan-aware**:

```ts
// apps/server/src/modules/chat/aiQuota.ts (PR-M.6)
export async function effectiveLimits(userId: string | null): Promise<Limits> {
  if (!userId) return ANONYMOUS_LIMITS;
  const sub = await getUserPlan(userId); // ← з planCache
  const eff = effectivePlan(sub);
  return eff === "pro" ? PRO_LIMITS : FREE_LIMITS;
}
```

- `requirePlan(feature)` — лише на **не-AI feature gates** (cloudSync, exportCsvPdf, weekComparison...).
- `requireAiQuota` залишається на AI-ендпоінтах (`/api/chat`, `/api/coach`, `/api/photo-analyze`) і сам читає план.
- **Не додаємо `requirePlan("aiChatPerDay")` поверх `requireAiQuota`** — це дублювання.

### Consequences

**Позитивні:**

- DRY — одна точка enforcement на AI-ендпоінти.
- Мінімум LOC у PR-M.6 (~200 LOC, лише refactor `effectiveLimits`).
- Backwards-compat — старі snapshot-тести `effectiveLimits` залишаються валідними після adapter-у.

**Негативні:**

- `requireAiQuota` тепер залежить від `getUserPlan` → tighter coupling. Mitigation: інтерфейс `PlanProvider` для test-injection.
- Cache-invalidation помилка на план може silently повернути старий liмит. Mitigation: `plan_cache_hit_total{outcome}` метрика з alert на rate stale.

### Alternatives considered

- **Дублювати liмит-перевірку в requirePlan:** відкинуто, два middleware на одному ендпоінті — складно і легко розіграти.
- **Зробити requireAiQuota dumb (фіксований liмит) + requirePlan smart:** підвищує latency через 2 окремі DB-checks на запит.

---

## ADR-1.8 — Webhook event-id retention: 90 днів

### Status

accepted.

### Context

`stripe_webhook_events` таблиця гарантує idempotency через `event_id PRIMARY KEY`. Питання: як довго тримати rows. Stripe гарантує retry up to 3 days. Але ми використовуємо table також для:

1. Audit-trail (raw event payload).
2. Debugging webhook-проблем.
3. Replay (якщо handler був buggy і потрібно переграти події).

### Decision

**Retention: 90 днів.** Cron щоночі (`scripts/purge-stripe-webhooks.mjs`) видаляє `WHERE processed_at < NOW() - INTERVAL '90 days'`.

Cron-script — Phase 7 (поза MVP). На MVP таблиця росте необмежено (~10K events / місяць max — manageable).

### Consequences

**Позитивні:**

- 90 днів покриває quarterly audit + дебаг більшості inci.
- Idempotency-window далеко за Stripe-retry-window (3 days) — гарантовано safe.
- Phase 7 cron — простий `DELETE` без ризику розгону БД.

**Негативні:**

- При scale (~1M events/year) → ~250K rows × ~5KB JSON = ~1.25GB. Postgres з цим легко справиться.
- Якщо знадобиться > 90 днів audit (наприклад, dispute) — raw payload втрачено. Mitigation: для dispute-events окремий `disputes` table з infinite retention.

### Alternatives considered

- **Infinite retention:** прийнятно для MVP, відкладено до Phase 7. Цей ADR закладає 90 днів proactively.
- **30 днів:** замало для quarterly audit cycles.
- **365 днів:** надлишково; всі важливі дані вже є в `subscriptions` + Stripe Dashboard.

---

## ADR-1.9 — Currency: UAH primary, USD secondary через Stripe Multi-currency

### Status

accepted.

### Context

Sergeant запускається в Україні. Ціни в `01-monetization-and-pricing.md` зафіксовані в UAH (₴99/міс, ₴799/рік). Для майбутнього (Польща, англомовні) потрібна готовність до multi-currency.

### Decision

**MVP: UAH only.** Stripe Price-ID-и в UAH (`STRIPE_PRICE_ID_PRO_MONTHLY` = UAH 99/month).

**Phase 7 (post-launch):** додати USD prices (через Stripe Multi-currency):

- Stripe Price з `currency_options: { uah: ..., usd: ..., eur: ... }`.
- Browser-locale → preferred currency (UA → UAH, PL → PLN, \_ → USD default).
- UI-toggle для override.

### Consequences

**Позитивні:**

- Stripe Multi-currency готовий до використання — без міграції в Phase 7.
- На MVP UI рендерить тільки UAH — простіше.

**Негативні:**

- Foreigners на MVP бачать UAH-ціну — friction. Acceptable для українського-target launch.
- FX-spread 1.5% на конверсії UAH → EUR (Stripe's payout currency). Закладено у економіку.

### Alternatives considered

- **USD primary:** змінює таргет-аудиторію на global. Поза scope MVP launch (UA-focus).
- **EUR primary:** non-friendly UAH-юзерам, які бачать вартість через Privat-курс.

---

## ADR-1.10 — Tax handling: Stripe Tax OFF на MVP, legal entity — hard blocker

### Status

accepted (operations side, не код).

### Context

Sergeant продаватиме SaaS-підписки. Треба розрізнити **два контури**:

1. **Юр-структура** для прийому платежів через Stripe — hard-блокер незалежно від Tax.
2. **Розрахунок tax / VAT** в інвойсі — залежить від юрисдикцій покупців.

Український ФОП Stripe **не підтримує** як merchant account. MVP таргетить лише UA-резидентів у UAH (ADR-1.9). Автор на момент написання ADR не має ні non-UA entity, ні зареєстрованого ФОП.

### Decision

**Legal entity (hard blocker, перед PR-M.7):**

- Потрібна non-UA entity для Stripe merchant account — один з: Wise Business, Estonian e-Residency + OÜ, Cyprus LLC, US LLC через Stripe Atlas, Polish sp. z o.o. / ФОП.
- Без активованого Stripe account PR-M.7 (webhook handler) **не мерджиться** — блокер для launch.

**Stripe Tax:**

- **MVP: `STRIPE_TAX_ENABLED=false`.** Продаємо лише UA-резидентам у UAH без VAT у інвойсі.
- **Phase 7:** синхронно з ADR-1.9 (USD/EUR prices) вмикаємо `STRIPE_TAX_ENABLED=true`. Stripe рахує VAT для EU/UK/US автоматично.
- На staging Stripe Tax вмикаємо заздалегідь для e2e-тестів інвойсів.

**ФОП 3-тя група (operations, не код):**

- Реєструється **паралельно** з розробкою PR-M.7, не блокує код.
- Потрібна для української звітності (декларація доходу, 5% єдиний податок).
- Облік через Privat24-API / Taxer / Вчасно — окремий контур, не в продукті.

### Consequences

**Позитивні:**

- На MVP compliance-surface мінімальний — тільки UA-резиденти в UAH, без cross-border VAT.
- Код PR-M.7 простіший: не треба обробляти `invoice.tax_total` у webhook.
- Stripe Tax (і +0.5% fee) увімкнемо лише коли реально потрібен — у Phase 7.

**Негативні:**

- Legal entity setup займає 1–4 тижні (e-Residency довше, Wise швидше) — має бути готова ДО PR-M.7. Мітігейт: автор починає процес паралельно з PR-M.1.
- ФОП-реєстрація протягом першого місяця після запуску — дедлайн від першого доходу (ст. 177 ПКУ). Не блокує код, але календарно критично.
- При вмиканні Stripe Tax у Phase 7 треба пройти registration у кожній юрисдикції (EU OSS, UK VAT, US states через Stripe).

### Alternatives considered

- **Stripe Tax ON з MVP:** зайвий compliance-burden для UA-only launch у UAH. Відкинуто.
- **Manual tax:** дорого по часу, помилкам, compliance-ризику. Відкинуто.
- **Paddle merchant-of-record:** Paddle бере compliance на себе (не треба entity), але комісія 5%+ — економічно гірше, плюс Paddle слабший у UA/EE. Переглянемо якщо Stripe account не вдається активувати.
- **Продавати як фіз-особа через monobank Acquiring:** не підходить для SaaS-підписок (ADR-1.1).

---

## ADR-1.11 — Cancellation flow: cancel-at-period-end semantics

### Status

accepted.

### Context

Коли Pro-юзер скасовує підписку **до кінця оплаченого періоду**, він вже заплатив за весь місяць/рік. Відбирати Pro одразу — unfair (refund-flow складний). Залишати Pro назавжди — явний bug. Stripe за замовчуванням підтримує `cancel_at_period_end` flag — юзер залишається active до кінця періоду, потім автоматично деграда. Треба зафіксувати це як канонічний flow і пояснити як він взаємодіє з plan-cache (ADR-1.3).

### Decision

**Canonical cancel flow — `cancel_at_period_end=true`, auto-деграда у `customer.subscription.deleted`.**

1. **Cancel initiation:** юзер тисне «Cancel subscription» у Stripe Customer Portal (або власному UI, який робить `subscriptions.update({ cancel_at_period_end: true })`).
2. **Webhook `customer.subscription.updated`:** ми апдейтимо рядок: `status='active'`, `cancel_at_period_end=true`, `current_period_end` без змін.
3. **До `current_period_end`:** `effectivePlan()` повертає `pro`. UI показує банер «Pro активний до {period_end}, далі Free. [Поновити]».
4. **На `current_period_end`:** Stripe шле `customer.subscription.deleted` → ми ставимо `status='canceled'`, `plan='free'`, `current_period_end=null`. NOTIFY-тригер з ADR-1.3 скидає `planCache` миттєво. Клієнт отримує SSE `updated` → refetch плану.
5. **Resume:** якщо юзер до `current_period_end` передумав → натискає «Resume» у Customer Portal → Stripe шле `updated` з `cancel_at_period_end=false` → ми апдейтимо.

### Schema implications (добавка до ADR-1.2)

- `subscriptions.cancel_at_period_end BOOLEAN NOT NULL DEFAULT false`
- `subscriptions.current_period_end TIMESTAMPTZ` (вже є в ADR-1.2 §3.1).
- `effectivePlan()` логіка:

```ts
if (status === "active" || status === "trialing") return plan; // "pro"
if (status === "canceled" && current_period_end && now < current_period_end)
  return plan; // rare edge: Stripe прислав deleted раніше period_end
return "free";
```

### Consequences

**Позитивні:**

- Fairness: юзер отримує те, за що заплатив.
- Немає refund-flow для звичайних cancel — лише для disputes (окрема логіка, не в цьому ADR).
- Plan-cache ADR-1.3 працює без змін — NOTIFY-тригер скидається на КОЖЕН update рядка, в т.ч. на `cancel_at_period_end`-toggle.

**Негативні:**

- UI повинен явно відображати «Pro до {date}» — інакше юзер думає що cancel миттєвий і скаржиться.
- Resume-flow має pre-renewal логіку: якщо юзер resume-ає в останній день, webhook може race з auto-renewal. Мітігейт: показувати «Resume» CTA disabled за 1h до `current_period_end`.

### Alternatives considered

- **Immediate cancel з pro-rata refund:** складніший код (proration math), Customer Portal не робить за замовчуванням. Відкинуто.
- **Immediate cancel без refund:** unfair — юзер заплатив, не отримав, churn гарантовано. Відкинуто.
- **Окремий ADR про refund/dispute flow:** винесено в [ADR-0003](./0003-refund-and-dispute-handling.md) — закрито у тому самому PR-і.

---

## ADR-1.12 — Dunning / past_due retry strategy

### Status

proposed.

### Context

Коли charge на recurring-invoice fails (картка expired, недостатньо коштів, do_not_honor), Stripe виставляє `invoice.payment_failed` і робить retry. Без зафіксованої dunning-strategy ми ризикуємо одним з двох:

1. **Занадто агресивно cancel-нути:** юзер на 1 день в bus-trip без 4G — карта пропустила одну спробу — підписку вирубили. Втрачаємо payments, які могли б успішно retry-нути.
2. **Занадто м'яко** — юзер 30 днів користується Pro без оплати, churn-имо лише після місяця.

Stripe Smart Retries покриває (1) — використовує ML на кожен retry-attempt і має reasonable defaults. Питання: коли саме ми переходимо у `past_due` (кеш скидається? UI показує banner?), і коли остаточно cancel-имо.

### Decision

**7-day soft window зі Stripe Smart Retries**, потім авто-cancel:

1. **Day 0 (`invoice.payment_failed`):** `subscriptions.status='past_due'`. UI показує **non-blocking banner** «Не вдалось списати оплату. Поновіть картку у [Customer Portal]». Pro-фічі **продовжують працювати** — `effectivePlan()` повертає `pro` для `past_due` ще 7 днів.
2. **Day 1-6:** Stripe Smart Retries (3-4 attempts) на свій графік. Кожна успішна спроба — `invoice.paid` → `status='active'`, banner зникає. Web-app шле email-нагадування на day 3 (`scripts/dunning-reminders.mjs`, cron).
3. **Day 7 (`customer.subscription.deleted` від Stripe):** ми ставимо `status='canceled'`, `plan='free'`, NOTIFY-тригер з ADR-1.3 миттєво invalidate-ить cache. Email «Підписку призупинено». Anti-pattern: **не блокуємо** read-only доступ до існуючих даних — лише Pro-features.
4. **Re-subscribe** (новий checkout) — стандартний flow, без legacy stigma.

`effectivePlan()` логіка з ADR-1.11 розширюється:

```ts
if (status === "past_due" && current_period_end && now < current_period_end + 7d) return plan; // grace
if (status === "past_due") return "free"; // після 7 днів, але ще не прийшов customer.subscription.deleted
```

### Consequences

**Позитивні:**

- Stripe Smart Retries — індустріальний стандарт; Stripe-recovery rate ~25-40% на failed-charge-ах.
- 7-day grace навмисно >= longest-Smart-Retry-window (~6 днів) — гарантуємо, що cancel приходить **після** усіх retry, не паралельно.
- UI banner — не paywall — зменшує churn від transient помилок.

**Негативні:**

- Якщо юзер свідомо «забув» поновити картку — ми безкоштовно даємо 7 днів Pro. Acceptable: це <1% MRR, дешевше ніж агресивні cancel-flow + customer-success.
- Email-нагадування потребує `apps/server` cron + transactional email integration. Це **окремий блокер** перед PR-M.10 (paywall enable). Виноситься у PR-M.13.

### Alternatives considered

- **Immediate cancel on `payment_failed`:** false-positive rate занадто високий для нашої когорти (UA-юзери, FX-flaky cards).
- **30-day grace:** забагато — заохочує abuse.
- **Hard paywall у grace-period:** UX-friction, churn значно вищий ніж дозволяти Pro з banner-ом.

---

## ADR-1.13 — Proration / mid-cycle plan change

### Status

proposed.

### Context

Коли юзер міняє план посеред періоду (monthly → yearly upgrade, або yearly → monthly downgrade, або просто змінює tier), Stripe має параметр `proration_behavior`:

- `create_prorations` — нараховує credit за невикористаний час старого плану і списує доплату за новий, **миттєво**.
- `none` — нова ціна стартує з наступного `current_period_end`, без credit.
- `always_invoice` — створює invoice одразу.

Без зафіксованої політики upgrade-flow стане «то-так-то-сяк», а downgrade — джерелом disputes.

### Decision

**Asymmetric: upgrade — `create_prorations`, downgrade — `cancel_at_period_end`-style.**

1. **Upgrade (monthly→yearly або free→Pro mid-cycle):**
   - `proration_behavior='create_prorations'`.
   - Юзер платить delta негайно. Stripe credit за невикористані дні старого плану автоматично applied.
   - `subscriptions` row update-иться через `customer.subscription.updated` webhook.
2. **Downgrade (yearly→monthly або Pro→free):**
   - **Не proration.** Старий план активний до `current_period_end`, далі вмикається новий (або `free`).
   - Семантично використовуємо ту саму механіку, що ADR-1.11 (`cancel_at_period_end=true` + `subscription_schedules` у Stripe для майбутнього price-switch).
   - UI показує «Поточний план Pro Yearly до {date}, потім Pro Monthly».
3. **Same-tier change (наприклад, monthly Pro re-subscribe після cancel):** окремий checkout, не proration. Без edge-cases.

### Consequences

**Позитивні:**

- Upgrade — мінімальний UX-friction, юзер одразу отримує більше value.
- Downgrade — без unexpected refund-disputes («чому я отримав менше, ніж очікував?»).
- Code complexity мінімальна: один webhook-handler різниться по `proration` value.

**Негативні:**

- Edge case: upgrade за 1 день до `current_period_end` створює тривіально малий proration credit (~0.03×). Acceptable — Stripe сам фільтрує < $0.50 credits.
- Downgrade-«lock-in»: юзер чекає до `current_period_end` щоб отримати нижчий план. Можна зрозуміти як friction, але це industry-norm (Notion, Linear, Spotify працюють так само).

### Alternatives considered

- **`always_invoice` для всіх змін:** генерує багато invoice-ів з малими сумами — bookkeeping noise.
- **`none` для upgrade:** юзер платить за старий план до кінця періоду — упускаємо upgrade momentum.
- **Pro-rata refund на downgrade:** Stripe не робить це автоматично, потрібен власний refund-flow → плодить disputes (див. ADR-0003).

---

## ADR-1.14 — Stripe API version pinning

### Status

proposed.

### Context

Stripe випускає нову API-версію кожні 3-6 місяців. Кожна версія може змінити webhook event payload shape (поля додаються — backwards-compatible; поля переіменовуються — breaking). За замовчуванням SDK використовує **аккаунт-default-версію**, яка міняється automatically коли Stripe нас «грейсово апгрейдить» (зазвичай через 12 місяців без opt-out).

Без explicit pinning ми ризикуємо: webhook-handler написаний під версію X, Stripe тихо переключив account на X+1 — payload змінився — handler crashes — 5xx у webhook → Stripe retry → eventually drop.

### Decision

**Pin Stripe API version через ENV-var + snapshot test.**

1. `STRIPE_API_VERSION` (наприклад, `2025-12-01.preview`) у `apps/server/src/env/env.ts`. Required env-var у `staging` і `production`.
2. Stripe SDK constructor: `new Stripe(secretKey, { apiVersion: env.STRIPE_API_VERSION })`. Це **робить запити Stripe API** через цю версію + **інтерпретує webhooks** як цю версію (Stripe нормалізує payload до запитаної версії, незалежно від account-default).
3. **Snapshot-тести** webhook payloads (`apps/server/src/modules/billing/webhook.test.ts`) фіксують shape для зафіксованої версії. Якщо хтось бампає `STRIPE_API_VERSION` без оновлення snapshots — CI fails.
4. **Bump policy:**
   - Quarterly review: чи є нова Stripe-version з фічами, які нам цікаві (наприклад, новий tax-метод).
   - Bump через окремий PR з: новий `STRIPE_API_VERSION` + перегенеровані snapshot-и + manual test через Stripe CLI proxy на staging.
   - Production-deploy bump-у — окремий 1-line PR, як у ADR-2.4 (фаза 3 для AI-tools). 24h на staging перед production.

### Consequences

**Позитивні:**

- Detерміністичний webhook payload — handler-и стабільні.
- Migration to new version — explicit процес, не silent breakage.
- Snapshot-тести служать regression-suite-ом і живою специфікацією webhook-shape-ів.

**Негативні:**

- Quarterly maintenance overhead (~2-4 години на bump).
- Можемо пропустити security-фікси у «свіжих» Stripe-версіях. Mitigation: subscribe на Stripe Engineering blog.

### Alternatives considered

- **No pinning, account-default:** silently breaks. Відкинуто.
- **Auto-bump на CI cron:** ризиковано — Stripe-bump-и іноді мають breaking changes у нюансних edge-cases (`invoice.lines` shape).

---

## ADR-1.15 — Client-initiated idempotency keys

### Status

proposed.

### Context

Webhook-idempotency покривається ADR-1.8 через `event.id PRIMARY KEY`. Але є інша сторона: client → server mutations (наприклад, `POST /api/billing/checkout-session`, `POST /api/billing/cancel`). Без idempotency:

1. Юзер двічі тисне «Subscribe» (network lag) → 2 Stripe checkout sessions → інколи 2 paid customers.
2. Web-app retries POST на 502 → server вже створив Stripe customer першим запитом → дубль.
3. Mobile: background-fetch retry після crash → дубль.

### Decision

**UUID v4 idempotency-key, передається у `Idempotency-Key` HTTP header. 24-годинний server-side dedup.**

1. **Client side:**
   - Web: `crypto.randomUUID()` генерується на mount`<CheckoutButton />`-component-у; той самий ключ retry-їться на network errors.
   - Mobile: те саме через `expo-crypto` `randomUUID()`.
   - api-client wrapper (`packages/api-client/src/billing.ts`) додає header автоматично, якщо метод позначений `idempotent: true`.
2. **Server side:**
   - Middleware `requireIdempotencyKey` (`apps/server/src/middleware/idempotency.ts`) на mutation-ендпоінтах (`POST /billing/*`, `POST /account/delete`).
   - Dedup-table `idempotency_keys (key TEXT PRIMARY KEY, user_id UUID, response_body JSONB, http_status INT, created_at TIMESTAMPTZ)`.
   - При першому запиті — handler виконується, response кешується у table.
   - При повторному з тим самим key + user — повертаємо cached response (без виконання handler-а).
   - Cleanup: `DELETE WHERE created_at < NOW() - INTERVAL '24 hours'` — daily cron (Phase 7).
3. **Stripe API:** Stripe SDK має власний `idempotencyKey` параметр на `customers.create` / `subscriptions.create`. Передаємо туди той самий ключ — Stripe також робить dedup.
4. **Errors:** якщо handler упав з 5xx — **не кешуємо**. Наступний retry зможе спробувати знову.

### Consequences

**Позитивні:**

- Подвійні clicks / retry-storms — безпечні.
- Stripe не створює дубль customers / subscriptions.
- Dedup-table сам по собі — audit trail (хто, коли, з яким key, що відповіли).

**Негативні:**

- Додатковий PK lookup на кожен mutation. Acceptable — це мікросекунди, billing-ендпоінти rare.
- Memory: 24h × ~100 mutations/day × 5KB = ~12MB. Negligible.
- Складніша client logic: ключ треба генерувати **до** першого retry-attempt-у. RQ-mutation hook має бути key-aware.

### Alternatives considered

- **Hash-based idempotency** (`hash(payload + user_id)`): не покриває case, коли юзер змінив payload навмисно (e.g., два різні plan-id). Відкинуто.
- **Client-side debounce only:** не покриває cross-tab / cross-device retries. Відкинуто.
- **Stripe `Idempotency-Key` only, без власної dedup:** не покриває **наш** server state (наприклад, ми створили audit-row перед Stripe-call → дубль audit-row).

---

## ADR-1.16 — Billing observability and SLO

### Status

proposed.

### Context

Billing pipeline = critical path. Сlient checkout → server → Stripe → webhook → DB → cache invalidation → UI update. Будь-яка ланка може тихо зламатися: Stripe webhook lag, DB transaction deadlock, NOTIFY-trigger drop, SSE disconnect. Без observability ці failures починають вилазити через user-complaints у Telegram, не через alert.

Зараз `apps/server/src/obs/` має базову Prometheus-інфру; `docs/observability/SLO.md` визначає загальні SLO. Питання: які саме метрики **specifically** для billing, і які thresholds.

### Decision

**Метрики (Prometheus):**

| Метрика                                          | Тип       | Threshold / SLO                                              |
| ------------------------------------------------ | --------- | ------------------------------------------------------------ |
| `stripe_webhook_received_total{event_type}`      | counter   | (raw rate)                                                   |
| `stripe_webhook_latency_seconds{event_type}`     | histogram | p95 < 5s, p99 < 15s. Alert при p95 > 10s 5хв поспіль.        |
| `stripe_webhook_errors_total{event_type, error}` | counter   | error_rate > 1% за 5 хв → Sentry alert.                      |
| `subscriptions_state_total{plan, status}`        | gauge     | Daily snapshot. Source-of-truth для MRR-розрахунку.          |
| `plan_cache_hit_ratio`                           | gauge     | > 95% (ADR-1.3 cache hit rate).                              |
| `notify_listener_disconnected_total`             | counter   | > 0 / hour → alert (cache invalidation сломаний — ADR-1.3).  |
| `idempotency_key_duplicate_total`                | counter   | (raw rate; для baseline) — ADR-1.15.                         |
| `refund_initiated_total{reason}`                 | counter   | weekly_rate > 2% від `subscriptions_active` → Sentry alert.  |
| `dunning_recovery_total{outcome}`                | counter   | 7-day recovery rate < 20% → alert (Smart Retries не працює). |
| `dispute_created_total{reason_code}`             | counter   | > 0 / тиждень → Sentry — потребує ручного triage.            |

**Dashboard:** `docs/observability/dashboards.md` — додати секцію `Billing` з Grafana-board JSON. PR-M.16 покриває це.

**SLO targets (перші 90 днів post-launch):**

- Webhook end-to-end latency p95 < 5s.
- DB-update після webhook → cache-invalidation latency p95 < 1s.
- MRR retention за 30-day window > 90%.
- Refund rate < 2% / тиждень від active-subscriptions.
- Dispute rate < 0.5% / місяць від всіх charges.

Thresholds — **initial heuristic**, ревалідуємо після перших 100 paying-users.

**Required artifacts перед PR-M.10 (paywall enable):**

- Усі вищезгадані метрики **emit-ить** код (навіть якщо threshold не відомий ще).
- Sentry-alerts **створено** на P1-критичні (webhook errors, NOTIFY disconnect).
- Grafana board існує (нехай поки порожній).
- `docs/observability/runbook.md` має секцію «Billing incidents» з top-3 most-likely failures.

### Consequences

**Позитивні:**

- Billing-incidents видні **до** того, як юзер скаржиться.
- MRR/churn — операційний trail без ручного спорту по Stripe Dashboard.
- Runbook-friendly: alert → лінк на runbook → лінк на ADR.

**Негативні:**

- Metrics-cardinality: `event_type`, `reason_code`, `error` — потенційна explosion. Mitigation: whitelist allowed values у `apps/server/src/obs/billingMetrics.ts`.
- Alert fatigue ризик. Mitigation: P1 alerts → Sentry; P2-P3 — daily digest, не on-call ping.

### Alternatives considered

- **Datadog / NewRelic billing-add-on:** дорожче, дублює існуючу Prometheus-інфру.
- **Stripe Dashboard alone:** не покриває власний state (NOTIFY, cache, RQ).
- **Logs-only + Sentry:** не дає aggregation для SLO-перевірок.

---

## Конфлікти і trade-offs

Коли реалізація PR-M.X виявляє конфлікт з ADR — **спочатку оновлюємо ADR через окремий PR**, потім продовжуємо код. Не оминаємо ADR через `// TODO`.

Якщо два ADR конфліктують між собою (наприклад, ADR-1.3 NOTIFY vs ADR-1.5 trial-cron) — пишемо новий ADR що superseds-ить обидва і пояснює resolution.

---

## Implementation tracker

> **Last validated: 2026-04-27.** Ревалідовуємо при кожному merge PR-M.X.

| PR         | Реалізує ADR                               | Статус                          |
| ---------- | ------------------------------------------ | ------------------------------- |
| PR-M.0     | ADR-1.1 ... ADR-1.16                       | (цей PR)                        |
| PR-M.1     | ADR-1.2, ADR-1.11, ADR-1.13 (schema)       | pending                         |
| PR-M.2     | ADR-1.2                                    | pending                         |
| PR-M.3     | ADR-1.3                                    | pending                         |
| ~~PR-M.4~~ | ~~ADR-1.4~~                                | **removed (ADR-1.4 withdrawn)** |
| PR-M.5     | ADR-1.7                                    | pending                         |
| PR-M.6     | ADR-1.6, ADR-1.7                           | pending                         |
| PR-M.13    | ADR-1.12 (dunning + cron)                  | pending                         |
| PR-M.14    | ADR-1.13 (proration)                       | pending                         |
| PR-M.15    | ADR-1.14, ADR-1.15 (API pin + idempotency) | pending                         |
| PR-M.16    | ADR-1.16 (observability + SLO)             | pending                         |
| PR-M.17    | ADR-0003 (refund / dispute)                | pending                         |
| PR-M.18    | ADR-0016 (account deletion)                | pending                         |
| PR-M.7     | ADR-1.1, ADR-1.8, ADR-1.10 (legal)         | pending                         |
| PR-M.8     | ADR-1.5, ADR-1.11 (cancel UI)              | pending                         |
| PR-M.9     | ADR-1.9                                    | pending                         |
| PR-M.10    | ADR-1.5 (PAYWALL + anti-fraud)             | pending                         |

---

## Open questions (для подальших ADR)

- Plan-cache eviction strategy на multi-instance deploy (Railway scales horizontally?). TBD.
- ~~Refund / dispute handling~~ → закрито у [ADR-0003](./0003-refund-and-dispute-handling.md): manual via Stripe Dashboard + dispute auto-deactivation на webhook-event, з 90-day fraud-blocklist для chargeback-pattern-у.
- Family / team plans — shared subscription чи per-seat? (Phase 8.) TBD.
- Referral / promo-code system. (Phase 8.) TBD.
