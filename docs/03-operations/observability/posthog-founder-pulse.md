# PostHog Founder Pulse dashboard — runbook

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-28.
> **Status:** Active

> **⚠️ Дашборд не працює станом на 2026-07-26 — цифрам не вір.**
> Перевірено прямими запитами: 5 із 7 тайлів повертають **0 рядків**, а всі 7
> мали `last_refresh: None` (жодного разу не рахувались до аудиту). Два
> незалежні корені:
>
> 1. **Голова воронки не фаїться.** `signup_completed` — 1 подія за 365 днів
>    (остання 2026-06-11) проти 100 `onboarding_completed`. Причина:
>    `trackEvent(SIGNUP_COMPLETED)` живе тільки в email+пароль шляху
>    (`apps/web/src/core/auth/AuthContext.tsx`), а `signIn.social()` для
>    Google/Apple робить повний redirect — після повернення код не виконується.
>    Користувачі обирають саме соцвхід: `signup_provider_selected` за рік —
>    google 23, apple 1. Воронка вмирає на кроці 1, тому крок 4 нерелевантний.
> 2. **Хвіст воронки теж мовчав.** `subscription_started` не фаявся жодного
>    разу за 180 днів: `POSTHOG_PROJECT_API_KEY` був відсутній у Coolify, тож
>    [`posthogCapture.ts`](../../../apps/server/src/lib/posthogCapture.ts)
>    fail-open повертав `skipped` без помилки. Змінну додано і сервер
>    передеплоєно 2026-07-26 — цей бік має відновитись сам із першим Stripe-івентом.
>
> «Funnel-ZEROES canary» (§ нижче) мала б зловити п.1 — але вона сама ніколи
> не рахувалась, бо дашборд ніхто не відкривав. Канарка, яку не перевіряють,
> не канарка.

Operational runbook for the **Founder Pulse** PostHog dashboard — Sergeant's
founder-facing growth dashboard. Aggregates DAU/WAU/MAU, WF-60 activation
funnel (signup → onboarding → first action → subscription), per-module
funnel breakdown, D1/D7/D30 retention, activation rate, new-MRR і
"funnel-ZEROES" canary в один umbrella view.

Дашборд деплоїться з portable JSON-manifest-у в репо: [`ops/posthog/dashboards/founder-pulse.json`](../../../ops/posthog/dashboards/founder-pulse.json). Цей runbook — нормативне джерело для пейлоадів, цілей і алертів; manifest синхронізується через PR (Hard Rule #15).

> **Cross-refs:**
> [`docs/03-operations/observability/posthog-ftux-dashboards.md`](./posthog-ftux-dashboards.md) — FTUX-overview runbook (5 інсайтів, інший umbrella) ·
> [`docs/03-operations/observability/frontend.md`](./frontend.md) — analytics transport (web) ·
> [`packages/shared/src/lib/analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts) — canonical event-name registry (single source of truth) ·
> [`ops/n8n-workflows/60-growth-funnel-snapshot.json`](../../../ops/n8n-workflows/60-growth-funnel-snapshot.json) — daily HogQL snapshot, що читає ті самі funnel-події (WF-60 і PR-10 узгоджені).

---

## 1. Де це живе в PostHog

- **Account:** Sergeant Cloud EU (host `https://eu.i.posthog.com`).
- **Project:** `Default project` (id `167740`, prod token `phc_A8dsj…`). Окремий `dev serg` проєкт (id `167756`, token `phc_mSvKK…`) покриває preview deployments — той самий дашборд, окремий датасет.
- **Folder:** [`Dashboards → Founder Pulse`](https://eu.posthog.com/project/167740/dashboard/777283) (id `777283`).
- **Permissions:** founder + on-call SRE — `Dashboard collaborator`. Усі решта PostHog-користувачів — view-only.
- **Часовий пояс проєкту: `UTC`** — розходиться з доменним інваріантом продукту (серверні звіти рахують добу в `Europe/Kyiv` — межа особистої доби device-local per ADR-0078, див. [`getKyivDayKey`](../../../apps/web/src/shared/lib/time/kyivTime.ts) і [domain-invariants.md](../../02-engineering/architecture/domain-invariants.md)). Наслідки й план міграції — **§10**.

> **Status (2026-06-26):** ✅ Dashboard + 7 insights створено через [`scripts/posthog/import-founder-pulse.mjs`](../../../scripts/posthog/import-founder-pulse.mjs) (project `167740`, dashboard `777283`). Live short_id-и: active-users `XBRWeTrn`, funnel-overall `9T025rBs`, funnel-per-module `WPf62Cq6`, activation-rate `bC6ZbB3v`, new-subscriptions `7SSCvzEA`, retention `k0pjSfoY`, funnel-zeroes `vMEk4MKL`.
>
> **Українізовано (2026-06-26):** display-назви й описи панелей — українською через manifest-поля `name_uk` / `description_uk`. Importer матчить наявні insights за стабільним тегом `fp:<key>` (fallback на англ-назву), тож re-run оновлює їх на місці, без дублів. Англ `name` / `description` лишаються в manifest як контракт §2–§3.
>
> ⚠️ **Дані поки рідкі** (рання стадія): за 30д `signup_completed`≈1, `subscription_started`=0 — тому активаційна воронка, activation-rate і new-MRR панелі майже порожні; оживуть з трафіком. **`first_action_completed` gap — ВИПРАВЛЕНО** (PR #14): подія не emit-илась, бо `detectFirstActionCompletedPerModule()` ніколи не викликався на рендер-шляху; додано виклик у `useHubDashboardState`.

---

## 2. Canonical events consumed

Усі панелі читають **тільки** з канонічного реєстру в [`analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts). Імена заморожено.

| Event                    | Fired by                                                                                                          | Required payload                                                                                                                                                                                                           | Idempotency                                                                            | Introduced by                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `signup_completed`       | [`AuthContext.tsx`](../../../apps/web/src/core/auth/AuthContext.tsx) (після успішного `signUpEmail`)              | `method: "email" \| "google"`                                                                                                                                                                                              | none (single-shot per signup)                                                          | [PR #1983](https://github.com/Skords-01/Sergeant/pull/1983) |
| `onboarding_completed`   | [`OnboardingWizard.tsx`](../../../apps/web/src/core/onboarding/OnboardingWizard.tsx) `finish()`                   | `intent: "vibe_picked" \| "vibe_empty"`, `picksCount: number`                                                                                                                                                              | `hub_onboarding_completed_v1` KV flag (once per account)                               | [PR #2566](https://github.com/Skords-01/Sergeant/pull/2566) |
| `first_action_completed` | [`firstRealEntry.ts`](../../../packages/shared/src/lib/firstRealEntry.ts) `detectFirstActionCompletedPerModule()` | `module: "finyk" \| "fizruk" \| "routine" \| "nutrition"`                                                                                                                                                                  | `hub_first_action_completed_v1:<module>` KV flag (once per module per account)         | [PR #2025](https://github.com/Skords-01/Sergeant/pull/2025) |
| `subscription_started`   | [`stripe.ts`](../../../apps/server/src/modules/billing/stripe.ts) (Stripe webhook handler)                        | `plan: string`, `cadence: "monthly" \| "yearly"`, `source: "stripe_webhook"`, `status: string`, `price_cents: number`, `currency: string`, `$revenue: number`, `stripe_event_id: string`, `stripe_subscription_id: string` | PostHog dedupe via `uuid = event.id` + DB `stripe_webhook_events.event_id` (двошарово) | [PR #2525](https://github.com/Skords-01/Sergeant/pull/2525) |

**Super-properties** (`posthog.register`, [`apps/web/src/core/observability/posthog.ts`](../../../apps/web/src/core/observability/posthog.ts)):

- `platform: "web" | "ios" | "android"`
- `is_capacitor: boolean`
- `environment: string` — з `VITE_APP_ENV`, дефолт `"production"`. **Той самий перемикач, що й Sentry** (`sentry.ts` читає ту саму змінну як fallback). Змінна **задана** на Vercel-проєкті бети (Production + Preview, додано 2026-07-30) — але чек-лист [`run-beta-wave.md` § Змінні для бета-проєкту](../../90-work/beta-launch/run-beta-wave.md#змінні-для-бета-проєкту) її історично не документував (виправлено в тому ж PR, що й ця секція). Значення в UI приховане (`Sensitive`), тож саме `"beta"` воно чи щось інше — не перевірено з коду; §3.8 нижче — канарка саме на це: 0 рядків `beta` при активних тестерах означає або порожню, або хибну змінну.

**Person-properties** (`identifyPostHogUser`, [`apps/web/src/core/observability/identifyTraits.ts`](../../../apps/web/src/core/observability/identifyTraits.ts)):

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

**Чому:** PostHog `$revenue` super-property виставляється у [`stripe.ts`](../../../apps/server/src/modules/billing/stripe.ts) у major-unit (e.g. `7` for `$7`). Поки нема feed-у renewals/cancellations у PostHog (`SUBSCRIPTION_CANCELED` / `SUBSCRIPTION_RENEWED` поки не вистрілюють — TODO в PR-09), new-MRR contribution per day — найчистіший revenue-pulse сигнал. Yearly subs нормалізовано `/12`, тож monthly + yearly stack на одній осі. **Cumulative active-MRR** рахується downstream у n8n (WF-60) — ця панель — per-day delta.

**Why `status IN ('active', 'trialing')`:** виключаємо `incomplete`/`past_due` стани, які stripe.ts теж капчить, але вони не повинні рахуватись у new-MRR.

**Targets:**

- New-MRR run-rate: ≥$50/місяць aggregated over trailing 7 days (P2 below; baseline tracked in [`docs/01-product/launch/business/01-monetization-and-pricing.md`](../../01-product/launch/business/01-monetization-and-pricing.md)).
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

### 3.8 Traffic by environment — prod vs beta

**Type:** HogQL (Trends table) · **Time range:** Last 14 days · **Breakdown:** super-property `environment`.

**HogQL:**

```sql
SELECT
  toDate(timestamp) AS day,
  properties.environment AS environment,
  uniq(distinct_id) AS active_users,
  countIf(event = 'signup_completed') AS signups,
  countIf(event = 'hubchat_message_sent') AS hubchat_messages
FROM events
WHERE timestamp >= now() - INTERVAL 14 DAY
GROUP BY day, environment
ORDER BY day, environment
```

**Чому:** усі інші панелі цього дашборда рахують `prod` і `beta` разом — жодна не відповідає на питання «чи взагалі бачимо бету окремо». `VITE_APP_ENV` заданий на Vercel-проєкті бети (§2), але його значення не перевірено з коду. Ця панель — найдешевша канарка на розрив: якщо тестери активні, а рядка `environment = 'beta'` немає 14 днів поспіль — змінна порожня або задана неправильним значенням, і бета-трафік тихо змішується з продом у кожній іншій панелі вище.

**Targets:**

- Рядки `beta` присутні щодня під час активної хвилі бети (30 тестерів). 0 рядків `beta` при відомо активних тестерах → P2, перевір значення `VITE_APP_ENV` на Vercel (див. §2) — воно має дорівнювати саме `beta`.
- Обсяг `beta` лишається малою обмеженою часткою (~30 тестерів) від `production` — стрибок означає, що домен бети розповсюдили ширше запрошень.

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
| 7   | §3.8 Traffic by environment — prod vs beta                       | full  |

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

Коли в [`analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts) лендиться нова подія, що мала б жити на цьому umbrella:

1. **Frame the question.** Що саме user behaviour або product hypothesis перевіряє панель? Пиши однією фразою у PR description (e.g. "Користувачі, що hit `subscription_renewed` на день 30, мають 2× ймовірність зайти на день 60."). Якщо питання мутне — дашборд буде теж.
2. **Pick the chart type.** Funnels для ordered sequences; trends для over-time counts; retention для cohort-based stickiness; histograms для distribution shape; HogQL для всього іншого.
3. **Write HogQL** у PostHog **Data exploration → SQL editor** спершу. Валідуй schema з `LIMIT 100`. Тільки після того як query повертає правильні дані, lift у saved insight.
4. **Bump manifest.** Додай нову `panels[]` entry у [`ops/posthog/dashboards/founder-pulse.json`](../../../ops/posthog/dashboards/founder-pulse.json) **у тому самому PR**, що додає insight у PostHog. Manifest — source of truth для drift detection.
5. **Pin to umbrella.** `Dashboards → Founder Pulse`. Ніколи не залишай insight як personal bookmark — за квартал згниє.
6. **Document here.** Додай рядок у §2 (якщо нова подія), §3 (the insight itself), і alert threshold у §5 якщо warrants paging. Doc і dashboard ship у тому самому PR.
7. **Set an alert** якщо matter-ить для activation, retention або billing. Ніколи не додавай "nice to track" alert — alert fatigue реальний, і він коштує нам P1-ів.
8. **Add a screenshot link** у §3 щойно insight збережено. Будь-хто, читаючи цей doc, повинен landing на live tile в two clicks.

**Hard rules:**

- Insights **own-яться** docs тут, не individual editors. Drift = stale dashboard. PR, що додає insight, **повинен** оновити §3.
- Ніколи не додавай derived insight, що consume-ить events, не declared в §2. Якщо потрібна нова подія — окремий PR, що wires її в [`analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts) і call-site, **потім** PR для insight. Це keep funnel contract atomic.
- Кожна breakdown-property повинна бути super-property або person-property registered via `identify`. Ніколи не break down by ad-hoc event payload fields — це створює cardinality time-bombs.

---

## 7. Open questions / TODOs

- **Auto-import.** Manifest у `ops/posthog/dashboards/founder-pulse.json` — portable shape. Зараз — manual import via PostHog UI. Auto-import (CLI або n8n) — окремий PR під [PR-11 з pr-plan-2026-05](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/pr-plan-2026-05.md) (WF-16 розширення або новий планований скрипт `scripts/posthog/import-dashboard` (`.mjs`)).
- **Mobile parity.** Поки `apps/mobile` не пише в PostHog (планується в [`ftux-sprint-plan.md` §2 S0.3](../../01-product/launch/archive/product-os/ftux-sprint-plan.md#2-sprint-0--analytics-live-1-тиждень)), усі панелі представляють **web-only** користувачів. Super-property `platform` уже зареєстрована, тож insights почнуть segmenting cleanly щойно mobile приземлиться без правок dashboard.
- **MRR з renewals/cancellations.** Поки [`stripe.ts`](../../../apps/server/src/modules/billing/stripe.ts) не fire-ить `SUBSCRIPTION_CANCELED` / `SUBSCRIPTION_RENEWED` (TODO у PR-09), §3.5 показує **new-MRR contribution**, не cumulative active-MRR. Коли події приземляться — додати §3.6.5 cumulative-MRR панель і апдейтити targets.
- **A/B testing.** Sprint 5 (goal-first wizard з `ftux-sprint-plan.md`) вводить feature flags. Коли це лендиться — додати §3.8 insight, що breaks down §3.2 by активним variant.

---

## 8. Петлі цінності («сигнал показано → дію зроблено»)

> **Статус:** події живуть у коді з **2026-07-25** (Хвиля 2 беклогу знань).
> Панелей на цьому дашборді ще НЕМАЄ — секція описує контракт, семантику й
> пастки читання, щоб перша ж панель не була побудована неправильно.
> Канонічні імена — [`analyticsEvents.valueLoops.ts`](../../../packages/shared/src/lib/analyticsEvents.valueLoops.ts);
> повний контракт полів — [`.telemetry/tracking-plan.yaml`](../../../.telemetry/tracking-plan.yaml).
>
> ⚠️ **Нуль подій у проді станом на 2026-07-31.** Прямий запит до
> `sergeant-prod` (id `167740`) за 180 днів не повертає ЖОДНОЇ події з
> таблиці §8.1 — включно з `routine_habit_checked`, на якому тримається
> вся ця секція. Це очікувано (інструментація приземлилась 6 днів тому, а
> реального трафіку ще немає), але має два наслідки:
>
> 1. **Контракт нижче не перевірений жодним реальним викликом.** Секція
>    описує НАМІР, а не спостережену поведінку: якщо у payload є помилка,
>    її ще ніхто не міг помітити. Першу панель будуй лише після того, як
>    у проді зʼявиться ненульовий обсяг, і звір фактичні поля з §8.2.
> 2. **Порожня панель ≠ зламаний пайплайн.** Не витрачай час на дебаг
>    транспорту, поки в бету не зайдуть живі користувачі.
>
> Перевірити поточний стан: PostHog → Activity → фільтр за іменем події,
> або `SELECT count() FROM events WHERE event = 'routine_habit_checked'`
> у HogQL за весь доступний період.

### 8.1 Що емітиться

| Подія                     | Емітер (web)                                         | Половина петлі |
| ------------------------- | ---------------------------------------------------- | -------------- |
| `value_signal_shown`      | `shared/components/ui/InsightCard.tsx`               | показано       |
| `value_signal_activated`  | ↑                                                    | показано       |
| `value_signal_dismissed`  | ↑                                                    | показано       |
| `routine_streak_shown`    | `modules/routine/components/RoutineCalendarHero.tsx` | показано       |
| `routine_habit_checked`   | `modules/routine/useRoutineAppState.ts`              | зроблено       |
| `fizruk_workout_finished` | `modules/fizruk/.../WorkoutJournalSection.tsx`       | зроблено       |
| `nutrition_meal_logged`   | `modules/nutrition/hooks/useNutritionLog.ts`         | зроблено       |
| `finyk_tx_categorized`    | `modules/finyk/components/TxRowCategoryPicker.tsx`   | зроблено       |

`expense_added` / `income_added` / `budget_set` **переюзані як є** — до них
лише дописані поля атрибуції. Ренейму не було й не буде: наявні дашборди й
історія цим ламаються (`tracking-plan.yaml` § `naming_convention`).

### 8.2 Семантика `after_signal` / `ms_since_signal` / `signal`

Ці три поля несе КОЖНА подія «дію зроблено».

- `after_signal: boolean` — чи дії передував показ продуктового сигналу.
- `ms_since_signal: number | null` — **сирий** інтервал у мілісекундах.
- `signal: string | null` — стабільний kind сигналу без змінного суфікса
  (`finyk-budget-overrun`, а не `finyk-budget-overrun-<categoryId>`).

**Вікно N у код НЕ зашите — і не має бути.** Обчисленого булеана «дія протягом
N» у payload немає навмисно: N обирається у HogQL (`ms_since_signal < 3600000`
тощо), тож його можна переглянути заднім числом без релізу бандла. Атрибуція
модуль-скоупована: показ finyk-сигналу не зарахується чекіну звички.

Леджер атрибуції — `core/observability/valueSignalAttribution.ts` (TTL 24 год
— це межа протухання, **не** вікно N). Читання не очищає стан: дві дії після
одного показу — валідний продуктовий кейс, і consume-семантика занизила б
конверсію.

### 8.3 Знаменник: що виключати

1. **`routine_habit_checked{source IN ('bulk','chat')}`** — масова відмітка
   «закрити день одним тапом» і дія AI-інструмента не є мотивованим чекіном.
   Залишати їх у знаменнику = розмити зріз.
2. **Когорти ДО дати релізу подій.** ⚠️ Це найлегша й найдорожча помилка на
   цьому дашборді: користувачі до 2026-07-25 показують **нуль** показів і
   нуль дій **не тому, що сигналів не було**, а тому що подій не існувало.
   Ретроактивного backfill не існує в принципі. Фільтруй когорту по даті
   релізу; ніколи не пиши `COALESCE(saw_streak, false)` — це перетворює
   «не знаємо» на «не бачив» і дає штучне підтвердження гіпотези з нічого.
3. **Накопичені dismissals.** `useInsightDismissal` тримає відкинуті id у
   localStorage **назавжди**; відкинутий сигнал більше не рендериться, тож і
   `value_signal_shown` для нього не полетить. Знаменник на єдиному наявному
   профілі занижений — це відома й прийнята похибка, не баг запиту.

### 8.4 Стрік: чому `hero_flame` не можна читати як експеримент

`routine_habit_checked` несе `saw_streak_surface`, `streak_days_at_checkin`,
`ms_since_streak_shown` — і `scope: "max_across_habits"`, бо показаний стрік
це максимум по ВСІХ звичках, а чекін per-habit.

⚠️ `flame.visible === (streakDays > 0)` (`useStreakFlame.ts`), а полум'я живе
на тому ж екрані, що й чекбокси. Тому зріз «бачив полум'я vs ні» — це
порівняння когорт «стрік > 0» і «стрік = 0», а **не** тест стимулу. Він
виглядатиме як сильне підтвердження «стріки мотивують» і буде артефактом.
Єдина поверхня з чесною варіацією — streak-record-карточка (умовна,
dismissible), яка їде як `value_signal_shown{signal='routine-streak-record-pending'}`.
**Ніколи не агрегувати обидві поверхні в один булеан «бачив стрік».**

Навіть чесний зріз дає максимум кореляцію. Відповідь на «карго-культ чи ні»
вимагає A/B (сховати полум'я частині користувачів) — під це вже є
`experiment_exposed`, але самого експерименту немає.

### 8.5 Обмеження покриття (станом на 2026-07-25)

- **Web-only.** `apps/mobile` подій петель не емітить; там стрік показується
  безумовно, включно з «0 дн.» — це ІНША експозиція, тож крос-платформна
  агрегація можлива лише з розрізом по `surface`.
- **AI-порада.** `ai_advice_shown` / `ai_advice_reacted` мають web-callsite-и
  (`core/observability/adviceTelemetry.ts` — єдиний писар; клієнти
  `AssistantAdviceCard.tsx` і `WeeklyDigestCard.tsx`). Відкритим лишається
  **id**: він КЛІЄНТСЬКИЙ. Крос-платформного порівняння сьогодні не існує
  взагалі — `apps/mobile` подій петель не емітить (пункт «Web-only» вище).
  Але щойно зʼявляться mobile-callsite-и, та сама денна порада, відкрита у
  вебі й на телефоні, дасть ДВА різні `advice_id`. Тобто метрика придатна для
  «побачив → зреагував» і НЕпридатна для «скільки унікальних порад
  згенеровано» — останнє вимагає серверного id (окрема стадія).
- **Незалежність від синку.** Події їдуть у PostHog HTTP-транспортом, а не
  через `/api/sync`. Дашборд НЕ має читати «дія зроблена» як «дані доїхали в
  хмару» — для цього є окремі `sync_*` події.

---

## 9. HubChat — воронка AI-коуча (закрита бета)

> **Статус:** інструментовано **2026-07-31** під закриту бету на 30 тестерів.
> До цієї дати єдиною подією Хаба була `hub_tab_switch_perf` — другу місію
> бети (HubChat) не можна було виміряти нічим, крім опитування.
> Канонічні імена — [`analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts)
> (блок «HubChat»); контракт полів — [`.telemetry/tracking-plan.yaml`](../../../.telemetry/tracking-plan.yaml).

### 9.1 Що емітиться

| Подія                       | Емітер (web)                                  | Місце у воронці |
| --------------------------- | --------------------------------------------- | --------------- |
| `hubchat_opened`            | `core/hub/HubChat.tsx` (mount)                | відкрив         |
| `hubchat_message_sent`      | `core/hub/chat/useChatSend.ts` (після гейтів) | запитав         |
| `hubchat_response_received` | ↑ (обидві гілки — текст і tool-call)          | отримав         |
| `hubchat_error`             | ↑ (`catch` + биті `tool_calls`)               | не отримав      |

**Інваріант:** `opened ≥ message_sent ≥ response_received + error`.

`hubchat_opened` стріляє з `HubChat.tsx`, а не з двох host-ів
(`HubChatOverlay` + `HubChatPage`), бо цей компонент — єдина спільна точка
монтування обох поверхонь. `source: "overlay" | "route"` приходить пропом, а
не висновком із `location.pathname`: оверлей можна відкрити і перебуваючи на
`/chat`, і тоді шлях збрехав би.

`hubchat_tool_invoked` — **емітер додано 2026-08-26** (`useChatSend.ts`, одразу
після `executeActions`). Доти константа лежала в каталозі з квітня без жодного
call-site-а, тож панель tool-leaderboard у `hubchat.json` була порожня — і
читалась не як «даних немає», а як «інструментами не користуються».

Форма: `{ tool, module, success, latency_ms }`. `success` береться зі
структурного прапорця `ok` результату виконання, а НЕ з префікса тексту
(«Помилка виконання: …») — інакше телеметрія тихо зламалась би на першому ж
переписуванні копірайту. Незбережений запис (`WRITE_NOT_PERSISTED`, коли
dual-write не підтвердив) рахується провалом: інакше leaderboard показував би
фантомні виклики. `module` резолвиться через `getToolModule()` з
`assistantCatalogue`, тобто з того самого реєстру, що синхронізується з
серверними tool-defs; невідоме імʼя дає `"unknown"`, а не втрачену подію.

### 9.2 Пастки читання

1. **`message_sent − (response_received + error)` — це НЕ втрачені події.**
   Це ручні скасування: користувач натиснув «Скасувати» або пішов зі
   сторінки під час стріму. Окремої події на це навмисно немає — це вибір
   людини, а не збій асистента. Не читай цей розрив як помилки транспорту.
2. **`hubchat_error{kind:"aborted"}` — це 90-секундний таймаут, не cancel.**
   Ручне скасування події не шле взагалі (пункт 1). Тож `aborted` завжди
   означає «модель зависла», і саме це число варто алертити під час бети.
3. **Гейти не рахуються як звернення.** `/help`, offline-гілка й пейвол
   виходять ДО `message_sent` — вони не витрачають AI-запит, тож і в
   знаменник «звернувся до коуча» не потрапляють.
4. **`length` — це довжина, не текст.** Ні повідомлення користувача, ні
   тіло відповіді, ні `tool_input` у payload не потрапляють. Питання
   «про що люди питають коуча» цими подіями НЕ відповідається — для нього
   потрібен окремо погоджений канал з обробкою PII.

### 9.3 Чого тут немає

- **Серверна LLM-обсервабельність.** Жодної `$ai_*` події в проді: PostHog
  LLM analytics не підключена, тож токени, вартість і latency моделі
  сьогодні не видно. `response_received.latency_ms` міряє
  **клієнтський** інтервал «надіслав → відповідь відрендерилась», що
  включає мережу й tool-виконання. Це проксі, а не метрика моделі.
- **Ознака корисності.** Продуктового афорданса («👍/👎» під відповіддю) в
  UI не існує, тож і події немає. Заводити подію без поверхні означало б
  подію, яка ніколи не спрацює — рівно та пастка, що описана в §8 вище.
- **Рутина й Харчування.** Свідомо поза фокусом бети — телеметрію туди не
  додавали.

---

## 10. Часовий пояс проєкту: UTC → Europe/Kyiv

> **Статус: НЕ ЗРОБЛЕНО** (станом на 2026-07-31). Потребує PostHog-ключа зі
> scope `project:write` — це ручна дія власника, не CI.

### 10.1 Проблема

Проєкт `167740` налаштований на **UTC**. Доменний інваріант продукту —
**Europe/Kyiv**: день рахується в київській локальній зоні
([domain-invariants.md](../../02-engineering/architecture/domain-invariants.md)),
`getKyivDayKey()` формує `YYYY-MM-DD` саме так, тиждень починається з
понеділка. PostHog же бʼє події по добах у часовому поясі **проєкту**.

Тому одна й та сама подія має ДВІ різні дати: `day_key` у payload (Kyiv,
пише клієнт) і добове відро PostHog (UTC). Влітку розбіжність — 3 години.

**Що це ламає конкретно:** дія о 01:00 Kyiv — це 22:00 UTC _попередньої_
доби. Для habit-продукту, де «закрити день» роблять пізно ввечері, вечірня
активність систематично падає у попередній день. D1/D7-ретеншн зсувається,
а стрік у PostHog не збігається зі стріком, який бачить користувач в
інтерфейсі.

### 10.2 Прихований баг WF-60 / WF-63, який це ж і виправить

`toStartOfDay()` і `now()` у HogQL резолвляться в **часовому поясі
проєкту**. А знімки рахують вікно так:

```sql
WHERE timestamp >= toStartOfDay(now() - INTERVAL 1 DAY)
  AND timestamp <  toStartOfDay(now())
```

…і при цьому підписують рядок датою, обчисленою в JS **у Kyiv**:

```js
// ops/n8n-workflows/60-growth-funnel-snapshot.json → "Build funnel rows"
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', … });
const snapshotDate = fmt.format(yesterday);
```

Тобто **підпис київський, а дані — UTC-ові**. Рядок `snapshotDate=2026-07-30`
насправді містить вікно `[30.07 03:00 – 31.07 03:00]` за Києвом. Це вже
неправда сьогодні, просто її ніхто не помітив на нульовому трафіку.
Перемикання проєкту на `Europe/Kyiv` **усуває розбіжність**: підпис і вікно
нарешті починають означати одне й те саме. Те саме стосується WF-63.

### 10.3 Ціна переходу

- **Історію не перепише.** PostHog зберігає timestamp-и в UTC і конвертує на
  читанні, тож зміна ретроактивно **переріже** наявні дані по нових межах
  доби. Структурно нічого не ламається, але добові числа за минуле трохи
  поїдуть — це очікувано, не регрес.
- **Одноразовий шов у знімках.** Вікно зсувається на 3 год назад, тож у день
  перемикання прогін WF-60/63 перекриється з попереднім приблизно на 3 години
  → одна злегка завищена доба. Втрати даних немає (перекриття, не розрив).
  Не гнатися за цим «сплеском».
- **Найкращий момент — зараз.** Трафіку ще немає (§8): міняти до приходу
  30 тестерів дешевше, ніж після, коли будуть числа, які схочеться
  порівнювати між собою.

### 10.4 Як зробити

UI: **Project settings → General → Timezone → `Europe/Kyiv`**.

Або API (ключ зі scope `project:write`):

```bash
curl -X PATCH "https://eu.posthog.com/api/projects/167740/" \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"timezone":"Europe/Kyiv"}'
```

Те саме варто зробити для `dev serg` (id `167756`), інакше preview і прод
рахуватимуть добу по-різному.

**Після зміни перевірити:** 7 панелей дашборда `777283` відкриваються без
помилок; наступний нічний прогін WF-60 і WF-63 не впав і поклав рівно один
рядок; `snapshotDate` у Telegram-звіті збігається з добою, за яку прийшли
числа.
