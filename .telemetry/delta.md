# Delta: Current → Target

**Generated:** 2026-05-17
**Current state:** [`current-state.yaml`](current-state.yaml) — 94 LIVE events
**Target plan:** [`tracking-plan.yaml`](tracking-plan.yaml) — 94 events + 3 NEW + 2 RENAMES + 1 REMOVAL

## Headline

- **+3** new events (`session_started`, `screen_viewed`, `feature_flag_evaluated`)
- **−1** event removed (`onboarding_goal_first_shown` — duplicated by `experiment_exposed`)
- **2** renames (drop implementation detail from event names)
- **+8** new user traits (currently 4 → target 12; 5 are scheduled snapshots)
- **3** observability-coupling fixes (Sentry↔PostHog user link, mobile Sentry init, identity-bridge dedup)
- **0** group calls (B2C — confirmed not needed)
- **0** PII migrations needed (already `traits_only`)

Math check: target events = 96. Current LIVE = 94. Delta: ADD (3) + KEEP_AS_IS (90) + RENAME (2) − REMOVE (1) − ABSORBED (1: goal_first_shown → experiment_exposed). 94 → 96. ✓

## Оновлення 2026-07-25 — Хвиля 2, група `value_loop` (+10 подій, registry-only)

**Що змінилось:** у `tracking-plan.yaml` зареєстровано нову категорію `value_loop`
з 10 подій; імена заморожені в
[`packages/shared/src/lib/analyticsEvents.valueLoops.ts`](../packages/shared/src/lib/analyticsEvents.valueLoops.ts)
і пінуються verbatim у `analyticsEvents.test.ts`. Контракт заморожено ОДНИМ
рев'ювабельним патчем ДО інструментування — навмисно, бо імена подій де-факто
незворотні (§ «Naming convention» нижче).

**Оновлено 2026-07-25 (пізніше того ж дня) — половина «дію зроблено».**
До трьох `value_signal_*` додались пʼять web-callsite-ів:

| Подія                     | Callsite (web)                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `routine_habit_checked`   | `modules/routine/useRoutineAppState.ts` (`onToggleHabit` — `source: "ui"`, `onBulkMarkDay` — `source: "bulk"`) |
| `routine_streak_shown`    | `modules/routine/components/RoutineCalendarHero.tsx` (`surface: "hero_flame"`)                                 |
| `fizruk_workout_finished` | `modules/fizruk/components/workouts/WorkoutJournalSection.tsx`                                                 |
| `nutrition_meal_logged`   | `modules/nutrition/hooks/useNutritionLog.ts`                                                                   |
| `finyk_tx_categorized`    | `modules/finyk/components/TxRowCategoryPicker.tsx`                                                             |

**Оновлено 2026-07-25 (той самий день) — AI-порада.** `ai_advice_shown` /
`ai_advice_reacted` отримали web-callsite-и. Єдиний писар —
[`adviceTelemetry.ts`](../apps/web/src/core/observability/adviceTelemetry.ts);
двоє клієнтів: `AssistantAdviceCard` (`source: "coach_insight"`) і
`WeeklyDigestCard` (`source: "weekly_digest"`). Показ емітиться ЛИШЕ за
фактичної видимості тексту: картка живе у подвійному collapse (секція
«Інсайти» + власне згортання), тож `CollapsibleSection` отримав additive-проп
`onOpenChange`. Impression на mount роздув би знаменник у рази — назавжди.
Реакції зняті з ТРЬОХ наявних афордансів (`ask_ai` / `refresh` /
`collapse`+`expand`); нових кнопок не додано, тобто це проксі згоди, а не
дослівний лайк-дизлайк §ж.1 канону.

`advice_id` — випадковий uuid у `useCoachInsight` (кеш
`hub_coach_insight_cache_v1`: `{date, text}` → `{date, text, adviceId}`,
legacy-записи читаються без падіння). **Він клієнтський**: та сама денна порада
у вебі й на телефоні дасть два різні id — придатно для «побачив → зреагував»,
непридатно для підрахунку УНІКАЛЬНИХ порад. `instrumentation_version` у payload
дозволяє відрізати когорту зі старим бандлом (PWA service-worker).

Без callsite-ів лишилися mobile-дзеркала (`apps/mobile` — нуль подій). Домені поля
чотирьох action-подій дописані в `tracking-plan.yaml` у тому ж патчі
(`day_key`, `items` / `has_sets` / `duration_min`, `meal_type` / `source` /
`macro_source` / `has_macros`, `action` / `category_kind`) — у payload лише
counts і enum-и, жодної назви звички, вправи, страви чи категорії
(Hard Rule #21: `scrubPII` чистить за _іменами_ ключів, тож назву він би не
вирізав). Наявні `expense_added` / `income_added` / `budget_set` НЕ
перейменовані й не продубльовані — до них лише дописані поля атрибуції.

Леджер експозиції стріку — `modules/routine/lib/streakExposure.ts` (device-local
день за ADR-0078, дедуплікація показу по «(день, поверхня)»). Показ
streak-record-карточки туди НЕ пише: вона рендериться через `InsightCard` і вже
покрита `value_signal_shown`; другий запис подвоїв би покази.

⚠️ **Зріз `hero_flame` вироджений і не є експериментом.** `flame.visible ===
(streakDays > 0)`, а полумʼя живе на тому ж екрані, що й чекбокси — «бачив
полумʼя vs ні» порівнює когорти, а не стимул. Читати лише з розрізом по
`surface`, ніколи не схлопувати в один булеан. Деталі й правила знаменника —
[`posthog-founder-pulse.md § 8`](../docs/03-operations/observability/posthog-founder-pulse.md).

**Оновлено 2026-07-25 — callsite-и на вебі.** Три `value_signal_*` мають єдиного
писаря — спільний шов
[`InsightCard.tsx`](../apps/web/src/shared/components/ui/InsightCard.tsx)
(mount → `shown`, activate → `activated`, dismiss → `dismissed`), який покриває
всі 9 продуктових сигналів у 4 модулях без жодної правки в самих модулях.

Станом на кінець Хвилі 2 web-callsite-и мають **усі 10** подій групи: три
`value_signal_*`, чотири «дію зроблено», `routine_streak_shown` і обидві
`ai_advice_*` (таблиці callsite-ів вище). Без callsite-ів лишаються **лише
mobile-дзеркала** — це окремий рядок беклогу, не борг цієї хвилі.
`module` / `signal` виводяться з insight id через
[`insightId.ts`](../apps/web/src/shared/lib/insights/insightId.ts) (явний реєстр
kind-ів + longest-prefix, а не «зріж останній сегмент»); леджер атрибуції для
майбутніх action-подій —
[`valueSignalAttribution.ts`](../apps/web/src/core/observability/valueSignalAttribution.ts).
Два обмеження знаменника задокументовані в
[`docs/90-work/planning/product-knowledge-backlog.md`](../docs/90-work/planning/product-knowledge-backlog.md)
§ Хвиля 2: когорта до дати релізу = `unknown`, а не `false`; накопичені
dismissals (localStorage, назавжди) занижують кількість показів.

| Подія                                              | Що закриває                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `value_signal_shown` / `_activated` / `_dismissed` | B1 у `product-knowledge-{finyk,routine,nutrition,fizruk}.md` — половина «показано» |
| `routine_habit_checked`                            | B1 routine + зріз «чекін після показу стріку» (routine B3)                         |
| `fizruk_workout_finished`, `nutrition_meal_logged` | B1 fizruk / nutrition — половина «дію зроблено»                                    |
| `finyk_tx_categorized`                             | B1 finyk (єдина відсутня дія; `expense_added` / `budget_set` уже є)                |
| `ai_advice_shown` / `ai_advice_reacted`            | B1 `product-knowledge-hub-coach.md` — «подія показу інсайту + подія реакції»       |
| `routine_streak_shown`                             | Експозиція стріку поза `InsightCard` (щоб покази не подвоювались)                  |

**Три рішення, зафіксовані разом з іменами:**

1. **Вікно N не зашите в код.** Події несуть сирий `ms_since_signal`; N обирається
   в PostHog-запиті, тож переглядається заднім числом без перевипуску бандла.
2. **Тіла AI-поради в payload не існує.** `scrubPII` чистить за _іменами_ ключів
   (`packages/shared/src/lib/pii.ts`), тож поле на кшталт `advice_text` він НЕ виріже —
   захист є контрактом, а не сподіванням на скраб (Hard Rule #21). `advice_id` —
   випадковий uuid, а не хеш тексту.
3. **Сирий insight id у payload не кладеться.** `signal` — стабільний kind без
   змінного суфікса: інакше high-cardinality property + `categoryId` кастомної
   категорії (potential PII).

**НЕ додано в allowlist AI-пам'яті.** Жодна з 10 подій не входить у
`PRODUCT_MEMORY_EVENTS` (`apps/server/src/modules/ai-memory/eventSync.ts`) — інакше
шар вчився б на власному виході (аудит hub-coach, напруга 4).

**Наслідок для ESLint-правила нижче:** список дозволених дієслівних суфіксів треба
розширити на `activated`, `checked`, `finished`, `logged`, `reacted` — правило поки
не імплементоване, тож блокером це не є.

**Backfill неможливий.** Ретроактивно дізнатись, які сигнали показувались до релізу,
не можна ні з чого: сервер тіло поради не зберігає, історії показів не існує. Будь-яка
когорта до дати релізу подій показує нуль — це НЕ означає «сигналів не було». Для
чекінів Хвилі 1 (`routine_completion_events`) експозиція = `unknown`, а не `false`:
`COALESCE(saw_streak, false)` дав би штучне підтвердження гіпотези «стріки не мотивують».

## Naming convention — locked, not migrated

**Decision:** keep existing `object_verb_past_tense` snake_case (e.g. `expense_added`, `paywall_viewed`). Do **not** migrate to `object.action` dot-notation despite the skill's default recommendation.

**Why:**

- 94 LIVE events feeding production dashboards (WF-60 growth funnel, FTUX dashboards, dozens of saved PostHog insights, server-side growth-funnel snapshot timer — колишній n8n WF-60, виведено ADR-0090).
- Rename = lose historical continuity in every chart that filters by event name. Migrations either drop history or maintain a permanent rename map.
- The current style is internally consistent (always snake_case, always past tense, almost always object-first). Codify what exists; enforce on new events.

**Enforcement:** add an ESLint rule (or `pnpm lint:skills`-style check) that new entries in `ANALYTICS_EVENTS` must match `^[A-Z][A-Z0-9_]*$` and value must match `^[a-z][a-z0-9_]*_(added|deleted|updated|completed|started|viewed|clicked|dismissed|opened|closed|success|failed|seen|invoked|sent|received|prompted|accepted|reached|migrated|set|connected|categorized|hit|copied|retried|changed|granted|denied|requested|installed)$` — extend list as needed.

## Add — 3 new events

| Event                    | Category     | Source            | Why                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_started`        | lifecycle    | frontend          | No session-start signal today. App launches are inferred from first event in a session — fragile. PostHog session is auto-created from pageview, but mobile has no pageview equivalent. Explicit event with `{platform, cold_start}` simplifies MAU/DAU computation and lets us split iOS vs Android vs PWA cleanly. |
| `screen_viewed`          | navigation   | frontend (mobile) | Mobile has no `PageviewTracker` equivalent. Sparse tracker (throttled once-per-route-per-session) gives screen-level engagement parity with web without inflating volume.                                                                                                                                            |
| `feature_flag_evaluated` | feature_flag | frontend          | Non-experiment PostHog flags (kill switches, gradual rollouts) have no exposure signal. Throttled to once per `(flag, variant, session)` to avoid noise.                                                                                                                                                             |

## Remove — 1 event

| Event                         | Why                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding_goal_first_shown` | Duplicates `experiment_exposed { experiment_id: "goal_first", variant }`. The audit flagged this; the goal-first A/B fires both events for the same exposure, double-counting exposure in any funnel that filters by either name. Drop in favor of the canonical exposure event. Keep `onboarding_goal_first_picked` — it's the outcome, not the exposure. |

## Rename — 2 events

| Current Name                                                                   | Target Name              | Change                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module_settings_opened_from_module` (`MODULE_SETTINGS_OPENED` constant value) | `module_settings_opened` | Drop `_from_module` suffix; encode the source via property `{ source: module_header \| settings_root \| deeplink }`. Current name leaks implementation (only fires from module header). Properties-over-events. |
| `biometric_auth_failed_fallback_pin` (`BIOMETRIC_AUTH_FAILED_FALLBACK_PIN`)    | `biometric_auth_failed`  | Drop `_fallback_pin` suffix; encode fallback via property `{ fallback: pin \| none }`. Lets us track biometric failures that don't fall back without inventing a sibling event.                                 |

**Migration approach for renames:** dual-write for one release cycle. The old PostHog event name continues to fire alongside the new one; once dashboards switch, old fire is removed. Document in `.telemetry/changelog.md` (created by `product-tracking-instrument-new-feature` skill on first invocation).

## Keep as-is — 90 events

All other 90 events in [`current-state.yaml`](current-state.yaml) remain in the target plan with the same name, source, and payload shape. The target plan in [`tracking-plan.yaml`](tracking-plan.yaml) adds explicit property typing + enum constraints + required flags that today live as JSDoc comments in `analyticsEvents.ts` — no behavioral change at fire-sites.

The biggest "upgrade" for kept events: payload contracts move from comments to enforceable types (Phase 2 of implementation — see `product-tracking-generate-implementation-guide`).

## Identity & traits — 8 additions

Currently: `vibe`, `plan`, `locale`, `signup_date` (4 traits).

### Add — on-change / on-signup traits (4)

| Trait                                                       | Type                        | When set      | Why                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_internal`                                               | boolean                     | once (signup) | Gate. trackEvent wrapper skips capture when true unless debug flag set. Cleans up dashboards (current PostHog projects mix internal + real users). |
| `signup_provider`                                           | enum [apple, google, email] | once          | Currently emitted as event property on `signup_provider_selected`. Promote to trait for permanent segmentation.                                    |
| `pwa_installed`                                             | boolean                     | on_change     | Promotes a one-shot funnel event to a permanent trait so any cohort can filter "PWA users" without re-deriving from event history.                 |
| `app_lock_enabled` / `biometric_enabled` / `mono_connected` | boolean                     | on_change     | Promote security/integration completion to traits for power-user segmentation.                                                                     |

### Add — scheduled snapshot traits (5)

| Trait                 | Type         | Cadence | Source                                                                     |
| --------------------- | ------------ | ------- | -------------------------------------------------------------------------- |
| `streak_current`      | integer      | daily   | local `MAX(consecutive_days)` reconciled via CloudSync                     |
| `streak_longest`      | integer      | daily   | historical max                                                             |
| `expenses_count_30d`  | integer      | daily   | server query: `COUNT(expense) WHERE user_id=$1 AND created_at > now()-30d` |
| `monthly_active_days` | integer      | daily   | `DISTINCT day` from analytics_event table or PostHog mirror                |
| `modules_active`      | string_array | daily   | `hub_first_action_completed_v1:<module>` KV flags                          |

**Implementation gate:** snapshot sync requires either (a) a server-side analytics-aggregate cron job or (b) PostHog data warehouse for the COUNT/DISTINCT queries. Stub the traits as "designed but not populated" in PostHog until one is in place. Don't block design on it — implementation phase decides which.

## Observability coupling — 3 wiring fixes

### 1. Sentry ↔ PostHog user link (web + mobile)

**Current:** `Sentry.setUser` called only on server. Web + mobile rely on `beforeSend` id-only mapping. Sentry issues don't carry the same identifier shape as PostHog distinct_id, so cross-tool drilling (Sentry issue → "show me these users' funnel in PostHog") requires manual ID matching.

**Target:** Every place that calls `identifyPostHogUser(userId, traits)` must also call `Sentry.setUser({ id: userId })`. Bundle into a single wrapper:

```typescript
// apps/web/src/core/observability/identity.ts (NEW — proposed)
export function identifyUser(userId: string, traits: IdentifyTraits) {
  identifyPostHogUser(userId, traits);
  Sentry.setUser({ id: userId });
}

export function resetIdentity() {
  resetPostHog();
  Sentry.setUser(null);
}
```

Call sites: [`AuthContext.tsx`](../apps/web/src/core/auth/AuthContext.tsx), [`AnalyticsIdentityBridge.tsx`](../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx).

### 2. Mobile Sentry init missing

**Current:** `@sentry/react-native` declared in [`apps/mobile/package.json`](../apps/mobile/package.json) — no `sentry*` init file found under `apps/mobile/`. Mobile crashes don't reach Sentry.

**Target:** Add `apps/mobile/src/lib/observability/sentry.ts` with `Sentry.init({ dsn, environment, beforeSend: scrubPII })`; wire from `App` entry. Mirror web's sampling profile (see [`apps/web/src/core/observability/sentry.ts`](../apps/web/src/core/observability/sentry.ts)).

### 3. Duplicate mobile identity bridges

**Current:** Two bridges call `identifyPostHogUser` on `user.id` change:

- [`apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx`](../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx)
- [`apps/mobile/src/observability/IdentityBridge.tsx`](../apps/mobile/src/observability/IdentityBridge.tsx)

If both are mounted, every login triggers two identify calls (PostHog dedups on userId+traits, so silent, but a wasted round-trip + a code-smell). If only one is mounted, the other is dead code.

**Target:** Audit mount points, pick the canonical one (likely `features/analytics/AnalyticsIdentityBridge.tsx` — colocated with feature), delete the other. After consolidation, fold `Sentry.setUser` from item #1 into the canonical bridge.

## Cost / volume impact

- **Net new events:** +3 (`session_started`, `screen_viewed`, `feature_flag_evaluated`)
- **`session_started`:** ~1 event per app launch per user → for 1k DAU, ~1k events/day, ~30k/month. Low cost.
- **`screen_viewed`:** throttled (once per route per session) → ~5-10 events per session, ~10-20k/month for 1k DAU. Significant but justified (mobile parity).
- **`feature_flag_evaluated`:** throttled (once per flag per session) → bounded by flag count × sessions. For 10 active flags × 1k DAU → 10k/month. Low.

**Total estimated impact:** ~40-60k new events/month at 1k DAU baseline. PostHog free tier is 1M events/month. Comfortable headroom.

## Migration plan (suggested order)

1. **Phase 0 — naming lock** (no behavior change). Document the convention; add ESLint rule. (~1h)
2. **Phase 1 — observability coupling** (low-risk, high-value). Sentry↔PostHog wrapper, mobile Sentry init, dedup mobile identity bridge. (~1d, owner: `@Skords-01`)
3. **Phase 2 — renames** (dual-write release). `module_settings_opened_from_module` → `module_settings_opened`, `biometric_auth_failed_fallback_pin` → `biometric_auth_failed`. Old name fires alongside new for one release; dashboards switched; old removed. (~3d)
4. **Phase 3 — new events** (additive, low-risk). `session_started`, `screen_viewed`, `feature_flag_evaluated`. (~2d)
5. **Phase 4 — trait expansion** (on-change traits first: `is_internal`, `signup_provider`, `pwa_installed`, `*_enabled`, `mono_connected`). Snapshot traits deferred until aggregate cron / PostHog warehouse exists. (~3d)
6. **Phase 5 — payload type-enforcement** (out of scope for this delta; covered by `product-tracking-generate-implementation-guide`). Move JSDoc contracts to TypeScript discriminated unions so `trackEvent` becomes typed per event. (~1 week)
7. **Phase 6 — `onboarding_goal_first_shown` removal**. After dashboards confirmed not relying on it (grep `WF-` workflows + PostHog insights). (~0.5d)

## Next step

Run **`product-tracking-generate-implementation-guide`** to translate this plan into a PostHog-specific instrumentation guide (typed wrappers, dual-write removal strategy, snapshot job stubs, observability-coupling wrapper code).
