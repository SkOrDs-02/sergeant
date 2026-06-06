# 0017 — Hub Settings & Reports mount perf

> **Last validated:** 2026-06-06 by @Skords-01. **Next review:** 2026-08-27.
> **Status:** In progress — code-complete, RUM review pending (2026-06-01). Sprint 0 + Sprint 1 + Sprint 2 merged. Sprint 3 (Web Worker) explicitly skipped pending next 30-day RUM cut on `aggregateReport` P95 > 50 ms — re-opens as a discrete follow-up only if the threshold trips. See § Outcome / § Sprint 3 decision. **Sprint 1 done:** per-section lazy wiring landed on main — the 4 heavy module-scoped sections (`routine`/`fizruk`/`finyk`/`nutrition`) are `lazy()` + `<Suspense fallback={<SectionSkeleton minH={72}/>}>` in `HubSettingsPage.tsx` (`lazy?:{minH}` opt-in field). The 10 lightweight sections stay static **by design** (a per-chunk for a tiny section is net overhead). PR-1.2 cross-module defer landed for **Finyk only** ([#3102](https://github.com/Skords-01/Sergeant/pull/3102), `useInView` gate on the Monobank sync-state query + backfill poller) — it was the only section with off-screen _network_ cost; `fizruk`/`nutrition`/`routine` carry only local-state hydration (no `enabled:inView`-gatable queries), already mitigated by the lazy chunk. **Sprint 2 done (2026-05-24):** HubReports per-card lazy decomposition merged via [#3094](https://github.com/Skords-01/Sergeant/pull/3094) (squash on main as `5c98b41e`); remote branch `feat/0017-reports-per-card-lazy` auto-deleted. **Remaining:** Sprint 3 conditional on post-merge PostHog `aggregateReport` P95 metrics (cut window — only if > 50 ms); Finalize PR — bundle gate update + tech-debt watchlist drain + Outcome.
> **Agent-ready:** blocked
> **Priority:** P1 (Sprint 1 candidate after [0016](./archive/_0016-changelog-release-cut.md))
> **Owner:** `@Skords-01`
> **ETA:** ~3 weeks (3 sprints × 1 week each, includes observability baseline)
> **Sources:**
>
> - Live audit 2026-05-20 (Chrome DevTools MCP, prod `sergeant.vercel.app`)
> - User report 2026-05-20 ("дуже довго вантажить сторінки звіти та налаштування")
> - Follow-up з [PR #3043](https://github.com/Skords-01/Sergeant/pull/3043) — `prefetchHubNavigationPages()` без зовнішньої idle-обгортки (deployed 2026-05-19) — chunk download уже на 31 ms, але tab feels stuck for 10+ s

## TL;DR

Клік на bottom-nav таб «Звіти» / «Налаштування» **виглядає замороженим 10+ секунд** на cold-tab, попри те що chunks завантажуються миттєво (cache-hit, 31 ms). Проблема не в network — **JS execution + initial mount cost** усіх 14 Settings-секцій (та heavy aggregation у HubReports) виконується синхронно у одному render burst. Користувач бачить `<PageLoader />` skeleton, поки React не закінчить mount.

План — 5 PR-ів за 3 спринти, по одному рівню втручання:

1. **Observability baseline** — без цифр ми гадаємо, з цифрами знаємо що ламати.
2. **Per-section lazy** у HubSettingsPage — кожна Section стає окремим chunk-ом + Suspense зі стабільним skeleton-ом.
3. **Cross-module hook gating** — секції більше не bootstrap-лять модулі при mount.
4. **HubReports per-card lazy** — той самий патерн для Reports.
5. **Stretch: Web Worker aggregation** — якщо main-thread все одно блокується, винести `aggregateReport` + `generateInsights` у worker.

## Чому зараз

- **User-visible regression**: основні таби хабу — `?tab=reports` і `?tab=settings`. Користувачі тапають їх щодня. Зараз tab-switch — це найгірший Touch-Response-Time у застосунку (>10 s на cold cache).
- **Prefetch вже зроблено** ([PR #3043](https://github.com/Skords-01/Sergeant/pull/3043)) — chunks завантажуються миттєво. Подальша економія з цього напрямку = 0 ms. Залишаються тільки два важеля: **mount cost** і **render cost**.
- **Mobile users**: Sergeant — PWA-first. На середньому Android (Moto G Power, Snapdragon 680) JS execution ~3× повільніший за desktop. Якщо desktop 10 s, mobile 25-30 s — це fail-state.
- **Bundle gate ≤820 KB** ([`scripts/check-bundle-size.mjs`](../../scripts/check-bundle-size.mjs)) тримається тільки тому, що ми тримаємо `HubSettingsPage` як один chunk. Якщо ділити на 14 chunk-ів — треба переглянути `manualChunks`.
- **Не блокує** [0006-frontend-routing-and-code-split](./0006-frontend-routing-and-code-split.md), але **довершує** його логіку: 0006 розділив на per-route chunks, 0017 — на per-section.

## Скоуп

**In:**

1. RUM-instrumentation tab-switch latency у `apps/web/src/core/app/HubMainContent.tsx`:
   - `performance.mark` на click → `performance.measure` коли panel children render-яться без `aria-busy`
   - PostHog event `hub_tab_switch_perf` { `tab`, `ttiMs`, `longTaskMs`, `longTaskCount`, `cacheHit` }
   - `PerformanceObserver({ type: "longtask" })` — sample 100% перші 30 днів, потім 10%.
2. Per-section `React.lazy()` у `HubSettingsPage.tsx`:
   - Кожна з 14 секцій (`DashboardSection`, `GeneralSection`, `PlanSection`, `NotificationsSection`, `AIDigestSection`, `AssistantCatalogueSection`, `RoutineSection`, `FizrukSection`, `FinykSection`, `NutritionSection`, `PrivacySection`, `PWASection`, `DataExportSection`, `ExperimentalSection`) — окремий dynamic import.
   - Spec: `const FinykSection = lazy(() => import("../settings/FinykSection"))`.
   - Кожна обгорнута у `<Suspense fallback={<SectionSkeleton minH={…} />}>`. `minH` per-section задається статично щоб уникнути CLS.
   - Active group рендерить тільки свої секції (вже так), але тепер вони не блокують одна одну — кожна стримиться окремо.
3. **Cross-module bootstrap deferral у Settings sections**:
   - `FinykSection` зараз імпортує `useFinykStorage` + `useMonoBackfillProgress` + `usePlan` на module-load. Це тягне частину Finyk-модуля у Settings chunk.
   - План: винести queries за `enabled: visible` flag, динамічно `import()` heavy утиліти всередині handler-ів (`onConnectMono`, `onPurgeCache`).
   - Аналогічно для `NutritionSection`, `RoutineSection`, `FizrukSection`.
4. HubReports decomposition:
   - Розрізати on render-tree: окремі lazy-cards (`ExpensesCard`, `FitnessCard`, `NutritionCard`, `RoutineCard`, `WeeklyDigestCard` — уже існує).
   - Кожен card сам читає свій localStorage shard + aggregates через свій `useMemo`. Перший paint показує 5 skeleton-ів, кожна картка fills незалежно.
5. **Bundle-budget update**: оновити `LIMIT` у `scripts/check-bundle-size.mjs` (очікувано: -50 KB main chunk, +14 невеликих chunks по 5-15 KB кожен).
6. (Sprint 3 stretch) Винести `aggregateReport` + `generateInsights` у Web Worker:
   - `apps/web/src/core/lib/reportsWorker.ts` — Comlink-wrapped worker.
   - Main thread postMessage payload із localStorage shards. Worker повертає `ReportData`.
   - Gating: вмикається тільки якщо `aggregateReport` taking >50 ms на P95 (з PostHog metrics).

**Out:**

- Refactor `HubSettingsPage.tsx` структурно (`GROUPS` + `useMemo(sections)` + Tabs) — це стабільна форма, не міняємо. Тільки code-split.
- Server-side prefetch (SSR) — Sergeant SPA-only, поза scope.
- IndexedDB-кешування report-aggregates — окрема ініціатива на storage roadmap.
- Service-Worker route-prefetch на push — окремий PR після `route-loaders` у 0006.

## Метрики успіху

| Метрика                                                                        | Baseline (2026-05-20 prod, mid-range mobile estimate) | Sprint 1 target | Sprint 2 target | Sprint 3 target |
| ------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------- | --------------- | --------------- |
| `hub_tab_switch_perf.ttiMs` P50 — Settings                                     | ~10 000 ms (desktop), ~25 000 ms (mobile est.)        | ≤ 5 000         | ≤ 2 000         | ≤ 1 000         |
| `hub_tab_switch_perf.ttiMs` P95 — Settings                                     | ~14 000 ms                                            | ≤ 7 000         | ≤ 3 000         | ≤ 1 500         |
| `hub_tab_switch_perf.ttiMs` P50 — Reports                                      | ~8 000 ms                                             | ≤ 4 000         | ≤ 1 500         | ≤ 800           |
| longtask count per tab-switch (P95)                                            | unknown                                               | measured        | ≤ 5             | ≤ 2             |
| `aggregateReport` duration (P95)                                               | unknown                                               | measured        | ≤ 50 ms         | ≤ 16 ms         |
| Main chunk gzip                                                                | ~200 KB                                               | -50 KB          | -50 KB          | -50 KB          |
| `pnpm exec tsc` clean після per-section lazy                                   | ✅                                                    | ✅              | ✅              | ✅              |
| `Suspense fallback` flash <100 ms (немає flicker через `SuspenseWithMinDelay`) | n/a                                                   | ✅              | ✅              | ✅              |

## План змін

### Sprint 0 — Observability baseline (1 PR) — **shipped 2026-05-20**

**`feat/0017-hub-tab-perf-rum`** — реалізовано:

- [`apps/web/src/core/lib/longTaskMonitor.ts`](../../apps/web/src/core/lib/longTaskMonitor.ts) (new): глобальний `PerformanceObserver({ type: "longtask", buffered: true })` + ring-buffer на 200 entries + `getLongTasksSince(startTime)` API.
- [`apps/web/src/core/lib/hubPerf.ts`](../../apps/web/src/core/lib/hubPerf.ts) (new): `beginHubTabSwitch(tab)` + `endHubTabSwitch(tab)` шлють `HUB_TAB_SWITCH_PERF` через `trackEvent` → PostHog.
- [`apps/web/src/core/app/HubMainContent.tsx`](../../apps/web/src/core/app/HubMainContent.tsx): `useEffect` на `hubView` change → `beginHubTabSwitch`; `<TabReadyProbe tab="…" />` всередині кожного `<Suspense>` boundary → `endHubTabSwitch` після 2×rAF (post-paint).
- [`apps/web/src/main.tsx`](../../apps/web/src/main.tsx): `initLongTaskMonitor()` в тому ж idle slot що `initPostHog()`.
- [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts): `ANALYTICS_EVENTS.HUB_TAB_SWITCH_PERF`.
- Tests: [`longTaskMonitor.test.ts`](../../apps/web/src/core/lib/longTaskMonitor.test.ts) (idempotent init, buffered:true, ring-buffer bound, Safari fallback), [`hubPerf.test.ts`](../../apps/web/src/core/lib/hubPerf.test.ts) (begin/end flow, longtask aggregation, cacheHit detection, edge cases).
- Baseline runbook: [`docs/observability/hub-perf-baseline.md`](../observability/hub-perf-baseline.md) — PostHog dashboard spec + target таблиця per Sprint + carry-over пункти.

**Acceptance**: Sampling 100% перші 30 днів (за runbook-ом), потім 10%. Перша перевірка baseline-таблиці — 2026-05-27.

### Sprint 1 — Per-section lazy у Settings (2 PR-и)

**PR-1.1 `feat/0017-settings-section-skeleton-primitive`**:

- `apps/web/src/core/settings/SettingsPrimitives.tsx`: новий `SectionSkeleton` component — стабільний height-placeholder з shimmer.
- `apps/web/src/core/hub/HubSettingsPage.tsx`: міняємо `render: () => <FinykSection />` на `render: () => <Suspense fallback={<SectionSkeleton id="finyk" />}><FinykSectionLazy /></Suspense>` для кожної з 14 секцій.
- Per-section `lazy(() => import("./settings/<Name>Section"))` — імпорти на top of file.
- Skeleton heights калібровані з прод screenshots: Dashboard 180px, Plan 240px, Finyk 320px тощо.
- Bundle delta вимірюється у PR description.

**PR-1.2 `feat/0017-settings-cross-module-defer`** — **shipped (Finyk only), [#3102](https://github.com/Skords-01/Sergeant/pull/3102)**:

- `FinykSection`: `const [sectionRef, inView] = useInView()` на корені секції; `monoSyncState` query + `useMonoBackfillProgress` поллер гейтяться на `enabled: inView` — стартують лише коли секція у viewport.
- **Re-scope 2026-05-29:** план «аналогічно `NutritionSection`/`RoutineSection`/`FizrukSection`» **не застосовний** — Finyk був єдиною секцією з off-screen _network_ cost (Monobank sync-state + 2s backfill poller). Інші три несуть лише локальну state-гідрацію без gatable queries: `FizrukSection` = `useRestSettings` (локальні rest-timer кнопки), `NutritionSection` = локальний pantry-state + `useMemo`, `RoutineSection` = `useRoutineState` (stateful hook, чий вивід керує рендером — hooks-rules забороняють умовний виклик, `enabled:inView` не підходить). Їхній mount-cost уже знятий lazy-chunk + Suspense з PR-1.1; справжній додатковий defer тут вимагав би lazy-render реструктуризації (окрема, ризикованіша робота — не в скоупі Sprint 1).
- **Перевірка (Finyk):** відкриваємо Settings, скролимо вниз — у DevTools Network нема `mono_webhook_state` запиту до першого скролу до Finyk-секції.

### Sprint 2 — HubReports per-card lazy (1 PR)

**PR-2 `feat/0017-reports-per-card-lazy`**:

- `apps/web/src/core/hub/HubReports.tsx` — розрізати на `ExpensesCard`, `FitnessCard`, `NutritionCard`, `RoutineCard` (5 файлів). Кожна — окремий lazy import.
- `WeeklyDigestCard` уже окремий компонент — лишити без змін, але обгорнути у Suspense якщо ще не обгорнутий.
- Кожна картка читає свій shard з storage + aggregates через свій `useMemo`. Aggregation залишається синхронно у `useMemo` (Sprint 3 виносимо у worker, якщо метрики покажуть).
- `hubReports.aggregation.ts` — split на per-domain (`aggregateFinyk`, `aggregateFizruk`, `aggregateNutrition`, `aggregateRoutine`), уже близько до цього у поточному коді.
- Skeleton fallback per-card: 220px height, 1 shimmer line + 1 chart-placeholder rect.

### Sprint 3 — Web Worker for aggregation (stretch, conditional)

**PR-3 `feat/0017-reports-worker-aggregate`** — тільки якщо Sprint 2 метрики показують `aggregateReport` P95 > 50 ms.

- `apps/web/src/core/lib/reportsWorker.ts` (new) + `apps/web/vite.config.js` worker entry.
- Comlink-wrapped exposing `aggregate(period, offset, shards)`.
- Cards підписуються на worker.aggregate(...) через `useQuery({ queryFn: () => worker.aggregate(...) })` — RQ-cache по `[period, offset, shardsVersion]`.
- Fallback: якщо `Worker` undefined (Safari ≤ 14 PWA standalone) → main-thread inline aggregate.

### Finalize (включається у PR-3 або окремий PR-4 якщо Sprint 3 skipped)

- Bundle budget update: `scripts/check-bundle-size.mjs` `LIMIT` зменшити до нового main + додати окремий per-chunk gate (≤ 25 KB gzip кожен section/card chunk).
- `docs/tech-debt/frontend.md` `LARGE_FILES` table — `HubReports.tsx` (608 → ~120) і `HubSettingsPage.tsx` (387 → ~150) знімаються з watchlist.
- Outcome-секція у цьому файлі з фінальними метриками.
- Status → Done, файл перейменовується у `_0017-hub-tabs-mount-perf.md`.

### Sprint 3 decision (2026-06-01)

**Skipped pending metrics review.** Sprint 3 (Web Worker for aggregation) was conditional on post-Sprint-2 PostHog `aggregateReport` P95 > 50 ms. Cut window for the decision opens after a 30-day rolling window on `hub_tab_switch_perf`. Recorded here as a Finalize decision so the initiative can mark code-complete and roll forward; if the next monthly RUM review shows P95 still > 50 ms, Sprint 3 reopens as a discrete follow-up against this initiative. Owner confirms cut at the next standup.

### Outcome (2026-06-01, code-complete; 2026-06-02 tech-debt watchlist drained)

- **Sprint 0 / 1 / 2 PRs:** all merged to main ([#3094](https://github.com/Skords-01/Sergeant/pull/3094) Sprint 2, [#3102](https://github.com/Skords-01/Sergeant/pull/3102) Finyk cross-module defer).
- **Sprint 3:** conditional, skipped pending RUM review (see above).
- **Tech-debt watchlist drained (2026-06-02):** `docs/tech-debt/frontend.md §2.5` moved to `~~Hub Settings & Reports tab cold-mount cost~~ — Виконано` with a closing note pointing back to this initiative for RUM-target tracking. The engineering work is shipped; the §2.5 entry no longer reflects unfinished mitigation.
- **Bundle gate / Outcome with concrete RUM numbers** still pending — both wait on the next 30-day RUM cut. Listed in `### Carry-over → successor` below so the agenda survives the file's eventual archival.
- **Status transition:** "In progress — code-complete, RUM review pending". Once Sprint 3 decision is signed off and RUM metrics are pinned (target: next monthly review), the bundle gate update lands and the file is archived as `_0017-hub-tabs-mount-perf.md`.

### Carry-over → successor

- [ ] **2026-07-02 (≈ 30-day RUM cut):** confirm `hub_tab_switch_perf` Settings P50 ≤ 2 s + P95 ≤ 3 s, Reports P50 ≤ 1.5 s + P95 ≤ 3 s, long-task P95 ≤ 5. Owner pins numbers in this Outcome.
- [ ] **2026-07-02 (≈ 30-day RUM cut):** confirm `aggregateReport` P95 ≤ 50 ms; if > 50 ms, re-open Sprint 3 (Web Worker for aggregate) as a discrete follow-up against this initiative.
- [x] **ASSESSED & DEFERRED (2026-06-06):** tighten `scripts/check-bundle-size.mjs` `index-` budget to ~30 KB — **not actionable at current reality.** See § Bundle-size findings 2026-06-06 below. The script is informational; the 80 KB budget line is left as-is rather than set to a false target.
- [ ] **After RUM targets pinned:** rename file to `_0017-hub-tabs-mount-perf.md` (Status → Done) per [`docs/initiatives/README.md` Completed-prefix](./README.md#completed-prefix--nnnn-) and update the active-initiative row in `README.md`.

### Bundle-size findings 2026-06-06

**Context:** the Carry-over item above called for tightening the `index-` budget in `scripts/check-bundle-size.mjs` once a stable post-Sprint-1/2 baseline was available. CI measurement on main (post-baseline-fix, "Vite build smoke") provided that baseline. Active index-dieting was also explored via two PRs. Results recorded here for the record.

**Measured baseline — web entry `index-*.js`:**

- Raw: **679.9 KB**
- Gzip: **193.99 KB**

The initiative assumed "~30 KB index after Sprint 1+2 split". That assumption was wrong. The real index is ~194 KB gzip — approximately 2.4× over the script's own 80 KB `index-` budget line. `scripts/check-bundle-size.mjs` estimates gzip as `raw × ratio` and is effectively informational; it is **not a blocking CI gate**.

**Lever results (CI-measured):**

| Lever | PR | Status | Index delta |
|---|---|---|---|
| WhatsNewModal lazy | [#3399](https://github.com/Skords-01/Sergeant/pull/3399) | CLOSED | **0 KB** — no measurable win |
| CommandPalette + KeyboardShortcutsModal structural UI extract | [#3403](https://github.com/Skords-01/Sergeant/pull/3403) | OPEN | index 193.99 → **191.64 KB gzip (−2.35 KB)**; new lazy chunks: CommandPaletteUI 2.61 KB gzip, KeyboardShortcutsModalUI 1.56 KB gzip |

**Diagnosis:** the 194 KB index is dominated by `uk.ts` (47 KB raw, eager — every eager UI surface imports the full locale catalog) plus the eager hub app-shell. Small overlay/modal components are not the bottleneck. Static import-analysis overestimated overlay levers by ~3–4×.

**Remaining levers and disposition:**

- **`uk.ts` locale split** — ~8–12 KB gzip potential, but requires i18n lazy-loading infrastructure (split catalog + per-group loader + Suspense) and risks a flash of untranslated strings (risk: MED-HIGH). Deferred — poor ROI/risk ratio; needs a human-ratified "first-paint-critical keys" curation before implementation.
- **Route-level lazy** — DEAD END. Blocked by the React Router 7 location-context bug tracked in initiative [0006](./0006-frontend-routing-and-code-split.md) Phase 5.
- **Real further reduction** = fix the RR7 blocker (separate initiative) or implement the i18n refactor above.

**Net outcome:** bundle-shrink push delivered **~2.35 KB gzip** (PR #3403). Active index-dieting stopped here as low-ROI. 191.64 KB initial JS accepted for now.

**Script action:** `scripts/check-bundle-size.mjs` `index-` budget left at its current value (80 KB). Tightening it to 30 KB would encode a false target given the measured reality; the script remains informational until the i18n or RR7 work lands and the index meaningfully moves.

---

## Критерії DONE

- [x] Sprint 0 PR merged, PostHog `hub_tab_switch_perf` event працює, baseline зафіксований у `docs/observability/hub-perf-baseline.md`.
- [x] Sprint 1 PR-и merged: 14 секцій — окремі chunk-и, кожна обгорнута у Suspense з SectionSkeleton, cross-module queries gated на `useInView`.
- [x] Sprint 2 PR merged: HubReports — 5 lazy-cards. ([#3094](https://github.com/Skords-01/Sergeant/pull/3094), 2026-05-24, squash як `5c98b41e`)
- [ ] Sprint 3 PR merged (умовно — тільки якщо метрики > target Sprint 2).
- [ ] Settings P50 tab-switch ≤ 2 s, P95 ≤ 3 s на mid-range mobile (Moto G Power-class device у Lighthouse mobile profile).
- [ ] Reports P50 tab-switch ≤ 1.5 s, P95 ≤ 3 s.
- [ ] Long-task count P95 ≤ 5 per tab-switch.
- [ ] Bundle gate updated, main chunk -50 KB.
- [x] [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md) — entry для Settings/Reports mount cost закритий (§2.5 переведено у `~~Виконано~~` 2026-06-02; engineering work shipped, RUM-validation продовжується в цій ініціативі).

## Ризики та митиґація

| Ризик                                                                                                                               | Мітигація                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-section lazy дає 14 додаткових network requests на швидкому WiFi — навіть кешованих це HTTP/2 push round-trips                  | Vite-build використовує HTTP/2 multiplexing. Усі chunks завантажуються паралельно з `<link rel="modulepreload">`. Якщо overhead вимірний — agregate невеликі секції у 2-3 group-chunks через `manualChunks`.           |
| Suspense flash flicker (skeleton показується <100 ms, тоді швидко зникає — виглядає як glitch)                                      | `SuspenseWithMinDelay` уже існує у `apps/web/src/shared/components/ui/`. Reuse-имо тут з `minDelayMs=200` — або skeleton не показується взагалі (синхронна resolution), або стоїть мінімум 200 ms для smooth перехода. |
| `useInView` gate спричиняє «секція пустувала, я проскролив — зараз тільки query стартувала» — фліп з skeleton-у на дані з затримкою | IntersectionObserver `rootMargin: 400px 0px` — query стартує до того як секція реально у viewport. На mobile це buffer ~1 screen.                                                                                      |
| Cross-module hook gating ламає feature: FinykSection без bootstrap-ed Mono state не показує правильні toggle-и                      | Перед PR-1.2 — Playwright e2e тест «scroll to Finyk section in Settings → Mono toggle shows correct state». Регресія блокує PR.                                                                                        |
| Worker (Sprint 3) на Safari iOS PWA standalone може не підтримувати OffscreenCanvas / module workers                                | Fallback на inline aggregate (`navigator.userAgent`-detect не використовуємо — feature-detect `typeof Worker !== "undefined"`). Тест на iOS Safari PWA standalone в e2e suite.                                         |
| Bundle gate fail після split — main chunk -50 KB, але сума всіх chunks +20 KB (немає shared dependencies)                           | Аналіз `pnpm build:analyze` перед PR-1.1. Якщо потрібно — додати `manualChunks: { settings: ['./settings/'] }` для shared section-utilities (наприклад `SettingsPrimitives`).                                          |
| RUM observer (Sprint 0) сам тригерить longtask (overhead 1-2 ms per measure)                                                        | `requestIdleCallback` для PostHog flush. Sampling 10% після першого місяця.                                                                                                                                            |

## Власник, ревʼюери

**Owner:** `@Skords-01`
**Реквайрд reviewers:** перформанс-aware — `@Skords-01` + 1 (Claude може брати на ревʼю).
**Acceptance review:** після кожного Sprint — синк з founder на 15 хв (PostHog dashboard live).

## Зв'язки

- Уточнює: [0006-frontend-routing-and-code-split](./0006-frontend-routing-and-code-split.md) — per-route split вже зроблений, тут per-section split всередині route.
- Залежить від: [0013-module-decomposition-round-2](./archive/_0013-module-decomposition-round-2.md) — Sprint 1 декомпозиція дала чисті imports у sections, без неї cross-module bootstrap було б ще гірше.
- Може вплинути на: [`scripts/check-bundle-size.mjs`](../../scripts/check-bundle-size.mjs) — gate потребує оновлення.
- Породжує: [`docs/observability/hub-perf-baseline.md`](../observability/) (new в Sprint 0).
