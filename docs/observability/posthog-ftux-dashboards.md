# PostHog FTUX dashboards — runbook

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Operational runbook for PostHog (Cloud EU) dashboards that monitor the
First-Time User Experience (FTUX) funnel. Owns the contracts that
[`apps/web/src/core/observability/analytics.ts`](../../apps/web/src/core/observability/analytics.ts)
must respect when firing canonical events — payload field names below
are normative for all `trackEvent(...)` callsites.

> **Implementation status (2026-05-03 v2):** every event in §2 is wired
> on web. S0.4 ([PR #1582](https://github.com/Skords-01/Sergeant/pull/1582))
> closed the last 9 missing call-sites; S0.5 (this doc, [PR #1570](https://github.com/Skords-01/Sergeant/pull/1570))
> defined the contracts. The `Fired by` column links to the exact
> call-site in code so dashboard authors can grep payloads from the
> source of truth. Mobile parity (S0.3) is still TODO — dashboards
> currently aggregate web-only traffic; `platform` super-property
> already segments cleanly when mobile lands.

> **Cross-refs:**
> [`docs/observability/frontend.md`](./frontend.md) — analytics
> transport · [`docs/launch/product-os/ftux-sprint-plan.md` §2](../launch/product-os/ftux-sprint-plan.md#2-sprint-0--analytics-live-1-тиждень)
> — Sprint 0 deliverable spec (this doc is **S0.5**) ·
> [`docs/launch/business/01-monetization-and-pricing.md` §7](../launch/business/01-monetization-and-pricing.md)
> — activation baseline · [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts)
> — canonical event names (single source of truth).

---

## 1. Where this lives in PostHog

- **Account:** Sergeant Cloud EU (host `https://eu.i.posthog.com`).
- **Project:** `Default project` (id `167740`, prod token `phc_A8dsj…`).
  Separate `dev serg` project (id `167756`, token `phc_mSvKK…`) covers
  preview deployments — same dashboards, separate data.
- **Folder:** [`Dashboards → FTUX overview`](https://eu.posthog.com/project/167740/dashboard/660031)
  (id `660031`) — five insights below pinned to one umbrella dashboard.
  Public shareable read-only mirror: [`shared/BUeYAKM…`](https://eu.posthog.com/shared/BUeYAKMJiAKLFfxexqYVD7cyJlo_2A).
- **Permissions:** founders + on-call SRE have `Dashboard collaborator`.
  Anyone else with PostHog access can view but not edit.

> **Founder-task status (2026-05-04):** the five insights and the
> umbrella dashboard are created via PostHog API (see §3 for live
> links). `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` are wired in Vercel
> for both `production` and `preview` targets. Live screenshots will
> populate inside each insight tile as soon as `onboarding_started`
> traffic lands in `Default project`.

---

## 2. Canonical events consumed

Every insight in §3 reads from a subset of these canonical events.
**All names are frozen** — see
[`analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts).

| Event                            | Fired by                                                                                                                                                                                                   | Required payload                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `onboarding_started`             | [`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx) mount                                                                                                                    | —                                                                                              |
| `onboarding_step_viewed`         | [`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx) welcome paint (single-screen v3)                                                                                         | `step: "welcome"` (only step in v3 — contract reserves `"modules" \| "ready"` for future)      |
| `onboarding_step_completed`      | [`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx) `finish()` exit                                                                                                          | `step: "welcome"`, `durationMs: number`                                                        |
| `onboarding_skipped`             | _Not wired in v3 — wizard is single-screen with no skip affordance. Contract preserved for S1 if a Skip CTA returns; payload `{ step: string }`._                                                          | `step`                                                                                         |
| `onboarding_vibe_picked`         | [`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx) `finish()`                                                                                                               | `picks: string[]`, `picksCount: number`                                                        |
| `onboarding_completed`           | [`OnboardingWizard.tsx`](../../apps/web/src/core/onboarding/OnboardingWizard.tsx) `finish()`                                                                                                               | `intent: "vibe_picked" \| "vibe_empty"`, `picksCount: number`                                  |
| `onboarding_first_action_shown`  | [`FirstActionSheet.tsx`](../../apps/web/src/core/onboarding/FirstActionSheet.tsx) open                                                                                                                     | `module: string`, `source: "auto" \| "user"`                                                   |
| `onboarding_first_action_picked` | [`FirstActionSheet.tsx`](../../apps/web/src/core/onboarding/FirstActionSheet.tsx) choose                                                                                                                   | `module: string`, `action: string`                                                             |
| `ftux_preset_sheet_shown`        | [`PresetSheet.tsx`](../../apps/web/src/core/onboarding/PresetSheet.tsx) open                                                                                                                               | `module: string`                                                                               |
| `ftux_preset_picked`             | [`PresetSheet.tsx`](../../apps/web/src/core/onboarding/PresetSheet.tsx) choose preset                                                                                                                      | `module: string`, `presetId: string`                                                           |
| `ftux_preset_custom`             | [`PresetSheet.tsx`](../../apps/web/src/core/onboarding/PresetSheet.tsx) skip-presets path                                                                                                                  | `module: string`                                                                               |
| `first_real_entry`               | [`firstRealEntry.ts#detectFirstRealEntry`](../../packages/shared/src/lib/firstRealEntry.ts) (web + mobile via shared)                                                                                      | —                                                                                              |
| `ftux_time_to_value`             | [`firstRealEntry.ts#detectFirstRealEntry`](../../packages/shared/src/lib/firstRealEntry.ts) once when flag flips                                                                                           | `durationMs: number`, `durationSec: number`                                                    |
| `celebration_shown`              | [`CelebrationModal.tsx`](../../apps/web/src/core/onboarding/CelebrationModal.tsx) open                                                                                                                     | `ttvMs: number \| null`, `source: "first_entry"` (contract reserves `"streak" \| "milestone"`) |
| `module_checklist_shown`         | [`ModuleChecklist.tsx`](../../apps/web/src/core/onboarding/ModuleChecklist.tsx) first paint per module                                                                                                     | `module: DashboardModuleId`                                                                    |
| `module_checklist_step_done`     | [`ModuleChecklist.tsx`](../../apps/web/src/core/onboarding/ModuleChecklist.tsx) `handleStepDone`                                                                                                           | `module: DashboardModuleId`, `stepId: string`, `completed: number`, `total: number`            |
| `module_checklist_dismissed`     | [`ModuleChecklist.tsx`](../../apps/web/src/core/onboarding/ModuleChecklist.tsx) `handleDismiss`                                                                                                            | `module: DashboardModuleId`, `completed: number`, `total: number`                              |
| `streak_milestone_reached`       | [`dashboardCards.tsx`](../../apps/web/src/core/hub/dashboard/dashboardCards.tsx) `<StreakIndicator/>` crossing detector (chosen over `<StreakCelebration>` because the modal isn't wired into the hub yet) | `days: number`, `type: "toast"` (contract reserves `"modal"` for when StreakCelebration ships) |
| `hint_dismissed`                 | [`HintsOrchestrator.tsx`](../../apps/web/src/core/hints/HintsOrchestrator.tsx) toast timeout without action                                                                                                | `id: string`, `via: "timeout"` (contract reserves `"x" \| "swipe"` for explicit dismiss UI)    |
| `hint_completed`                 | [`HintsOrchestrator.tsx`](../../apps/web/src/core/hints/HintsOrchestrator.tsx) toast action click                                                                                                          | `id: string`, `via: "action"`                                                                  |
| `budget_set`                     | [`Budgets.tsx`](../../apps/web/src/modules/finyk/pages/budgets/Budgets.tsx)                                                                                                                                | `bucket: string`, `amount: number`, `currency: string`                                         |

**Super-properties** (registered via `posthog.register`, set in
[`apps/web/src/core/observability/posthog.ts`](../../apps/web/src/core/observability/posthog.ts)):

- `platform: "web" | "ios" | "android"`
- `is_capacitor: boolean`

**Person-properties** (set via `identifyPostHogUser`, see
[`apps/web/src/core/observability/identifyTraits.ts`](../../apps/web/src/core/observability/identifyTraits.ts)):

- `vibe: string[]` — module picks
- `plan: "free" | "plus" | "pro"`
- `locale: string`
- `signup_date: ISO8601`

> **Contract rule:** the field names above are stable. Do **not** rename
> them in payloads without bumping the dashboards in §3 — broken filters
> silently zero out tiles for ≥7 days before someone notices.

---

## 3. The five saved insights

All HogQL queries below assume the events table is `events` and that
`person.properties` columns are populated by `identify`. Replace the
placeholder screenshot URLs with live PostHog links once the insights
are created.

### 3.1 Activation funnel

**Type:** Funnel (steps — strict sequence) · **Time range:** Last 28
days · **Breakdown:** `vibe` (person property) · **Conversion window:**
24 hours.

**Steps (in order):**

1. `onboarding_started`
2. `onboarding_step_viewed` (any step — in v3 wizard always `step = "welcome"`)
3. `onboarding_step_completed` (any step — in v3 wizard always `step = "welcome"`)
4. `onboarding_vibe_picked`
5. `onboarding_first_action_picked`
6. `ftux_preset_picked` **OR** `ftux_preset_custom`
7. `first_real_entry`
8. `celebration_shown` (filter: `source = "first_entry"`)

> **Wizard-version note:** the current single-screen wizard fires step
> `"welcome"` for both `onboarding_step_viewed` and
> `onboarding_step_completed`. When S1 reintroduces multi-step
> screens, expand the funnel breakdown by `properties.step` to keep
> per-step drop-off visible — the contract already accepts
> `"modules" \| "ready"` (see §2).

**Why:** end-to-end funnel from wizard mount to celebrated first real
entry. **No gaps allowed** — if any step has 0 events the funnel
short-circuits to 0% activation, which is the canary the entire FTUX
sprint depends on.

**Targets:** see [§5](#5-alert-thresholds).

**Live insight:** [PostHog → Default project → Insights → `FTUX —
Activation funnel`](https://eu.posthog.com/project/167740/insights/CAFlb0aB)
(short_id `CAFlb0aB`, id `4067227`). Public read-only mirror:
[`shared/U9UPIw5…`](https://eu.posthog.com/shared/U9UPIw5Qg0akOR2bMaWnWfh2ZRfqNQ).

### 3.2 TTV histogram

**Type:** Trends (Distribution) · **Event:** `ftux_time_to_value` ·
**Aggregation:** numeric histogram on `properties.durationSec` ·
**Bucket size:** 30 seconds · **Time range:** Last 28 days.

**HogQL:**

```sql
SELECT
  toStartOfInterval(toFloat(properties.durationSec) / 30, INTERVAL 1 SECOND) AS bucket_30s,
  count() AS users
FROM events
WHERE event = 'ftux_time_to_value'
  AND timestamp > now() - INTERVAL 28 DAY
  AND toFloat(properties.durationSec) BETWEEN 0 AND 1800
GROUP BY bucket_30s
ORDER BY bucket_30s
```

**Why:** TTV (time-to-value) p50 is the single number that summarizes
"how long until the user gets to _their data_". Histogram shape is more
informative than a single percentile — bimodal distribution means the
preset path and the manual path are diverging.

**Targets:** p50 < 90 sec (per
[`ftux-sprint-plan.md` §8](../launch/product-os/ftux-sprint-plan.md#8-roll-up-success-metrics-dashboard)) ·
p95 < 600 sec (10 min) — anything beyond is a stuck user, not a slow
one.

**Live insight:** [PostHog → `FTUX — TTV histogram`](https://eu.posthog.com/project/167740/insights/P5LTH7Lx)
(short_id `P5LTH7Lx`, id `4067225`). Public read-only mirror:
[`shared/oCa-3B7…`](https://eu.posthog.com/shared/oCa-3B79r1fUKK0nBJZtO68TNiUskA).

### 3.3 Vibe → first-entry per module

**Type:** Trends · **Series:** `first_real_entry` · **Breakdown:**
person property `vibe` (array — PostHog flattens) · **Filter:** `event
property module ∈ {finyk, fizruk, routine, nutrition}` (set by the
emitting hook) · **Time range:** Last 28 days.

**Why:** detects the audit's "vibe-blind primary action" failure mode.
If a user picks `finyk` only and the first real entry overwhelmingly
arrives in `nutrition`, the FTUX flow is suggesting the wrong primary
action. We expect a strong correlation diagonal — most-picked vibe ==
module of first entry.

**Reads as:** matrix `vibe-pick × first-entry-module`. Off-diagonal mass

> 30% means the recommendation engine is misaligned with intent.

**HogQL (matrix-shaped):**

```sql
SELECT
  arrayJoin(person.properties.vibe) AS vibe,
  properties.module AS first_entry_module,
  count() AS users
FROM events
WHERE event = 'first_real_entry'
  AND timestamp > now() - INTERVAL 28 DAY
GROUP BY vibe, first_entry_module
ORDER BY users DESC
```

**Live insight:** [PostHog → `FTUX — Vibe → first-entry per module`](https://eu.posthog.com/project/167740/insights/tP7zi64v)
(short_id `tP7zi64v`, id `4067226`). Public read-only mirror:
[`shared/upU4TJs…`](https://eu.posthog.com/shared/upU4TJsJ9bPcXRplrcdmQaPBs3Aceg).

### 3.4 D1/D7 retention by signup-cohort

**Type:** Retention · **Cohortizing event:** `onboarding_started`
(first event per user — cohort = `properties.signup_date` truncated to
day) · **Returning event:** any event in `["first_real_entry",
"expense_added", "module_checklist_step_done", "celebration_shown"]` ·
**Granularity:** Day · **Period:** 30 days back, 7 days forward.

**Why:** D1 + D7 retention are the load-bearing metrics for the entire
FTUX sprint. D1 measures whether the user came back at all; D7 measures
whether the FTUX promise sustained beyond a single session of curiosity.

**Targets:** D1 ≥ 35% · D7 ≥ 15% (baseline TBD in
[`ftux-sprint-plan.md` §8](../launch/product-os/ftux-sprint-plan.md#8-roll-up-success-metrics-dashboard) —
update both files together when the first 28 days of data land).

**Live insight:** [PostHog → `FTUX — D1/D7 retention by signup-cohort`](https://eu.posthog.com/project/167740/insights/zUCGdOKV)
(short_id `zUCGdOKV`, id `4067228`). Public read-only mirror:
[`shared/pdN2Nh3…`](https://eu.posthog.com/shared/pdN2Nh361uXIMuGZTfBpEUXp88jIXg).

### 3.5 Celebration drop-off

**Type:** Funnel · **Time range:** Last 28 days · **Conversion window:**
6 hours.

**Steps (strict sequence):**

1. `celebration_shown` (filter: `source = "first_entry"`)
2. **EITHER** `module_checklist_shown` **OR** `ftux_preset_picked`
   **OR** any module-specific add (e.g. `expense_added`,
   `module_checklist_step_done`) — use OR-step in PostHog.

**Why:** the audit identifies celebration as a **terminal** screen —
users see confetti and then bounce. This funnel quantifies the bounce.
If step-2 conversion < 50% within 6 hours, the celebration modal is the
de-facto exit point of the FTUX flow and S3.1 (module-aware
CelebrationModal headlines, see
[`ftux-sprint-plan.md` §5](../launch/product-os/ftux-sprint-plan.md#5-sprint-3--reward-у-правильний-момент--value-progress-2-тижні))
needs to ship.

**Live insight:** [PostHog → `FTUX — Celebration drop-off`](https://eu.posthog.com/project/167740/insights/tl8c3e1T)
(short_id `tl8c3e1T`, id `4067229`). Public read-only mirror:
[`shared/aKbPKJG…`](https://eu.posthog.com/shared/aKbPKJGCE0zW5dSl56gU1PhExMQ1UQ).

---

## 4. Umbrella dashboard

[`Dashboards → FTUX overview`](https://eu.posthog.com/project/167740/dashboard/660031)
(id `660031`, public mirror: [`shared/BUeYAKM…`](https://eu.posthog.com/shared/BUeYAKMJiAKLFfxexqYVD7cyJlo_2A))
pins:

| Slot | Tile                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | §3.1 Activation funnel — full width, last 28 days, breakdown by `vibe`                                           |
| 2    | §3.2 TTV histogram — half width                                                                                  |
| 3    | §3.4 D1/D7 retention — half width                                                                                |
| 4    | §3.3 Vibe → first-entry per module — full width                                                                  |
| 5    | §3.5 Celebration drop-off — half width                                                                           |
| 6    | Daily counters (single-stats): `onboarding_started`, `first_real_entry`, `celebration_shown` (last 24h, last 7d) |

**Refresh cadence:** PostHog default (30 min). On-call rotates through
the umbrella dashboard during morning standup.

---

## 5. Alert thresholds

PostHog → **Alerts** (subscriptions, Slack `#sergeant-ftux-alerts`):

| Alert                     | Source           | Condition                                            | Severity                                                                        |
| ------------------------- | ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Funnel collapse           | §3.1 step 1→8    | overall conversion < 15% (7-day rolling)             | P1 — page on-call. Likely missing-event regression (S0.4 contract drift).       |
| Wizard floor              | §3.1 step 1→4    | drop-off step 1→4 > 60% (7-day rolling)              | P2 — file Linear ticket. Hero copy / module picks are scaring users away.       |
| TTV blow-out              | §3.2 histogram   | p50 > 180 sec (28-day window)                        | P2 — first-action recommendation is too vague or PresetSheet is empty.          |
| Celebration is a dead end | §3.5 step 1→2    | conversion < 40% within 6h (7-day rolling)           | P2 — schedule S3.1 (module-aware celebration headlines).                        |
| D1 retention regression   | §3.4 D1 cohort   | D1 < baseline − 5pp for any signup-cohort            | P1 — page on-call. Likely a user-facing regression on the hub.                  |
| Funnel ZEROES             | any step in §3.1 | events count = 0 over 24h (and > 0 in the 7d before) | P1 — page on-call. **Always** indicates a deploy that broke `trackEvent` calls. |
| FTUX_TIME_TO_VALUE silent | §3.2 series      | event count = 0 over 7d while `first_real_entry` > 0 | P1 — `markFirstActionStartedAt()` regression; TTV measurement is broken.        |

> **Why P1 for "funnel ZEROES":** every previous outage where canonical
> events stopped firing took 3–9 days to detect through dashboards
> alone. A naked zero-count alert on **each** funnel step is the
> cheapest leading indicator.

---

## 6. Runbook — adding a new insight

When a new event lands in
[`analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts)
and you need a dashboard to monitor it, follow this checklist:

1. **Frame the question.** What user behaviour or product hypothesis is
   the insight checking? Write it as a single sentence in the PR
   description (e.g. "Users who hit `streak_milestone_reached` at day 7
   are 2× more likely to log a real entry on day 8."). If the question
   is mushy, the dashboard will be too.
2. **Pick the chart type.** Funnels for ordered sequences; trends for
   over-time counts; retention for cohort-based stickiness; histograms
   for distribution shape.
3. **Write the HogQL** in the PostHog **Data exploration → SQL editor**
   first. Validate the schema with `LIMIT 100` queries. Only after the
   query returns the right data, lift it into a saved insight.
4. **Pin to the umbrella dashboard.** Either `FTUX overview` (if FTUX-
   relevant) or create a new domain-scoped dashboard
   (`Dashboards → <Domain>`). Never let an insight live as a personal
   bookmark — they rot inside a quarter.
5. **Document in this file.** Add a row to §2 (if a new event), an
   entry in §3 (the insight itself), and an alert threshold in §5 if it
   warrants paging. The doc and the dashboard ship in the same PR.
6. **Set an alert** if it materially affects activation, retention, or
   billing. Never add a "nice to track" alert — alert fatigue is real
   and costs us the P1 ones.
7. **Add a screenshot link** in §3 once the insight is saved. Anyone
   reading this doc should be able to land on the live tile in two
   clicks.

**Hard rules:**

- Insights are **owned by docs** here, not by individual editors.
  Drift = stale dashboard. The PR that adds an insight must update §3.
- Never add a derived insight that consumes events not declared in §2.
  If you need a new event, file a separate PR that wires it in
  [`analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts)
  - the call-site, **then** the insight PR. This keeps the funnel
    contract atomic.
- Every breakdown property must be either a super-property or a
  person-property registered via `identify`. Never break down by
  ad-hoc event payload fields — that creates cardinality time-bombs.

---

## 7. Open questions / TODOs

- **Mobile parity (S0.3).** Until `apps/mobile` writes to PostHog
  (planned in
  [`ftux-sprint-plan.md` §2](../launch/product-os/ftux-sprint-plan.md#2-sprint-0--analytics-live-1-тиждень)
  S0.3), all five insights here represent **web-only** users. The
  super-property `platform` is already registered, so insights will
  start segmenting cleanly the moment mobile lands without dashboard
  edits.
- **`signup_date` cohort precision.** Person-property is set on
  identify, which fires on first authenticated session. Anonymous-only
  users never get a `signup_date` and fall out of §3.4 retention.
  Acceptable trade-off until soft-auth conversion uplift kicks in.
- **A/B testing.** Sprint 5 (goal-first wizard) introduces feature
  flags. When that lands, add a §3.6 insight that breaks down §3.1 by
  the active variant.
