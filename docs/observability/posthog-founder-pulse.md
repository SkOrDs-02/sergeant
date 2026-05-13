# PostHog Founder Pulse dashboard — runbook

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

Operational runbook for the **Founder Pulse** PostHog dashboard — Sergeant's
founder-facing growth dashboard. Aggregates DAU/WAU/MAU, WF-60 activation
funnel (signup → onboarding → first action → subscription), per-module
funnel breakdown, D1/D7/D30 retention, activation rate, new-MRR і
"funnel-ZEROES" canary в один umbrella view.

Дашборд деплоїться з portable JSON-manifest-у в репо: [`ops/posthog/dashboards/founder-pulse.json`](../../ops/posthog/dashboards/founder-pulse.json). Цей runbook — нормативне джерело для пейлоадів, цілей і алертів; manifest синхронізується через PR (Hard Rule #15).

> **Cross-refs:**
> [`docs/observability/posthog-ftux-dashboards.md`](./posthog-ftux-dashboards.md) — FTUX-overview runbook (5 інсайтів, інший umbrella) ·
> [`docs/observability/frontend.md`](./frontend.md) — analytics transport (web) ·
> [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) — canonical event-name registry (single source of truth) ·
> [`ops/n8n-workflows/60-growth-funnel-snapshot.json`](../../ops/n8n-workflows/60-growth-funnel-snapshot.json) — daily HogQL snapshot, що читає ті самі funnel-події (WF-60 і PR-10 узгоджені).

---

## 1. Де це живе в PostHog

- **Account:** Sergeant Cloud EU (host `https://eu.i.posthog.com`).
- **Project:** `Default project` (id `167740`, prod token `phc_A8dsj…`). Окремий `dev serg` проєкт (id `167756`, token `phc_mSvKK…`) покриває preview deployments — той самий дашборд, окремий датасет.
- **Folder:** `Dashboards → Founder Pulse` (id буде заповнений після першого імпорту — `TBD` поки manifest вперше не запушено в PostHog UI).
- **Permissions:** founder + on-call SRE — `Dashboard collaborator`. Усі решта PostHog-користувачів — view-only.

> **Status (2026-05-13):** manifest акцептовано в репо (PR-10). Insights ще не створено в PostHog — наступний крок: пройти `ops/posthog/README.md § Імпорт у PostHog` і заповнити `short_id`-и в §3 нижче.

---

## 2. Canonical events consumed

Усі панелі читають **тільки** з канонічного реєстру в [`analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts). Імена заморожено.

| Event                    | Fired by                                                                                                       | Required payload                                                                                                                                                                                                           | Idempotency                                                                            | Introduced by                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `signup_completed`       | [`AuthContext.tsx`](../../apps/web/src/core/auth/AuthContext.tsx) (після успішного `signUpEmail`)              | `method: "email" \| "google"`                                                                                                                                                                                              | none (single-shot per signup)                                                          | [PR #1983](https://github.com/Skords-01/Sergeant/pull/1983) |
| `onboarding_completed`   | [`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx) `finish()`                   | `intent: "vibe_picked" \| "vibe_empty"`, `picksCount: number`                                                                                                                                                              | `hub_onboarding_completed_v1` KV flag (once per account)                               | [PR #2566](https://github.com/Skords-01/Sergeant/pull/2566) |
| `first_action_completed` | [`firstRealEntry.ts`](../../packages/shared/src/lib/firstRealEntry.ts) `detectFirstActionCompletedPerModule()` | `module: "finyk" \| "fizruk" \| "routine" \| "nutrition"`                                                                                                                                                                  | `hub_first_action_completed_v1:<module>` KV flag (once per module per account)         | [PR #2025](https://github.com/Skords-01/Sergeant/pull/2025) |
| `subscription_started`   | [`stripe.ts`](../../apps/server/src/modules/billing/stripe.ts) (Stripe webhook handler)                        | `plan: string`, `cadence: "monthly" \| "yearly"`, `source: "stripe_webhook"`, `status: string`, `price_cents: number`, `currency: string`, `$revenue: number`, `stripe_event_id: string`, `stripe_subscription_id: string` | PostHog dedupe via `uuid = event.id` + DB `stripe_webhook_events.event_id` (двошарово) | [PR #2525](https://github.com/Skords-01/Sergeant/pull/2525) |

**Super-properties** (`posthog.register`, [`apps/web/src/core/observability/posthog.ts`](../../apps/web/src/core/observability/posthog.ts)):

- `platform: "web" | "ios" | "android"`
- `is_capacitor: boolean`

**Person-properties** (`identifyPostHogUser`, [`apps/web/src/core/observability/identifyTraits.ts`](../../apps/web/src/core/observability/identifyTraits.ts)):

- `vibe: string[]` — module picks з onboarding
- `plan: "free" | "plus" | "pro"`
- `locale: string`
- `signup_date: ISO8601`

> **Контрактне правило:** імена полів вище **стабільні**. Не перейменовуй їх у пейлоадах без бампу `ops/posthog/dashboards/founder-pulse.json` у тому самому PR — інакше HogQL silently zero-out tiles ≥7 днів до того, як хтось помітить (audit-pattern, той самий, що FTUX runbook §3).

---

## 3. Сім панелей дашборду

Усі HogQL-запити нижче — це нормативний текст. Manifest у `ops/posthog/dashboards/founder-pulse.json` містить байт-у-байт ті самі стрінги в `panels[].query.query`. **Розсинхронізація → fail-the-PR через manual review.**

Усі timestamp-операції припускають PostHog default UTC; для daily-buckets ми робимо `toDate(timestamp)` — це теж UTC. **Не міняй на `Europe/Kyiv`** на event-level — це створить shift на 3 години і D-1 retention зіб'ється для нічних реєстрацій. Kyiv timezone — для UI display only.

### 3.1 Active users — DAU / WAU / MAU

**Type:** Trends (HogQL) · **Time range:** yesterday-anchored 1d / 7d / 30d · **Breakdown:** super-property `platform`.

**HogQL:**

```sql
SELECT 'DAU' AS metric, uniq(distinct_id) AS users
FROM events
WHERE timestamp >= toStartOfDay(now() - INTERVAL 1 DAY)
  AND timestamp <  toStartOfDay(now())
UNION ALL
SELECT 'WAU' AS metric, uniq(distinct_id) AS users
FROM events
WHERE timestamp >= toStartOfDay(now() - INTERVAL 7 DAY)
  AND timestamp <  toStartOfDay(now())
UNION ALL
SELECT 'MAU' AS metric, uniq(distinct_id) AS users
FROM events
WHERE timestamp >= toStartOfDay(now() - INTERVAL 30 DAY)
  AND timestamp <  toStartOfDay(now())
```

**Чому:** load-bearing health-signal. WAU/DAU ratio (stickiness, "Facebook P12N-метрика") і MAU MoM-trajectory читаються downstream від цієї панелі.

**Чому `any event`, не `$pageview`:** backend-only події (Stripe webhook → `subscription_started`) теж зараховуються як active. Це консервативніше — не пропускаємо paying-customer-а, який платить через mobile push notification і не відвідує web.

**Targets:**

- DAU: growth ≥0 WoW.
- WAU/DAU stickiness: ≥0.35 (P2 below).
- MAU MoM growth: ≥5% / місяць (P2 below; P1 if negative two months in a row).

### 3.2 WF-60 activation funnel — overall

**Type:** Funnel (strict sequence) · **Time range:** Last 28 days · **Conversion window:** 7 days · **Breakdown:** person-property `vibe`.

**Кроки:**

1. `signup_completed`
2. `onboarding_completed`
3. `first_action_completed`
4. `subscription_started`

**Чому:** єдиний чарт, який компресує "чи нові sign-up-и стають активованими користувачами" у one number. Cross-references `60-growth-funnel-snapshot.json` n8n cron, який snapshot-ить ті самі 4 кроки щодня.

**Targets:**

- signup → onboarding: ≥70% within 24h (P2 below 50%, P1 below 30%).
- onboarding → first_action: ≥60% within 7 days (P2 below 40%, P1 below 20%).
- first_action → subscription: ≥3% within 30 days (baseline TBD post-paywall — оновити після перших 90 днів даних).

### 3.3 WF-60 activation funnel per module

**Type:** Funnel (strict sequence) · **Time range:** Last 28 days · **Conversion window:** 7 days · **Step-3 breakdown:** event-property `module`.

Той самий funnel, що §3.2, але крок 3 (`first_action_completed`) розщеплюється на `module ∈ {finyk, fizruk, routine, nutrition}`. PostHog покаже 4 окремі funnel-и.

**Чому:** audit failure mode — користувач обирає `finyk` в onboarding, але first real action логіт у `nutrition`. Module-bucketed funnel квантифікує misalignment per module, щоб module-specific FTUX-fixes (PR-08 `markFirstActionCompletedForModule`) тріажувались на дата́х, не на здогадках.

**Targets:**

- Per-module signup → first_action: кожен з finyk/fizruk/routine/nutrition ≥40% within 7 days (P2 below).
- Module skew: якщо один модуль ловить >70% first_actions, а інший <10% — recommendation engine ламається. P2, file Linear ticket.

### 3.4 Activation rate (D1)

**Type:** HogQL (Trends-style daily curve) · **Time range:** Last 28 days.

**HogQL:**

```sql
WITH signups AS (
  SELECT distinct_id, min(timestamp) AS signed_at
  FROM events
  WHERE event = 'signup_completed'
    AND timestamp >= now() - INTERVAL 28 DAY
  GROUP BY distinct_id
),
first_actions AS (
  SELECT distinct_id, min(timestamp) AS acted_at
  FROM events
  WHERE event = 'first_action_completed'
  GROUP BY distinct_id
)
SELECT
  toDate(s.signed_at) AS cohort_day,
  count() AS signups,
  countIf(
    fa.acted_at IS NOT NULL
    AND fa.acted_at <= s.signed_at + INTERVAL 1 DAY
  ) AS activated,
  round(activated * 1.0 / signups, 4) AS d1_activation_rate
FROM signups s
LEFT JOIN first_actions fa ON s.distinct_id = fa.distinct_id
GROUP BY cohort_day
ORDER BY cohort_day
```

**Чому:** activation rate компресує funnel у single percentage. Crossing D1 — textbook signal, що FTUX-обіцянка виконана на session-1. Below it — AARRR funnel колапсує незалежно від upstream signup-volume.

**Targets:**

- D1 activation: ≥30% (P2 below 20%, P1 below 10%).
- Regression alert: drops ≥10pp WoW → P1 (page on-call; likely deploy regression в `first_action_completed` instrumentation або KV-flag namespace drift).

### 3.5 New subscriptions — count + new MRR

**Type:** HogQL (Trends-style bar chart) · **Time range:** Last 28 days · **Segment:** `properties.cadence`.

**HogQL:**

```sql
SELECT
  toDate(timestamp) AS day,
  properties.cadence AS cadence,
  count() AS new_subs,
  sum(
    toFloat(properties.$revenue)
      * if(properties.cadence = 'yearly', 1.0/12, 1.0)
  ) AS new_mrr_usd
FROM events
WHERE event = 'subscription_started'
  AND timestamp >= now() - INTERVAL 28 DAY
  AND properties.status IN ('active', 'trialing')
GROUP BY day, cadence
ORDER BY day, cadence
```

**Чому:** PostHog `$revenue` super-property виставляється у [`stripe.ts`](../../apps/server/src/modules/billing/stripe.ts) у major-unit (e.g. `7` for `$7`). Поки нема feed-у renewals/cancellations у PostHog (`SUBSCRIPTION_CANCELED` / `SUBSCRIPTION_RENEWED` поки не вистрілюють — TODO в PR-09), new-MRR contribution per day — найчистіший revenue-pulse сигнал. Yearly subs нормалізовано `/12`, тож monthly + yearly stack на одній осі. **Cumulative active-MRR** рахується downstream у n8n (WF-60) — ця панель — per-day delta.

**Why `status IN ('active', 'trialing')`:** виключаємо `incomplete`/`past_due` стани, які stripe.ts теж капчить, але вони не повинні рахуватись у new-MRR.

**Targets:**

- New-MRR run-rate: ≥$50/місяць aggregated over trailing 7 days (P2 below; baseline tracked in [`docs/launch/business/01-monetization-and-pricing.md`](../launch/business/01-monetization-and-pricing.md)).
- `subscription_started` ZEROES: якщо new subs = 0 over 7 days while signups/day average > 10 → Stripe webhook regression. P1.

### 3.6 Cohort retention — D1 / D7 / D30

**Type:** Retention · **Cohortizing event:** `signup_completed` (`distinct_id` first-seen) · **Returning event:** `$any_event` · **Granularity:** Day · **Period:** 30 днів назад, 30 днів уперед · **Breakdown:** person-property `vibe`.

**Чому:** три retention floors-gate-ять весь growth thesis:

- D1 — came back at all (FTUX session-1 не зламано).
- D7 — FTUX-обіцянка sustain-нулася beyond curiosity.
- D30 — subscription-conversion window (PRO-trial typically 7d, потім D30 — перший renewal mark).

Razom описують shape of the leaky bucket — те саме, що AARRR canon і Reichheld retention math.

**Targets:**

- D1: ≥35%.
- D7: ≥15%.
- D30: ≥8% (baseline TBD post-billing; оновити з перших 90 днів даних).

### 3.7 Funnel ZEROES canary

**Type:** HogQL (Trends table) · **Time range:** Last 14 days.

**HogQL:**

```sql
SELECT
  toDate(timestamp) AS day,
  countIf(event = 'signup_completed')      AS signups,
  countIf(event = 'onboarding_completed')  AS onboardings,
  countIf(event = 'first_action_completed') AS first_actions,
  countIf(event = 'subscription_started')  AS subscriptions
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
GROUP BY day
ORDER BY day
```

**Чому:** кожний попередній PostHog outage, де canonical events перестали fire-итись, тривав 3–9 днів до detect-у через funnel-shape alone (audit-pattern з [`posthog-ftux-dashboards.md` §5 «Funnel ZEROES»](./posthog-ftux-dashboards.md#5-alert-thresholds)). Raw daily-count tile — найдешевший leading indicator: якщо будь-яка комірка flip-ається на 0 unexpectedly — page on-call.

**Targets:** any step = 0 / 24h while previous 7d > 0 → P1 (deploy broke `trackEvent` calls or KV namespace drifted).

---

## 4. Umbrella dashboard

`Dashboards → Founder Pulse` (id TBD, заповнити після першого імпорту) пінить:

| Row | Tile                                                             | Width |
| --- | ---------------------------------------------------------------- | ----- |
| 1   | §3.1 Active users — DAU / WAU / MAU                              | full  |
| 2   | §3.2 WF-60 activation funnel — overall (last 28 days, by `vibe`) | full  |
| 3   | §3.3 WF-60 activation funnel per module                          | full  |
| 4   | §3.4 Activation rate (D1)                                        | half  |
| 4   | §3.5 New subscriptions — count + new MRR                         | half  |
| 5   | §3.6 Cohort retention — D1 / D7 / D30                            | full  |
| 6   | §3.7 Funnel ZEROES canary                                        | full  |

**Refresh cadence:** PostHog default (30 хв). On-call ротується через umbrella під час morning standup.

---

## 5. Alert thresholds

PostHog → **Alerts** (subscriptions, Telegram-mirror через n8n WF-16 → topic `#growth` / `#ops`):

| Alert                    | Source | Condition                                                              | Severity | Channel                                                                 |
| ------------------------ | ------ | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| Funnel ZEROES            | §3.7   | будь-який крок = 0 / 24h while previous 7d > 0                         | P1       | Telegram `#ops` (via n8n WF-16) + PostHog subscription                  |
| Activation rate collapse | §3.4   | `d1_activation_rate` < 0.10 over the last 7 days                       | P1       | Telegram `#growth` + PostHog subscription                               |
| New-MRR stall            | §3.5   | `sum(new_subs)` = 0 over 7 rolling days while signups/day average > 10 | P1       | Telegram `#ops` + PostHog subscription                                  |
| D1 retention regression  | §3.6   | D1 drops > 5pp from the 28-day baseline for any signup-cohort          | P2       | Telegram `#growth`                                                      |
| Per-module skew          | §3.3   | будь-який модуль ловить >70% first_actions, інший <10% (28-day window) | P2       | Linear ticket (no paging) — file у відповідний `*-domain` package owner |

> **Чому P1 для «funnel ZEROES»:** кожний попередній outage, де canonical events перестали fire-итись, тривав 3–9 днів до detect-у через dashboards alone. Naked zero-count alert на **each** funnel step — найдешевший leading indicator.

---

## 6. Runbook — додавання нової панелі

Коли в [`analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) лендиться нова подія, що мала б жити на цьому umbrella:

1. **Frame the question.** Що саме user behaviour або product hypothesis перевіряє панель? Пиши однією фразою у PR description (e.g. "Користувачі, що hit `subscription_renewed` на день 30, мають 2× ймовірність зайти на день 60."). Якщо питання мутне — дашборд буде теж.
2. **Pick the chart type.** Funnels для ordered sequences; trends для over-time counts; retention для cohort-based stickiness; histograms для distribution shape; HogQL для всього іншого.
3. **Write HogQL** у PostHog **Data exploration → SQL editor** спершу. Валідуй schema з `LIMIT 100`. Тільки після того як query повертає правильні дані, lift у saved insight.
4. **Bump manifest.** Додай нову `panels[]` entry у [`ops/posthog/dashboards/founder-pulse.json`](../../ops/posthog/dashboards/founder-pulse.json) **у тому самому PR**, що додає insight у PostHog. Manifest — source of truth для drift detection.
5. **Pin to umbrella.** `Dashboards → Founder Pulse`. Ніколи не залишай insight як personal bookmark — за квартал згниє.
6. **Document here.** Додай рядок у §2 (якщо нова подія), §3 (the insight itself), і alert threshold у §5 якщо warrants paging. Doc і dashboard ship у тому самому PR.
7. **Set an alert** якщо matter-ить для activation, retention або billing. Ніколи не додавай "nice to track" alert — alert fatigue реальний, і він коштує нам P1-ів.
8. **Add a screenshot link** у §3 щойно insight збережено. Будь-хто, читаючи цей doc, повинен landing на live tile в two clicks.

**Hard rules:**

- Insights **own-яться** docs тут, не individual editors. Drift = stale dashboard. PR, що додає insight, **повинен** оновити §3.
- Ніколи не додавай derived insight, що consume-ить events, не declared в §2. Якщо потрібна нова подія — окремий PR, що wires її в [`analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) і call-site, **потім** PR для insight. Це keep funnel contract atomic.
- Кожна breakdown-property повинна бути super-property або person-property registered via `identify`. Ніколи не break down by ad-hoc event payload fields — це створює cardinality time-bombs.

---

## 7. Open questions / TODOs

- **Auto-import.** Manifest у `ops/posthog/dashboards/founder-pulse.json` — portable shape. Зараз — manual import via PostHog UI. Auto-import (CLI або n8n) — окремий PR під [PR-11 з pr-plan-2026-05](../planning/pr-plan-2026-05.md) (WF-16 розширення або новий планований скрипт `scripts/posthog/import-dashboard` (`.mjs`)).
- **Mobile parity.** Поки `apps/mobile` не пише в PostHog (планується в [`ftux-sprint-plan.md` §2 S0.3](../launch/product-os/ftux-sprint-plan.md#2-sprint-0--analytics-live-1-тиждень)), усі панелі представляють **web-only** користувачів. Super-property `platform` уже зареєстрована, тож insights почнуть segmenting cleanly щойно mobile приземлиться без правок dashboard.
- **MRR з renewals/cancellations.** Поки [`stripe.ts`](../../apps/server/src/modules/billing/stripe.ts) не fire-ить `SUBSCRIPTION_CANCELED` / `SUBSCRIPTION_RENEWED` (TODO у PR-09), §3.5 показує **new-MRR contribution**, не cumulative active-MRR. Коли події приземляться — додати §3.6.5 cumulative-MRR панель і апдейтити targets.
- **A/B testing.** Sprint 5 (goal-first wizard з `ftux-sprint-plan.md`) вводить feature flags. Коли це лендиться — додати §3.8 insight, що breaks down §3.2 by активним variant.
