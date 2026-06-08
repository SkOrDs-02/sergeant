# Telemetry rollout plan

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

> Канонічний план перебудови product-telemetry layer Sergeant. Згенеровано
> через chain skills `product-tracking-skills` (audit → design → guide →
> implement). Артефакти кожної фази лежать у [`.telemetry/`](../../../.telemetry)
> на корені моноріпо; цей документ — narrative-обгортка для людей.

---

## 1. Чому це треба

У Sergeant зріла PostHog + Sentry інфраструктура: 94 централізованих events
у [`packages/shared/src/lib/analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts),
custom HTTP transport на mobile, server-side capture для billing, identity
bridge з $anon_distinct_id stitching. Але аудит виявив 11 розривів, які
коштують грошей у вигляді сліпих плям у funnel-аналітиці та сповільнюють
debug-цикл при incident-ах.

Найкритичніше:

- **PostHog ↔ Sentry desync.** `Sentry.setUser` викликається тільки на server
  ([`apps/server/src/auth.ts:517`](../../../apps/server/src/auth.ts)). Web + mobile
  не лінкують Sentry user.id з PostHog distinct_id, тому "open Sentry issue →
  see PostHog funnel for affected users" вимагає ручного матчингу ID.
- **Mobile Sentry init відсутній.** `@sentry/react-native` декларовано
  у [`apps/mobile/package.json`](../../../apps/mobile/package.json), але `Sentry.init`
  не викликається. Mobile crashes у production не доходять до Sentry.
- **Duplicate mobile identity bridges.** Два модулі роблять однакову
  роботу ([`apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx`](../../../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx)
  vs [`apps/mobile/src/observability/IdentityBridge.tsx`](../../../apps/mobile/src/observability/IdentityBridge.tsx)).
- **Немає screen tracking на mobile.** Web має кастомний `PageviewTracker`,
  mobile — нічого. Експо router transitions не трекаються.
- **Немає explicit session-start event.** PostHog авто-створює сесію з
  pageview; mobile pageview-у не має, тому MAU/DAU доводиться обчислювати
  через first-event-of-day евристики.
- **Payload contracts документовані тільки в JSDoc.** `trackEvent` приймає
  `Record<string, unknown>` — типи не enforced на callsites.
- **Internal users (наша команда) попадають у production cohorts.**
  `is_internal` trait не існує; гейту немає.

Повний інвентар + observation list — у [`.telemetry/audits/2026-05-17.md`](../../../.telemetry/audits/2026-05-17.md).

## 2. Цільовий стан

Після завершення плану:

- Кожен PostHog `identify` парується з `Sentry.setUser` атомарно через
  єдиний wrapper `identifyUser(userId, traits)`.
- Mobile має повноцінний Sentry init (sampling profile дзеркало web).
- Mobile identity bridge — один, не два.
- `is_internal` trait + gate на рівні `trackEvent` (escape через
  `localStorage.ph_debug='1'`).
- 96 events (поточні 94 + 3 нових − 1 deprecated), іменування зафіксовано
  ESLint rule.
- `trackEvent` типізований через discriminated union `AnalyticsEventMap`.
- Snapshot person-properties (streak, MAU, modules_active) оновлюються
  daily через server cron.

Цільовий план — [`.telemetry/tracking-plan.yaml`](../../../.telemetry/tracking-plan.yaml).
Delta — [`.telemetry/delta.md`](../../../.telemetry/delta.md).
Patterns + complete code templates — [`.telemetry/instrument.md`](../../../.telemetry/instrument.md).

## 3. Файли-артефакти у `.telemetry/`

| Файл                                                                         | Що містить                                         | Skill що генерує                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| [`product.md`](../../../.telemetry/product.md)                               | Product model: entities, value flows, B2C scope    | `product-tracking-model-product`                 |
| [`current-state.yaml`](../../../.telemetry/current-state.yaml)               | Інвентар 94 LIVE events, identity calls, traits    | `product-tracking-audit-current-tracking`        |
| [`current-implementation.md`](../../../.telemetry/current-implementation.md) | Як зараз працює wiring (init, routing, identity)   | те саме                                          |
| [`audits/2026-05-17.md`](../../../.telemetry/audits/2026-05-17.md)           | Human-readable audit snapshot                      | те саме                                          |
| [`tracking-plan.yaml`](../../../.telemetry/tracking-plan.yaml)               | Цільовий план: 96 events, 12 traits, snapshot sync | `product-tracking-design-tracking-plan`          |
| [`delta.md`](../../../.telemetry/delta.md)                                   | Diff current → target з phased backlog             | те саме                                          |
| [`instrument.md`](../../../.telemetry/instrument.md)                         | PostHog-specific copy-paste код                    | `product-tracking-generate-implementation-guide` |
| [`generated/`](../../../.telemetry/generated)                                | Draft файли для Phase 1 + MIGRATION.md             | `product-tracking-implement-tracking`            |

Регенерація після зміни плану — повторний запуск відповідного skill з
`/product-tracking-skills:<skill-name>`.

## 4. PR-черга

7 послідовних PR-ів. Кожен — атомарний, окремий revert window, не блокує
наступні якщо попередній зелений. Залежності — у [§ 5](#5-залежності).

---

### PR-1 — `feat(observability): pair PostHog identify with Sentry setUser`

**Scope:** observability coupling. Без зміни event volume.

**Why:** найбільший value-per-day у всій черзі. Закриває критичну дірку
"Sentry issue → PostHog funnel" + додає mobile Sentry.

**Файли (драфти у [`.telemetry/generated/`](../../../.telemetry/generated), точні diff у [`MIGRATION.md`](../../../.telemetry/generated/MIGRATION.md)):**

- NEW `apps/web/src/core/observability/identity.ts` + test
- NEW `apps/mobile/src/lib/observability/sentry.ts`
- NEW `apps/mobile/src/features/analytics/identity.ts`
- NEW `apps/server/src/lib/identity.ts`
- APPEND `apps/mobile/src/lib/observability/posthog.ts` — `setPostHogPersonProperties`
- EDIT [`apps/web/src/core/auth/AuthContext.tsx`](../../../apps/web/src/core/auth/AuthContext.tsx) — swap до `identifyUser`/`resetIdentity`
- EDIT [`apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx`](../../../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx) + test
- EDIT [`apps/mobile/app/_layout.tsx`](../../../apps/mobile/app/_layout.tsx) — `initSentry()` поруч з `initPostHog()`
- EDIT [`apps/server/src/auth.ts`](../../../apps/server/src/auth.ts) — використати `setUserContext`
- EDIT [`apps/server/src/modules/billing/stripe.ts`](../../../apps/server/src/modules/billing/stripe.ts) — `setUserTraits({plan})` після subscription events
- DELETE `apps/mobile/src/observability/IdentityBridge.tsx`
- EDIT `apps/mobile/.env.example` + EAS — додати `EXPO_PUBLIC_SENTRY_DSN`

**Tests:** Vitest на web identity (pair-call, dedup, reset). Jest на mobile
bridge (mock targets оновлені).

**Verification:**

```bash
pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/mobile typecheck
pnpm --filter @sergeant/server typecheck
```

Staging smoke: sign-in → PostHog Activity показує `identify` + Sentry
знаходить user.id. Trigger deliberate error → Sentry issue несе той самий id.

**Risk:** low — additive wrapper. Worst case: identify дублюється → PostHog
де-дупає на сервері.

**Rollback:** revert PR. Старі `identifyPostHogUser`/`resetPostHog` exports
не чіпані, тільки додано wrapper.

**ETA:** 1 день.

---

### PR-2 — `chore(eslint-plugins): lock event-name convention`

**Scope:** ESLint rule + guard rails. Без поведінкових змін.

**Why:** після PR-1 codebase готовий до growth — без guard rails нові
розробники додаватимуть inline strings і drift повернеться через 3 місяці.

**Файли:**

- EDIT [`packages/eslint-plugin-sergeant-design/`](../../../packages/eslint-plugin-sergeant-design) — нове правило:
  - заборонити string literals у `trackEvent` першому аргументі (тільки `ANALYTICS_EVENTS.X`)
  - вимагати `^[a-z][a-z0-9_]*_<past_tense_verb>$` для нових values у `ANALYTICS_EVENTS`
  - whitelist verbs з [`delta.md § Naming`](../../../.telemetry/delta.md#naming-convention--locked-not-migrated)
- NEW section у [`AGENTS.md`](../../../AGENTS.md) або `docs/04-governance/governance/telemetry-naming.md`
- ADD test fixtures у plugin

**Tests:** ESLint plugin test suite + dry-run rule against `analyticsEvents.ts`
(всі 94 існуючі events мають пройти).

**Verification:** `pnpm lint` зелений; deliberate violation (додати
`BadName: "badName"`) → ESLint червоніє.

**Risk:** medium — якщо whitelist verbs неповний, ловить legitimate events.
Mitigation: extensive list, dry-run на existing first.

**Rollback:** revert rule, лишити docs.

**ETA:** 0.5 дня.

---

### PR-3 — `refactor(shared): rename two events with implementation leakage (dual-write)`

**Scope:** Two renames з dual-write release window.

**Why:**

- `module_settings_opened_from_module` — суфікс `_from_module` leak-ає
  implementation (зараз fire тільки з module header). Drop suffix,
  encode джерело через `source: module_header | settings_root | deeplink`.
- `biometric_auth_failed_fallback_pin` — encode fallback через property,
  не у назві події. Дозволяє трекати failures які НЕ fallback-нули.

**Файли:**

- EDIT [`packages/shared/src/lib/analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts):
  - `MODULE_SETTINGS_OPENED`: value `module_settings_opened_from_module` → `module_settings_opened`
  - `BIOMETRIC_AUTH_FAILED_FALLBACK_PIN` → rename to `BIOMETRIC_AUTH_FAILED`, value → `biometric_auth_failed`, додати property `fallback`
- EDIT trackEvent wrapper — temp dual-write для 1 release cycle (2 тижні):
  ```ts
  // прибрати у PR-7
  if (RENAMED_EVENTS[name]) {
    capturePostHogEvent(RENAMED_EVENTS[name].old, payload);
  }
  ```
- EDIT callsites — додати `source` для `module_settings_opened`, `fallback` для `biometric_auth_failed`
- EDIT test snapshots

**Tests:** unit для dual-write logic, callsite tests оновлені.

**Verification:** PostHog Live Events показує обидва names; у дашбордах
switch на new name; PR-7 видаляє dual-write.

**Risk:** medium — забутий dashboard продовжить читати old name → стрибок
до нуля після PR-7. **Mitigation:** перед PR-7 grep
[`ops/n8n-workflows/`](../../../ops/n8n-workflows) + audit PostHog saved
insights.

**Rollback:** revert. Dual-write дозволяє безболісний revert до PR-7.

**ETA:** 3 дні.

---

### PR-4 — `feat(shared): add session_started, screen_viewed, feature_flag_evaluated`

**Scope:** 3 нових events. Additive.

**Why:**

- `session_started` — explicit session anchor. Без нього MAU/DAU
  обчислюється через first-event-of-day евристики, які crash-ять при
  додаванні background events.
- `screen_viewed` — mobile parity з web `PageviewTracker`. Throttled (one per
  route per session) щоб не інфлейтити volume.
- `feature_flag_evaluated` — exposure signal для non-experiment PostHog
  flags (kill switches, gradual rollouts). Throttled per `(flag, variant, session)`.

**Файли:**

- EDIT [`analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts) — 3 нові константи з payload contracts
- EDIT [`apps/web/src/core/observability/analytics.ts`](../../../apps/web/src/core/observability/analytics.ts) — додати `trackSessionStart`, `trackFeatureFlagExposure` throttled wrappers (pattern у [`instrument.md`](../../../.telemetry/instrument.md))
- EDIT `apps/web/src/main.tsx` — `trackSessionStart(true)` після hydration
- EDIT [`apps/mobile/app/_layout.tsx`](../../../apps/mobile/app/_layout.tsx) — `trackSessionStart(coldStart)` на App.start
- NEW mobile screen tracker — Expo router listener → throttled fire
- EDIT callsites `posthog.isFeatureEnabled` → wrap у `useExperiment` / `getFlag` що auto-fires exposure
- ADD tests на throttling

**Tests:** unit на throttling (одне eval → один event; повторне → no-op).

**Verification:** PostHog Live: один `session_started` per app launch;
`screen_viewed` ≤ 10/session; `feature_flag_evaluated` ≤ active_flags/session.

**Risk:** low. Worst case — throttle broken → volume spike. Monitor PostHog
event volume перший тиждень.

**Rollback:** revert.

**ETA:** 2 дні.

---

### PR-5 — `feat(observability): expand user traits (4 on-change + 5 snapshot stubs)`

**Scope:** Trait expansion. Snapshot — заглушки з нулями.

**Why:**

- 4 on-change traits (`is_internal`, `signup_provider`, `pwa_installed`,
  `*_enabled`, `mono_connected`) — закривають сегментацію без re-derive з event history.
- 5 snapshot traits (`streak_current/longest`, `expenses_count_30d`,
  `monthly_active_days`, `modules_active`) — потрібні для cohort dashboards.
  Stub з нулями дозволяє визначити cohorts заздалегідь; реальні числа
  з'являться коли aggregation cron landed.
- `is_internal` gate — закриває @anthropic / @sergeant.app users з
  production cohorts.

**Файли:**

- EDIT [`apps/web/src/core/observability/identifyTraits.ts`](../../../apps/web/src/core/observability/identifyTraits.ts) — додати 9 полів до `IdentifyTraits`
- EDIT [`buildIdentifyTraits`](../../../apps/web/src/core/observability/identifyTraits.ts) — заповнити `is_internal`, `signup_provider`
- EDIT callsites: PWA install handler, app-lock setup, biometric setup, bank-connect success — викликати `setPersonProperties({ ... })`
- EDIT [`trackEvent`](../../../apps/web/src/core/observability/analytics.ts) — gate `is_internal === true` (escape через `localStorage.ph_debug`)
- NEW `apps/server/src/jobs/snapshotPersonProperties.ts` — stub з нулями + cron registration
- ADD tests на is_internal gate

**Tests:** `trackEvent` skip коли is_internal; cron dispatches per-user `$set`.

**Verification:** signup з @anthropic.com → cohort "all users" не показує його
активність; PostHog person properties містять `pwa_installed` / `mono_connected`
після відповідних actions; snapshot traits з'являються через 24h cron.

**Risk:** medium — `is_internal` gate може випадково заглушити real users
якщо email domain matching широкий. **Mitigation:** точні домени
`@anthropic.com`, `@sergeant.app`; debug flag escape.

**Rollback:** revert. Cron вимикається окремо (cron registration в окремому
файлі).

**ETA:** 3 дні. Real snapshot impl — окремий PR-5b коли буде aggregation
table або PostHog data warehouse.

---

### PR-6 — `feat(shared): typed event payload contracts via discriminated union`

**Scope:** Великий refactor. `trackEvent` стає типізованим compile-time.

**Why:** payload contracts наразі живуть тільки у JSDoc. `trackEvent`
підписаний як `(name, payload?: Record<string, unknown>)` — будь-який shape
проходить. Compile-time enforcement = найдешевший спосіб ловити drift.

**Файли:**

- NEW `packages/shared/src/lib/analyticsEventMap.ts` — discriminated union `AnalyticsEventMap` з payload типом per event (всі 96)
- EDIT [`trackEvent`](../../../apps/web/src/core/observability/analytics.ts) signature → `<E extends AnalyticsEventName>(name: E, payload: AnalyticsEventMap[E]) => void`
- EDIT всі ~50 callsites — типи enforced; виправити mismatches
- OPTIONAL: AUTO-GEN script `packages/shared/scripts/gen-event-map.ts` що парсить JSDoc payload contracts з `analyticsEvents.ts` і генерує `analyticsEventMap.ts`
- EDIT tests — fixtures з правильними payloads

**Tests:** typecheck = test. Cover edge cases (optional properties, enum
constraints, integer vs number).

**Verification:** `pnpm typecheck` зелений. Deliberate test: змінити payload
→ compile error на всіх callsites.

**Risk:** high — найбільший refactor у черзі. Staging тестування обов'язкове.
Mitigation: PR-6 робиться **паралельно** з PR-3/4/5, але мерджиться **останнім**
щоб не плодити merge conflicts.

**Rollback:** revert. Старий `Record<string, unknown>` signature ще лежить
у git.

**ETA:** 1 тиждень.

---

### PR-7 — `chore(shared): drop dual-write for renamed events + remove onboarding_goal_first_shown`

**Scope:** Cleanup PR-3 dual-write + deprecate duplicate exposure event.

**Why:**

- Після 2-тижневого dual-write window dashboards мають бути перемкнуті на
  new names. Time to clean up.
- `ONBOARDING_GOAL_FIRST_SHOWN` дублюється `experiment_exposed`. Goal-first
  screen fires обидва, double-counting exposure у funnel.

**Файли:**

- EDIT `trackEvent` — прибрати `RENAMED_EVENTS` dual-write
- DELETE `ONBOARDING_GOAL_FIRST_SHOWN` з [`analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts)
- EDIT callsite у [`GoalFirstScreen.tsx`](../../../apps/web/src/core/onboarding/GoalFirstScreen.tsx) — replace з `experiment_exposed { experiment_id: "goal_first", variant }`
- VERIFY: grep [`ops/n8n-workflows/`](../../../ops/n8n-workflows) + PostHog saved insights — ніхто не читає старі назви

**Tests:** snapshot test для GoalFirstScreen що fires `experiment_exposed` з правильним `experiment_id`.

**Verification:** PostHog показує `experiment_exposed` для goal-first;
old event volume → 0.

**Risk:** medium — забутий dashboard. **Grep + dashboard audit обов'язковий
перед merge.**

**Rollback:** revert. Подія повернеться, dual-write знову актуальний.

**ETA:** 0.5 дня.

---

## 5. Залежності

```
PR-1 ─┬─→ PR-4 (нові events використовують identifyUser path)
      ├─→ PR-5 (traits йдуть через identifyUser)
      └─→ PR-6 (typed wrapper будується поверх identity модулю)

PR-2 ─→ незалежний (можна шипити будь-коли після PR-1)
PR-3 ─→ PR-7 (cleanup чекає 2-тижневий dual-write window)
PR-6 ─→ незалежний від PR-3/4/5, але краще ПІСЛЯ них (менше rebase)
```

Critical path: **PR-1 → PR-4/5 → PR-6**. Остальні паралелізуються.

## 6. Часова шкала

| Тиждень | Що мержиться      | Стан                                       |
| ------- | ----------------- | ------------------------------------------ |
| W1      | PR-1, PR-2        | observability coupling + naming guard      |
| W2      | PR-3 (dual-write) | renames live, both names fire              |
| W3      | PR-4              | нові events (session/screen/flag)          |
| W4      | PR-5              | trait expansion                            |
| W4-W5   | PR-6              | typed payloads (parallel з review)         |
| W5+2    | PR-7              | cleanup dual-write + drop deprecated event |

Усього ~5 тижнів реального часу. Critical-path-only (PR-1 + PR-4 + PR-5) =
~2 тижні чистого ship time.

## 7. Що НЕ входить у цей план

- **Group analytics для B2B.** Sergeant — B2C single-user. Якщо колись
  з'являться organizations у Better Auth, перезапустити
  `product-tracking-design-tracking-plan` — він видасть нову delta з
  `group()` calls.
- **Real snapshot aggregation queries.** Stub у PR-5 повертає нулі.
  Real impl — окремий PR-5b коли буде server-side analytics-aggregate cron
  або PostHog data warehouse.
- **Push notification events** (`notification_received`, `notification_opened`)
  — додати через `/product-tracking-skills:product-tracking-instrument-new-feature`
  коли push landed.
- **Sentry session replay.** Disabled зараз; якщо вмикати — окремий PR з
  агресивним PII masking для фінансових input-ів.

## 8. Як запускати наступні skill-и

```bash
# регенерувати audit після того як PR-1..7 змерджені
/product-tracking-skills:product-tracking-audit-current-tracking

# додати трекінг для нової фічі (наприклад push notif)
/product-tracking-skills:product-tracking-instrument-new-feature

# повний цикл з нуля якщо щось пішло не так
/product-tracking-skills:product-tracking-model-product
/product-tracking-skills:product-tracking-audit-current-tracking
/product-tracking-skills:product-tracking-design-tracking-plan
/product-tracking-skills:product-tracking-generate-implementation-guide
/product-tracking-skills:product-tracking-implement-tracking
```

Кожен skill — idempotent. Перезапуск переписує відповідний файл у
[`.telemetry/`](../../../.telemetry) на основі поточного стану коду.

## 9. Power-user шорткати

**Грепнути всі трекінг-callsites:**

```bash
git -C . grep -nE 'trackEvent\(ANALYTICS_EVENTS\.' apps packages
```

**Знайти orphans (events у каталозі без callsite):**

```bash
diff <(grep -oE '  [A-Z_0-9]+:' packages/shared/src/lib/analyticsEvents.ts | tr -d ' :' | sort -u) \
     <(grep -rohE 'ANALYTICS_EVENTS\.[A-Z_0-9]+' apps packages \
        --include='*.ts' --include='*.tsx' \
        | grep -v '\.test\.' \
        | sed 's/ANALYTICS_EVENTS\.//' | sort -u)
```

**Перевірити що PostHog отримав event:**

PostHog Cloud EU → Activity → Live events → filter `distinct_id = <user-id>`.
Latency: 1-3s після fire.

**Debug режим у браузері:**

```js
localStorage.setItem("ph_debug", "1"); // bypass is_internal gate (after PR-5)
posthog.debug(); // verbose SDK logs
posthog.get_distinct_id(); // current distinct_id
```

## 10. Owner + ескалація

- **Owner:** @Skords-01
- **Backup reviewer:** TBD (frontend-engineer secondary з [`AGENTS.md § Module ownership map`](../../../AGENTS.md#module-ownership-map))
- **PostHog admin:** @Skords-01 (Cloud EU project)
- **Sentry admin:** @Skords-01

Якщо щось ламається в production через будь-який з цих PR-ів:

1. **Revert PR.** Кожен PR має документований rollback.
2. **Sentry → search `user.id:<affected>`** щоб зрозуміти scope.
3. **PostHog → Activity → Live events** щоб побачити чи продовжують fire events.
4. **Якщо identify зламався** — користувачі продовжать fire events як
   anonymous, нічого не втрачено окрім identity attribution за період outage.

---

## Додатки

- [delta.md](../../../.telemetry/delta.md) — диф current → target
- [tracking-plan.yaml](../../../.telemetry/tracking-plan.yaml) — цільовий план
- [instrument.md](../../../.telemetry/instrument.md) — copy-paste код per pattern
- [generated/MIGRATION.md](../../../.telemetry/generated/MIGRATION.md) — Phase 1 step-by-step
- [audits/2026-05-17.md](../../../.telemetry/audits/2026-05-17.md) — initial audit snapshot
