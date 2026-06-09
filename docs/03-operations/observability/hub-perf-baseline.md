# Hub tabs perf — RUM baseline

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active — Sprint 0 instrumentation merged 2026-05-20, baseline data collection in progress, dashboard manifest committed 2026-05-25 (ready for import on 2026-05-27 baseline pull).

Цей runbook описує RUM-інструмент, який запровадив Sprint 0 [Initiative 0017 — Hub Settings & Reports mount perf](../../90-work/initiatives/0017-hub-tabs-mount-perf.md). Сам файл — **жива сторінка**: коли назбирається ≥ 1 тиждень даних з прода, заповнюємо таблицю «Baseline», і кожен наступний Sprint оновлює свій рядок.

## Контракт події

`HUB_TAB_SWITCH_PERF` (canonical name у [`packages/shared/src/lib/analyticsEvents.ts`](../../../packages/shared/src/lib/analyticsEvents.ts)) шлеться **один раз** на tab-switch, коли Suspense boundary активного табу резолвиться і панель приклеєна після paint:

```json
{
  "tab": "reports" | "settings" | "profile",
  "ttiMs": 0,
  "longTaskMs": 0,
  "longTaskCount": 0,
  "cacheHit": false
}
```

- **`tab`**: який таб запросив юзер. `dashboard` не вимірюється (eager-mount, нема Suspense).
- **`ttiMs`**: ms від commit-у `hubView` зміни у [`apps/web/src/core/app/HubMainContent.tsx`](../../../apps/web/src/core/app/HubMainContent.tsx) до коли `<TabReadyProbe>` всередині Suspense bound успішно змонтувався і пройшов 2× `requestAnimationFrame` (post-paint).
- **`longTaskMs`**: сумарна тривалість `longtask` PerformanceEntry, які стрілили між begin та end. Розрахунок — [`getLongTasksSince(startedAt)`](../../../apps/web/src/core/lib/longTaskMonitor.ts) у [`hubPerf.ts`](../../../apps/web/src/core/lib/hubPerf.ts).
- **`longTaskCount`**: кількість тих самих entries.
- **`cacheHit`**: `true` коли chunk вже був у route-prefetch cache на момент `beginHubTabSwitch` — separated cold-from-cache vs cold-from-network.

## Архітектура інструментації

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/web/src/main.tsx                                            │
│   scheduleInit() → idle slot → initLongTaskMonitor()             │
│     ↓                                                            │
│ apps/web/src/core/lib/longTaskMonitor.ts                         │
│   • Global PerformanceObserver({ type: "longtask", buffered })   │
│   • Ring-buffer 200 entries, getLongTasksSince(ts) API           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ apps/web/src/core/app/HubMainContent.tsx                         │
│                                                                  │
│   useEffect on hubView change                                    │
│     ↓ (reports | settings | profile)                             │
│   beginHubTabSwitch(tab)                                         │
│                                                                  │
│   <SuspenseWithMinDelay fallback={<PageLoader />}>               │
│     <HubReports />          ← Lazy chunk                         │
│     <TabReadyProbe tab="reports" />                              │
│   </SuspenseWithMinDelay>                                        │
│     ↓ Suspense resolves → probe mounts                           │
│   useEffect → rAF × 2 → endHubTabSwitch(tab)                     │
│     ↓                                                            │
│   trackEvent("hub_tab_switch_perf", { … })                       │
│     ↓                                                            │
│   PostHog (lazy SDK) + localStorage ring-buffer fallback         │
└──────────────────────────────────────────────────────────────────┘
```

Файли реалізації:

- [`apps/web/src/core/lib/longTaskMonitor.ts`](../../../apps/web/src/core/lib/longTaskMonitor.ts) — глобальний longtask observer.
- [`apps/web/src/core/lib/hubPerf.ts`](../../../apps/web/src/core/lib/hubPerf.ts) — `beginHubTabSwitch` / `endHubTabSwitch`.
- [`apps/web/src/core/app/HubMainContent.tsx`](../../../apps/web/src/core/app/HubMainContent.tsx) — wiring + `<TabReadyProbe>`.
- [`apps/web/src/main.tsx`](../../../apps/web/src/main.tsx) — init monitor в idle slot після hydration.

## PostHog dashboard

Жоден існуючий дашборд не покриває tab-switch RUM. Створюємо новий — «Hub tab perf»:

1. **Insight 1 — P50/P95 ttiMs per tab**:
   - Type: Trends, Aggregation: 50th/95th percentile of `ttiMs`.
   - Breakdown: `tab`.
   - Filter: `event = HUB_TAB_SWITCH_PERF`.
2. **Insight 2 — Longtask burden**:
   - Type: Trends, Aggregation: average of `longTaskMs`.
   - Breakdown: `tab`.
3. **Insight 3 — Cache-hit ratio**:
   - Type: Trends, Aggregation: % of events with `cacheHit = true`.
   - Per tab. Низький cache-hit означає що `prefetchHubNavigationPages` не встигає завчасно.
4. **Insight 4 — Histogram of ttiMs**:
   - Buckets: 0-500, 500-1000, 1000-2000, 2000-5000, 5000-10000, 10000+.
   - Дає швидкий sense чи бачимо bimodal distribution (cache-hit vs miss).
5. **Insight 5 — Longtask count P95 per tab** — health check для Sprint 1+ optimisations.

Portable manifest — [`ops/posthog/dashboards/hub-tab-perf.json`](../../../ops/posthog/dashboards/hub-tab-perf.json) (5 panels: TTI percentiles, longtask burden, cache-hit ratio, TTI histogram, 28-day TTI trend; 3 alerts; см. контракт у [`ops/posthog/README.md`](../../../ops/posthog/README.md)). Імпорт у PostHog UI — per «Імпорт у PostHog» в README; кожен panel'у `panel.query.query` paste-иться у SQL editor, save as Insight, pin to Dashboards → «Hub tab perf».

## Baseline pull procedure (target: 2026-05-27)

Sprint 0 merged 2026-05-20 з 100% sampling. На 2026-05-27 буде ≥ 7 днів prod-даних — достатньо щоб закрити TBD-комірки нижче. Покрокова процедура:

1. **Імпортувати дашборд у PostHog UI.** Без створеного дашборду немає звідки витягнути числа. Manifest — [`ops/posthog/dashboards/hub-tab-perf.json`](../../../ops/posthog/dashboards/hub-tab-perf.json). Procedure — у [`ops/posthog/README.md`](../../../ops/posthog/README.md) §«Імпорт у PostHog» (для кожного `panel.query.query` — paste у PostHog SQL editor → save as Insight → pin to «Hub tab perf» dashboard).
2. **Запустити кожен з 5 query за `last 14 days` window.** Цифри з `tti-percentiles` + `longtask-burden` дають усі рядки baseline-таблиці нижче.
3. **Заповнити таблицю.** TBD → реальні числа. Округлення до сотень мілісекунд (нікому не важлива точність ±50 ms на baseline).
4. **Зробити commit** з оновленою таблицею + bump `Last validated:` зверху runbook-у. Sprint 1 PR-и далі порівнюватимуть свої числа з цією baseline-комою.
5. **Не вимикати 100% sampling** — поточний rate тримати до моменту коли Sprint 2 PR-и landed (потрібна щільність даних для validation).

## Baseline таблиця

Заповнюємо за процедурою вище. На момент committed runbook (2026-05-25) ще TBD.

| Метрика             | Reports | Settings | Profile |
| ------------------- | ------- | -------- | ------- |
| P50 `ttiMs`         | TBD     | TBD      | TBD     |
| P95 `ttiMs`         | TBD     | TBD      | TBD     |
| P50 `longTaskMs`    | TBD     | TBD      | TBD     |
| P95 `longTaskMs`    | TBD     | TBD      | TBD     |
| P50 `longTaskCount` | TBD     | TBD      | TBD     |
| P95 `longTaskCount` | TBD     | TBD      | TBD     |
| % cacheHit          | TBD     | TBD      | TBD     |

> Очікувані прев-baseline цифри (з live audit 2026-05-20 на одному середовищі): Reports `ttiMs` P50 ≈ 8 000, Settings P50 ≈ 10 000, Profile ≈ невідомо. Реальні цифри з PostHog можуть бути нижчими — audit стрелив у пік навантаження, а тут уже cache-hit стане частим.

## Target після оптимізації (per Initiative 0017)

| Метрика              | Sprint 1 ціль | Sprint 2 ціль | Sprint 3 ціль |
| -------------------- | ------------- | ------------- | ------------- |
| Settings P50 `ttiMs` | ≤ 5 000       | ≤ 2 000       | ≤ 1 000       |
| Settings P95 `ttiMs` | ≤ 7 000       | ≤ 3 000       | ≤ 1 500       |
| Reports P50 `ttiMs`  | ≤ 4 000       | ≤ 1 500       | ≤ 800         |
| `longTaskCount` P95  | ≤ 10          | ≤ 5           | ≤ 2           |

## Sampling

- **Перші 30 днів після merge**: 100% sampling — нам потрібна максимальна щільність даних щоб піймати hard-to-reproduce жлоби (slow-3G, low-end mobile, multi-tab race).
- **Після 30 днів**: 10% — стандартний RUM rate. Гейт прописати у [`apps/web/src/core/lib/hubPerf.ts`](../../../apps/web/src/core/lib/hubPerf.ts) через `Math.random() < SAMPLE_RATE`, перемикач — feature flag `hub_perf_rum_sample_rate`.
- **Завжди-on**: dev mode (`import.meta.env.DEV`) — щоб локально бачити events без зайвих кроків.

## Що далі (carry-over)

- [ ] **2026-05-27:** перший pull baseline-таблиці з PostHog (≥ 7 днів даних). Procedure — §«Baseline pull procedure» вище. Dashboard manifest готовий — [`ops/posthog/dashboards/hub-tab-perf.json`](../../../ops/posthog/dashboards/hub-tab-perf.json).
- [ ] Sprint 1 PR-1.1 — per-section lazy у Settings; перевірити що `ttiMs` падає для `tab=settings`.
- [ ] Sprint 1 PR-1.2 — `useInView` gate на cross-module queries; `longTaskCount` P95 має впасти.
- [ ] Sprint 2 PR-2 — HubReports per-card lazy; `ttiMs` для `tab=reports` під target.
- [ ] Якщо Sprint 2 метрики все ще миснуть target — стартувати Sprint 3 stretch (Web Worker для aggregate).
- [ ] Після Sprint 3 (або раніше якщо target досягнуто): зменшити sampling до 10%; оновити це посилання у файлі.

## Зв'язки

- Initiative: [0017 — Hub Settings & Reports mount perf](../../90-work/initiatives/0017-hub-tabs-mount-perf.md).
- Tech debt entry: [`docs/90-work/tech-debt/frontend.md` §2.5](../../90-work/tech-debt/frontend.md).
- Сусідні runbook-и observability: [`dashboards.md`](./dashboards.md), [`posthog-founder-pulse.md`](./posthog-founder-pulse.md).
