# Page Audit — Hub Dashboard, Modules Grid & App shell

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: <https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40>)
> **Pages in scope:** Hub Dashboard container (`HubDashboard.tsx`), App shell (`App.tsx`, `app/router.tsx`), error surfaces (`ErrorBoundary.tsx`, `ModuleErrorBoundary.tsx`), Hub composition (`HubHeroBlock`, `HubInsightsBlock`, `HubInsightsPanel`, `HubReports`, `HubModulesGrid`, `ValueProgressBar`, `CrossModulePreview`), Hub state hooks (`useHubDashboardState`, `useFinykHubPreview`), Hub aggregation (`hubReports.aggregation`), Hub Bento dashboard (`dashboard/BentoCard`, `dashboard/dashboardCards`, `dashboard/moduleConfigs`, `dashboard/adaptiveSort`, `dashboard/dashboardStore`, `dashboard/useMondayAutoDigest`), shared Hub types (`hub.types.ts`), route prefetch (`lib/useRoutePrefetch`).

## Summary

Аудит пройшов по 22 файлах у scope (Hub Dashboard контейнер, App shell, lazy-router, error boundaries, Bento-grid, аdaptive-sort engine, KPI-aggregation, route prefetch). Загальна якість шару — **висока**: lazy-by-default policy (Hard Rule перш за все на критичних маршрутах) дотримана, RQ keys йдуть через factories, focus-visible і touch-target утиліти застосовані, інваріант "kopiykas as number" не порушений. Натомість знайдено **24 реальні проблеми**, найбільш суттєві з яких — (а) `HubReports.tsx` обходить дизайн-токени для бар-кольорів і обходить `STORAGE_KEYS` registry, (б) bar-chart колонки не мають screen-reader name-у, (в) `useReportData` не реагує на live-зміни у localStorage у тому ж табі (stale chart), (г) `prev/next period` кнопки нижче 44×44 (WCAG 2.5.5), (д) `adaptiveSort.ts` тримає `setInterval(60_000)` навіть коли adaptive вимкнено. По багу-хантингу: `ModuleErrorBoundary` шоу-кейсить `error.message` без редакції, `useMondayAutoDigest` може двічі стрельнути на нічному переході неділя→понеділок.

- Critical: 0
- High: 4
- Medium: 14
- Low: 6

## Findings

### F1 — `HubReports` дублює хардкоднуті ключі замість `STORAGE_KEYS` [severity: high] [perspective: rule]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L24–L60 (раніше згаданий блок `useReportData`)

**Description.**
Hook `useReportData` читає інпути напряму з `localStorage` чотирьох модулів через **рядкові константи** замість централізованого реєстру з `@sergeant/shared`:

```typescript
// HubReports.tsx
const rawFizrukWorkouts = safeReadStringLS("fizruk_workouts_v1");
const rawFinykCache     = safeReadLS("finyk_tx_cache", null);
const rawRoutineState   = safeReadLS("hub_routine_v1", null);
const rawNutritionLog   = safeReadLS("nutrition_log_v1", {});
```

Це обходить `packages/shared/src/lib/storageKeys.ts` — `STORAGE_KEYS.FIZRUK_WORKOUTS`, `STORAGE_KEYS.FINYK_TX_CACHE`, `STORAGE_KEYS.HUB_ROUTINE`, `STORAGE_KEYS.NUTRITION_LOG`. Реєстр містить додатковий метадані (deprecated-маркери, dual-write coverage), тож ключі тут — це source-of-truth для міграцій. Окрема дуплікація `TX_CACHE_LS_KEY = "finyk_tx_cache"` живе також у `useFinykHubPreview.ts:20`.

**Why it matters.**
Якщо колись пере-неймимо `nutrition_log_v1 → nutrition_log_v2` (а `STORAGE_KEYS.NUTRITION_LOG` уже **deprecated** і помічений для розіб'ємо до SQLite), `HubReports` мовчки покаже `total kcal = 0` бо рядок ніхто не оновить. Те саме — `fizruk_workouts_v1` / `hub_routine_v1`, обидва позначені `@deprecated` у `storageKeys.ts`. Drift між рядковими літералами і реєстром — це **головний клас bug-ів LS-engine-у** у репо.

**Recommendation.**

```typescript
import { STORAGE_KEYS } from "@sergeant/shared";

const rawFizrukWorkouts = safeReadStringLS(STORAGE_KEYS.FIZRUK_WORKOUTS);
const rawFinykCache     = safeReadLS(STORAGE_KEYS.FINYK_TX_CACHE, null);
const rawRoutineState   = safeReadLS(STORAGE_KEYS.HUB_ROUTINE, null);
const rawNutritionLog   = safeReadLS(STORAGE_KEYS.NUTRITION_LOG, {});
```

Те саме у `useFinykHubPreview.ts:20`: `STORAGE_KEYS.FINYK_TX_CACHE`. Додати `eslint-no-restricted-syntax` правило, що ловить string-literal `"fizruk_workouts_v1"|"finyk_tx_cache"|…`.

---

### F2 — BarChart bar-buttons без accessible name [severity: high] [perspective: a11y]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L92–L141 (`BarChart` component)

**Description.**
Кожен бар у `BarChart` — це інтерактивний `<button>` з тільки візуальним `<div>` всередині (`width: bar%`). Контейнер графіка має `aria-label="Графік"` (L124), але самі бари не мають accessible name:

```tsx
<button
  onMouseEnter={() => setHover(i)}
  onClick={() => setSelected((s) => (s === i ? null : i))}
  className="flex-1 flex items-end justify-center min-w-0 group"
>
  <div className={cn("w-full rounded-t-md ...", colorClass)}
       style={{ height: `${pct}%` }} />
</button>
```

Screen-reader-юзер чує "button, button, button, …, Графік" без жодної цифри.

**Why it matters.**
WCAG 4.1.2 (Name, Role, Value). Графік — це **головний сюжет** Reports-сторінки; без accessible-name-у вся візуалізація недосяжна для NVDA / VoiceOver / TalkBack. У `formatTooltip` уже є шаблон `${date}: ${value}` — він просто не дописаний як `aria-label`.

**Recommendation.**

```tsx
<button
  type="button"
  aria-label={formatTooltip(dates[i] ?? "", vals[i] ?? 0)}
  aria-pressed={selected === i}
  onMouseEnter={() => setHover(i)}
  onClick={() => setSelected((s) => (s === i ? null : i))}
  className="flex-1 flex items-end justify-center min-w-0 group"
>
  …
</button>
```

Те ж — додати `<title>` всередину SVG-tooltip-у, бо VoiceOver інколи читає `<title>` пріоритетніше за `aria-label` на flex-elements.

---

### F3 — `useReportData` не реагує на live-зміни LS (stale chart у тому ж табі) [severity: high] [perspective: bug]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L24–L60 (`useMemo([period, offset])`)

**Description.**
`useReportData` обгорнутий у `useMemo` із залежностями `[period, offset]`. Якщо HubReports вмонтований (наприклад, у tab-strip або в insights-секції) і користувач у тому ж табі додає тренування у Fizruk → `localStorage["fizruk_workouts_v1"]` оновився → Reports **не перерендерить графік**. Тільки перемикання періоду / `offset = ±1` тригерить переагрегацію. `storage` event у тому ж табі не вистрілює (browser-spec), а ні MutationObserver-а, ні invalidation-bus-у тут немає.

Інші компоненти у scope використовують ту саму паттерн правильно: `useFinykHubPreview.ts:38–46` слухає `storage` event для cross-tab, плюс `refetchOnWindowFocus: "always"` для повернення у таб. У `HubReports.tsx` нічого з цього немає.

**Why it matters.**
Підрив довіри до «звіту тижня»: користувач закрив тренування, відкрив звіт — нічого не змінилось → переходить у Fizruk перевірити, чи воно зберіглось → **повертається до Hub** через router-back → Reports перерендериться (бо unmount/mount) і тепер показує правильні цифри. Це класичний confusion-loop, особливо болючий перед PR-показом.

**Recommendation.**
Або (а) інтегрувати з React Query через `hubKeys.reports(period, offset)`, з invalidate-ом кожного разу, коли writer (Finyk save / Fizruk save / Routine toggle / Nutrition log) оновлює свій LS-ключ. Або (б) дешевший варіант — слухати власний `window`-event `"hub-storage-updated"` + `storage` cross-tab event:

```typescript
const [bumpKey, setBumpKey] = useState(0);
useEffect(() => {
  const onBump = () => setBumpKey((k) => k + 1);
  window.addEventListener("hub-storage-updated", onBump);
  window.addEventListener("storage", onBump);
  return () => {
    window.removeEventListener("hub-storage-updated", onBump);
    window.removeEventListener("storage", onBump);
  };
}, []);
const data = useMemo(() => aggregateReport(period, offset, inputs), [period, offset, bumpKey, /* … */]);
```

Writers (Fizruk-save, Nutrition-meal-add, Routine-toggle, Finyk-tx-save) уже мають місця інвалідації RQ — додати `window.dispatchEvent(new Event("hub-storage-updated"))` поряд.

---

### F4 — Prev/Next period кнопки нижче 44×44 (WCAG 2.5.5) [severity: high] [perspective: a11y]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L400–L440 (period-nav)

**Description.**
Кнопки `«‹»` (prev period) і `«›»` (next period) у заголовку Reports мають класи `w-8 h-8` (32×32 px) і не вживають `touch-target` utility. WCAG 2.5.5 (AA) вимагає мінімум 44×44 на coarse-pointer пристроях; `Button`-компонент із `@shared/components/ui/Button` робить це автоматично, але тут — інлайн-теги `<button>` із кастомними розмірами.

```tsx
<button
  type="button"
  onClick={() => setOffset((o) => o - 1)}
  className="w-8 h-8 flex items-center justify-center rounded-xl ..."
>
  ‹
</button>
```

**Why it matters.**
На phones (iPhone SE, Pixel 5a) користувачі промахуватимуться. У репо чітка політика — `Button` варіант `iconSize="sm"` уже = 44×44 з urivkom: глобальний safety-net у `index.css` теж зачинений CSS-варіантом `pointer-coarse`. Цей файл просто «прослизнув» через інлайн-стилі.

**Recommendation.**

```tsx
<Button
  variant="ghost"
  iconSize="sm"
  onClick={() => setOffset((o) => o - 1)}
  aria-label="Попередній період"
>
  <Icon name="chevron-left" size="sm" />
</Button>
```

Або (мінімально-інвазивно) — додати `touch-target` utility:

```tsx
<button className="w-8 h-8 touch-target ...">
```

---

### F5 — Arbitrary palette steps у BarChart (`bg-sky-500`, `bg-emerald-500`, `bg-orange-500`, `bg-lime-500`) [severity: medium] [perspective: tailwind]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L475, L494, L513, L533

**Description.**
StatCard-и для Fizruk / Finyk / Routine / Nutrition візуалізуються через сирі Tailwind-палітри:

```tsx
<StatCard ... colorClass="bg-sky-500"      ... />  // Fizruk
<StatCard ... colorClass="bg-emerald-500"  ... />  // Finyk
<StatCard ... colorClass="bg-orange-500"   ... />  // Routine
<StatCard ... colorClass="bg-lime-500"     ... />  // Nutrition
```

Це порушує Hard Rule #11 (no arbitrary hex / raw-palette в className) і Hard Rule #12 (module-accent containment) — кожен модуль уже має зареєстровану дизайн-токен-палітру (`bg-fizruk`, `bg-finyk`, `bg-routine`, `bg-nutrition`), що **семантично** збігається з кольором модуля. `bg-sky-500` для Fizruk суперечить дизайн-системі, де Fizruk = teal/cyan token (а не sky). Те саме — Finyk насправді emerald, але через `bg-emerald-500` ми обходимо `bg-finyk-strong`-companion і не отримуємо dark-mode-вaru toner.

**Why it matters.**
Brand-drift: bar-кольори у Reports не співпадають з кольорами цих модулів у MODULE_CONFIGS (`moduleConfigs.tsx`). При зміні токена `--finyk` доведеться руками шукати `emerald-500` по коду. У dark mode також немає `dark:` варіантів — навіть якщо `bg-emerald-500` має достатній контраст на cream, у dark `bg-emerald-500` тоне у фоні.

**Recommendation.**

```tsx
<StatCard ... colorClass="bg-fizruk"    ... />
<StatCard ... colorClass="bg-finyk"     ... />
<StatCard ... colorClass="bg-routine"   ... />
<StatCard ... colorClass="bg-nutrition" ... />
```

Якщо BarChart на cream фоні читається погано, перейти на `-strong`-companion: `bg-fizruk-strong dark:bg-fizruk`, як уже зроблено для PILL_ACCENT у `dashboard/dashboardCards.tsx:38–43`.

---

### F6 — `aggregateReport` ігнорує `now`, тому `period range` дрейфує під час сесії [severity: medium] [perspective: bug]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx` + `hubReports.aggregation.ts`
**Lines:** HubReports.tsx L24–L60 (виклик `aggregateReport(period, offset, inputs)` без `now`); `hubReports.aggregation.ts` L283 (signature `aggregateReport(period, offset, inputs, now = new Date())`)

**Description.**
`aggregateReport(period, offset, inputs)` за дефолтом бере `now = new Date()` у момент виклику. Hook у HubReports не передає `now` явно, тому **кожен render** під час сесії читає новий `Date.now()`. Якщо користувач має dashboard відкритим через нічний перехід (як у edge-юзерів) і потім перемикає період → `getPeriodRange("week")` повертає інший range, ніж ще 10 секунд тому. У вижатому юзкейсі (PWA в фоні через midnight) деякі бари просто "зникнуть", а юзер цього не зрозуміє.

**Why it matters.**
Edge-case, але не «теоретичний»: PWA-юзери в Україні відкривають Hub перед сном і ввімкнули `display: standalone`. Перевірка на staleness ускладнюється тим, що `getPeriodRange` фіксує `mon.setHours(0, 0, 0, 0)` — отже коректний поведінковий контракт повинен мати один **прив’язаний до сесії** `now` (а краще — реактивний на полудень/нічний перехід).

**Recommendation.**
Тримати `now` як `useState` із оновленням на `visibilitychange`:

```typescript
const [now, setNow] = useState(() => new Date());
useEffect(() => {
  const onVis = () => {
    if (document.visibilityState === "visible") setNow(new Date());
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}, []);
const data = useMemo(
  () => aggregateReport(period, offset, inputs, now),
  [period, offset, inputs, now],
);
```

---

### F7 — Insights-секція у HubReports ігнорує `period`/`offset` [severity: medium] [perspective: ux]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L548–L600 (`generateInsights` блок)

**Description.**
`generateInsights()` викликається з `useMemo` залежним лише від `data.*.cur`/`prev` (через `useReportData`). Але **сам інсайт-render у low-effort вигляді не показує яку періоду він стосується** — заголовок «Інсайти» однаковий для week і month. Якщо це нумерично коректно, текст інсайту все одно повинен сигналізувати "за тиждень" / "за місяць" — інакше юзер може сприйняти "ти бігав 4 рази" як річний підсумок.

**Why it matters.**
UX-плутанина і недостатня контекстуальність. На малому екрані юзер бачить три картки інсайтів і не пам'ятає, на якому таб-перемикачі він стоїть (period switcher у далекому верхньому правому куті).

**Recommendation.**
Передати period explicitly у формувач інсайтів:

```typescript
function generateInsights(d: ReportData, period: Period): string[] {
  const periodLabel = period === "week" ? "за тиждень" : "за місяць";
  if (d.workouts.cur.count > 0) {
    insights.push(`${periodLabel} зафіксовано ${d.workouts.cur.count} тренувань`);
  }
  ...
}
```

Або (краще) — рендерити періодний chip над списком: `[ за тиждень • 8 травня – 14 травня ]`.

---

### F8 — `setInterval(60_000)` у `useHubDashboardState` не вимикається при `adaptivePref=false` [severity: medium] [perspective: perf]

**Page:** Hub Dashboard
**File:** `apps/web/src/core/hub/useHubDashboardState.ts`
**Lines:** L330–L334

**Description.**
Для адаптивного rebuild-у Bento-grid-у hook тримає тікер:

```typescript
const [adaptiveNow, setAdaptiveNow] = useState(() => new Date());
useEffect(() => {
  const id = setInterval(() => setAdaptiveNow(new Date()), 60_000);
  return () => clearInterval(id);
}, []);
```

Кожну хвилину виконується `setAdaptiveNow` → re-render всього `HubDashboard` (включно з 4-ма `BentoCard`-ами, `HubInsightsBlock`-ом, `WeeklyDigestFooter`, etc). Якщо `adaptivePref === false` (юзер вимкнув adaptive у settings) або `editMode === true` — `pickAdaptiveLift` нижче за деревом одразу повертає `{ liftedId: null }` без використання `adaptiveNow`, але тікер все одно стрельне і весь дашборд перерендериться даремно.

**Why it matters.**
Дрейф батарейки / CPU на mobile — особливо помітно при відкритому Hub у фоновому табі (React не зупиняє таймери для прихованих табів автоматично, лише browser-throttle на ~1Hz). Малий, але непотрібний фон-cost.

**Recommendation.**

```typescript
useEffect(() => {
  if (!adaptivePref || editMode) return;
  const id = setInterval(() => setAdaptiveNow(new Date()), 60_000);
  return () => clearInterval(id);
}, [adaptivePref, editMode]);
```

Або додатково — `pause`-ити коли `document.visibilityState === "hidden"`.

---

### F9 — `HubInsightsPanel` хардкодить foreign module-accents у hub-shell [severity: medium] [perspective: rule]

**Page:** Hub Insights Panel
**File:** `apps/web/src/core/hub/HubInsightsPanel.tsx`
**Lines:** L14–L20

**Description.**
Hub container використовує map foreign module-кольорів напряму:

```typescript
const MODULE_ACCENT: Record<ModuleId, string> = {
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
  hub: "bg-primary",
};
```

Hard Rule #12 (module-accent containment) має cross-module exception для hub-shell-у (`apps/web/AGENTS.md § Module-accent containment`), тож формально це **дозволено**. Але **дух правила** — hub shell не повинен фарбуватися у конкретний модульний колір; це робить SEVERITY-based accent (warning/danger/info). У `dashboard/dashboardCards.tsx` уже є `PILL_ACCENT` із `-strong`-companion (correctly compliant з Rule #9). Тут пропущено `-strong` варіант: під cream background `bg-finyk` / `bg-routine` / `bg-nutrition` дають слабкий контраст з white text.

**Why it matters.**
Якщо severity-based icon (e.g. `bg-warning-soft text-warning-strong`) є більш універсальним сигналом ("щось вимагає уваги"), то module-color може заважати юзеру швидко сканувати — кольори перетягують увагу не туди.

**Recommendation.**
Або переключитися на severity-based accent (як у `Recommendations` API):

```typescript
const SEVERITY_ACCENT: Record<RecSeverity, string> = {
  danger: "bg-danger-soft text-danger-strong",
  warning: "bg-warning-soft text-warning-strong",
  info: "bg-info-soft text-info-strong",
  success: "bg-success-soft text-success-strong",
};
```

Або як мінімум — додати `-strong`-companion + dark-варіант: `finyk: "bg-finyk-soft text-finyk-strong dark:bg-finyk dark:text-bg"`.

---

### F10 — `MotivationalFooter` рахує `countRealEntries` без memo / cache → re-mount cost [severity: low] [perspective: perf]

**Page:** Hub Dashboard (footer)
**File:** `apps/web/src/core/hub/dashboard/dashboardCards.tsx`
**Lines:** L230–L241

**Description.**
`MotivationalFooter` обчислює `entryCount = countRealEntries(localStorageStore)` у `useMemo([])` — порожні залежності означають "обчислити один раз при mount-у". Це працює, поки footer лише раз монтується. Але `countRealEntries` під капотом читає кілька LS-ключів (fizruk_workouts_v1 / finyk_tx_cache / hub_routine_v1 / nutrition_log_v1) і парсить JSON. При свіжому FTUX-flow юзер додає перший запис → footer не оновлюється, бо `useMemo([])` не reactive.

**Why it matters.**
Це не падіння, але юзер бачить `Вже 0 записів` після першого внесення — мінорна, але видима неузгодженість. У сусідньому компоненті `StreakIndicator` теж є аналогічний паттерн `useMemo([])`.

**Recommendation.**
Підключитися до того ж `"hub-storage-updated"` події (див. F3) або до `storage`-event-у:

```typescript
const [tick, setTick] = useState(0);
useEffect(() => {
  const bump = () => setTick((t) => t + 1);
  window.addEventListener("hub-storage-updated", bump);
  window.addEventListener("storage", bump);
  return () => {
    window.removeEventListener("hub-storage-updated", bump);
    window.removeEventListener("storage", bump);
  };
}, []);
const entryCount = useMemo(() => countRealEntries(localStorageStore), [tick]);
```

---

### F11 — `ModuleErrorBoundary` рендерить `error.message` у `<pre>` без редакції [severity: medium] [perspective: security]

**Page:** Module error fallback
**File:** `apps/web/src/core/ModuleErrorBoundary.tsx`
**Lines:** L65–L80 (fallback render)

**Description.**
Коли ленивий модуль кидає, fallback показує юзеру raw error:

```tsx
<pre className="text-xs text-danger overflow-auto">
  {this.state.error.message}
</pre>
```

Якщо помилка має стек-trace з шляхами файлів (`Cannot read property 'foo' of undefined at /app/src/modules/finyk/...`), або повідомлення з API містить email/userId/токен — все це показується юзеру і потенційно копіюється у тікет / репорт. Hard Rule #21 (Pino redaction) забороняє це робити для серверних логів, але клієнтська сторона тут — те саме порушення дух-у.

**Why it matters.**
Можливий leak token-у з backend API error message-у (`"Invalid token: eyJhbGciOiJIUzI1Ni..."`), або витік стрктурі коду (paths). У продакшн ще й користувачу нецікаво читати "Cannot read properties of undefined" — він просто бачить страшний JSON.

**Recommendation.**

```tsx
{import.meta.env.DEV ? (
  <pre className="text-xs text-danger overflow-auto">
    {this.state.error.message}
  </pre>
) : (
  <p className="text-xs text-muted">
    Сталась внутрішня помилка. Спробуй оновити сторінку або повернутись до головної.
  </p>
)}
```

Зберегти повний message у Sentry (вже робиться через `captureException`), а юзеру показувати тільки санітизовану строку.

---

### F12 — `useMondayAutoDigest` подвійний-тригер при null-перетині понеділка [severity: medium] [perspective: bug]

**Page:** Auto weekly digest
**File:** `apps/web/src/core/hub/dashboard/useMondayAutoDigest.ts`
**Lines:** L16–L36

**Description.**
Hook працює на mount-і: якщо включено `WEEKLY_DIGEST_MONDAY_AUTO === "1"`, сьогодні понеділок і `loadDigest(weekKey) == null` → `setTimeout(generate, 3000)`. Але:

1. Якщо юзер відкрив Hub у 23:59 неділі (`isMonday === false`, нічого не робимо), потім фон-tab → опівночі браузер перейшов на понеділок, юзер повертається до табу о 00:01 і компонент **не перемонтується** → `setInterval`/`setTimeout` не запускається.
2. Якщо `Hub` перемонтується (router navigation `/` → `/finyk` → `/`) у понеділок, перший раз стрельне `generate()`, потім компонент knock-нувся і знову встановив таймер — другий `generate()` не запуститься, бо `loadDigest(weekKey)` поверне свіже значення. **Але** якщо `generate()` під капотом запитує сервер-LLM, а тут одночасно mount/unmount/mount у 3-секундному вікні (наприклад, через swControl-rerender) — гонка можлива.

**Why it matters.**
Не кризовий, але `generate()` коштує запиту до AI endpoint-у — payment cost. Подвійний запит за один понеділок = 2× cost.

**Recommendation.**
Зробити idempotent-guard через LS-flag:

```typescript
const guardKey = `weekly_digest_auto_${weekKey}`;
if (safeReadLS<string>(guardKey, "") === "1") return;
safeWriteLS(guardKey, "1");
const timer = setTimeout(() => generate(), 3000);
return () => clearTimeout(timer);
```

(Cleanup-guard щоб navigated-away не запускав другий раз.) Або позиченти `RECENT_KEYS` / `usePersistedFlag`.

---

### F13 — Inline `FTUX_MODULES_HINT_KEY` за межами `STORAGE_KEYS` registry [severity: low] [perspective: rule]

**Page:** Modules Grid
**File:** `apps/web/src/core/hub/HubModulesGrid.tsx`
**Lines:** L30–L34

**Description.**
`HubModulesGrid` зберігає прапор «hint бачили» через локальну константу замість централізованого реєстру `STORAGE_KEYS`:

```typescript
const FTUX_MODULES_HINT_KEY = "sergeant.hub.ftux.modules_hint_seen";
```

Це **єдиний** інлайн storage-key у scope, що не з реєстру. `STORAGE_KEYS` у `@sergeant/shared/storage/keys` має namespace для FTUX-flag-ів — слід додати запис там.

**Why it matters.**
Drift-risk як у F1, але мінорний (single-use, не migrate-able). Окремо — localstorage-allowlist (Hard Rule про storage-registry) теоретично має ловити, але можливо обходить через camel-case відмінність.

**Recommendation.**

```typescript
// packages/shared/src/lib/storageKeys.ts
export const STORAGE_KEYS = {
  ...,
  FTUX_MODULES_HINT_SEEN: "sergeant.hub.ftux.modules_hint_seen",
};

// HubModulesGrid.tsx
import { STORAGE_KEYS } from "@sergeant/shared";
const seen = safeReadStringLS(STORAGE_KEYS.FTUX_MODULES_HINT_SEEN);
```

---

### F14 — `BentoCard` aria-label лише для inactive-state [severity: medium] [perspective: a11y]

**Page:** Modules Grid (Bento)
**File:** `apps/web/src/core/hub/dashboard/BentoCard.tsx`
**Lines:** L108–L113

**Description.**
Primary `<button>` має `aria-label` тільки коли `inactive === true`:

```tsx
aria-label={
  inactive
    ? `${config.label} — неактивний модуль. Увімкнути в налаштуваннях Hub.`
    : undefined
}
```

Для active state `aria-label` undefined → screen-reader читає весь дочірній текст: іконку (`aria-hidden` нема на SVG), label, preview value, sublabel, "Натисни, щоб почати"/empty-label, progress-bar (`aria-hidden`-ed correctly). Резулт: NVDA читає типу "Фінік 12 345 ₴ за добу empty-label Натисни щоб почати button". Дуже шумно.

**Why it matters.**
WCAG 2.4.6 (Headings & Labels). Юзер на screen-reader не може швидко сканувати чотири картки — кожна звучить як простір на 5 секунд читання.

**Recommendation.**
Завжди задавати чітку accessible-name:

```tsx
aria-label={
  inactive
    ? `${config.label} — неактивний модуль. Увімкнути в налаштуваннях Hub.`
    : hasData
      ? `${config.label}: ${preview.main}${preview.sub ? `, ${preview.sub}` : ""}`
      : `${config.label}: ${config.emptyLabel}`
}
```

І додати `aria-hidden="true"` на іконку-SVG (зараз вона focusable у Safari-old, але без `aria-hidden`).

---

### F15 — Non-null assertions у `adaptiveSort.ts` обходять `noUncheckedIndexedAccess` [severity: low] [perspective: ts]

**Page:** Adaptive sort engine
**File:** `apps/web/src/core/hub/dashboard/adaptiveSort.ts`
**Lines:** L183–L196, L213

**Description.**
Цикл по `order` (readonly array) індексується через `order[i]`:

```typescript
for (let i = 0; i < order.length; i++) {
  const id = order[i];                         // type: ModuleId | undefined
  if (!activeModules.has(id!)) continue;       // ! non-null
  if (modulesWithSignal.has(id!)) {            // ! non-null
    const s = signalScore(severityByModule[id!]); // ! non-null
    ...
  }
  const timeMatch = timeOfDayMatch(id!, hour); // ! non-null
  ...
  best = { id: id!, score, reason, index: i }; // ! non-null
}
```

Hard Rule #19 (noUncheckedIndexedAccess: true canonical) означає, що `order[i]` має тип `ModuleId | undefined`. Цикл `for (let i = 0; i < order.length; i++)` гарантує, що `i` у межах, але TS цього не доводить. Шість штук `id!` у короткому циклі — це грубе обходження правила.

**Why it matters.**
`!` operator silently disables a soundness check. Якщо хтось зміниний `order` на `ReadonlyArray<ModuleId | null>` (наприклад, додавши `null` для placeholder-slot), `id!` пропустить його без error-у.

**Recommendation.**
Перейти на `for...of`:

```typescript
for (let i = 0; i < order.length; i++) {
  const id = order[i];
  if (id === undefined) continue;
  if (!activeModules.has(id)) continue;
  ...
  if (modulesWithSignal.has(id)) {
    const s = signalScore(severityByModule[id]);
    ...
  }
  const timeMatch = timeOfDayMatch(id, hour);
  ...
  best = { id, score, reason, index: i };
}
```

Той самий патерн — `hubReports.aggregation.ts:203` (`completions[h.id]!.includes(dk)`) і `dashboardCards.tsx:26` (`m!`).

---

### F16 — `HubReports.tsx` ≈603 LOC — на межі Hard Rule #18 (max-lines: 600) [severity: medium] [perspective: rule]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** entire file

**Description.**
Файл налічує 603 рядки (з blank+comment skip — ~563 LOC ESLint-effective). Hard Rule #18 = `max-lines: 600` для apps/web TS/TSX. Технічно це межовий випадок — у ESLint конфізі `skipBlankLines: true, skipComments: true` лімітом для саме apps/web стоїть 600 effective lines, тож 563 поки проходить. **Але** файл легко розпадається на чотири логічні підмодулі:

1. `BarChart` (L92–L141) → `apps/web/src/core/hub/reports/BarChart.tsx`
2. `Delta` (L143–L180) → інлайн helper можна винести
3. `StatCard` collapsible (L182–L320) → окремий компонент
4. `useReportData` (L24–L60) → можна відразу винести у `useHubReportData.ts`
5. `generateInsights` (L548–L600) → у `hubReports.aggregation.ts` поряд із `aggregateReport`

**Why it matters.**
Перевищення формального ліміту стане жалом при будь-якому follow-up PR-і, який додасть рядки. Краще рефакторити зараз (тривіальний docs-PR не вирішить, але слід згадати).

**Recommendation.**
Розпил по 4 файлах (по 100–200 LOC кожен), `HubReports.tsx` стане container-ом ~120 LOC.

---

### F17 — Inline gradient `from-brand-100 to-teal-100` у dashboardCards [severity: low] [perspective: tailwind]

**Page:** Hub Dashboard (Weekly Digest footer)
**File:** `apps/web/src/core/hub/dashboard/dashboardCards.tsx`
**Lines:** L268–L270

**Description.**
WeeklyDigestFooter рендерить градієнтну іконку:

```tsx
"bg-linear-to-br from-brand-100 to-teal-100",
"dark:from-brand-900/40 dark:to-teal-900/30",
```

`teal-100` / `teal-900` — це raw-Tailwind tone, що не походить з `--brand-*` токенів. Hard Rule #13 (no raw-palette light/dark className pairs) — це межовий випадок: `teal-*` зареєстрований у `tailwind-preset.js` як алласі-окремий accent, але це не token-ed companion для `brand-*`. У сусідніх компонентах (`WeeklyDigestCard.tsx:312`, `AssistantAdviceCard.tsx:56`) той самий паттерн `from-brand-... to-teal-...` — отже це не одиничний slip.

**Why it matters.**
Якщо колись додамо `--brand-secondary` як зареєстрований token, цей `teal-100` доведеться руками шукати по всьому коду. Сам по собі не блокатор — просто tech-debt.

**Recommendation.**
Зареєструвати другий-tier brand companion як `bg-brand-secondary` у `tailwind-preset.js`:

```typescript
brand: { ... },
"brand-secondary": { 100: "var(--brand-secondary-100)", ... },
```

І замінити `teal-100` → `brand-secondary-100`.

---

### F18 — `HubReports.tsx` `raw!.txs` — non-null на narrowed union [severity: low] [perspective: ts]

**Page:** Hub Reports
**File:** `apps/web/src/core/hub/HubReports.tsx`
**Lines:** L30–L38

**Description.**
`useReportData` парсить `finyk_tx_cache`:

```typescript
const raw = safeReadLS<unknown[] | { txs?: unknown[] }>("finyk_tx_cache", null);
const txList =
  Array.isArray(raw)
    ? (raw as Parameters<typeof calcFinykSpendingByDate>[0])
    : Array.isArray(raw?.txs)
      ? raw!.txs
      : [];
```

`raw?.txs` уже narrow-ить `raw` (якщо не null/undefined, він — об'єкт). Заплямувати `raw!.txs` після `Array.isArray(raw?.txs)` — формально redundant: TS вже знає, що `raw` not nullable у цій гілці. `!` тут шум, але не bug.

**Why it matters.**
Code-style, не функціональна. Видимий маркер обходу типизації.

**Recommendation.**

```typescript
const isWrappedShape = (v: unknown): v is { txs: unknown[] } =>
  typeof v === "object" && v !== null && Array.isArray((v as { txs?: unknown }).txs);
const txList = Array.isArray(raw)
  ? raw
  : isWrappedShape(raw)
    ? raw.txs
    : [];
```

---

### F19 — `App.tsx` запускає `useNutritionDualWriteBoot()` без auth-guard [severity: low] [perspective: perf]

**Page:** App shell
**File:** `apps/web/src/core/App.tsx`
**Lines:** L130–L134 (`AppInner` body, hooks-block)

**Description.**
`App.tsx` викликає nutrition dual-write / sqlite-read boot hooks при кожному рендері незалежно від auth status-у:

```typescript
useNutritionDualWriteBoot();
useNutritionSqliteReadBoot();
```

Хуки самі по собі idempotent (latched on userId всередині), але **імпорт** цих хуків (а через них — `@sergeant/nutrition-domain`, sqlite-driver, dual-write helpers) — у головному chunk-у. Це шар тяжкий навіть для не-залогінених юзерів, які прийшли на pricing/sign-in.

**Why it matters.**
Hard Rule "lazy-by-default" не стосується core-hub-у, але якщо ці хуки впливають тільки на залогінених, можна було б їх обернути ленивим dynamic-import-ом всередині `<AuthenticatedShell>`-у.

**Recommendation.**

```typescript
function AuthenticatedNutritionBoot() {
  useNutritionDualWriteBoot();
  useNutritionSqliteReadBoot();
  return null;
}

function AppInner() {
  const auth = useAuth();
  ...
  return (
    <>
      {auth.status === "authenticated" && <AuthenticatedNutritionBoot />}
      ...
    </>
  );
}
```

Знадобиться lazy-chunk через `lazyImport`, якщо `nutrition-domain` важкий по KB.

---

### F20 — `CrossModulePreview.tsx` `useEffect([])` пропускає `copy` reference [severity: low] [perspective: bug]

**Page:** Cross-module preview card (one-shot)
**File:** `apps/web/src/core/hub/CrossModulePreview.tsx`
**Lines:** L47–L55

**Description.**
Mount-only telemetry-tracker:

```tsx
useEffect(() => {
  trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_SHOWN, {
    source: sourceModule,
    target: copy.targetModule,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Зважаючи на `eslint-disable react-hooks/exhaustive-deps` — це intent. Але якщо `sourceModule` зміниться (re-mount-у не буде, бо `useEffect` тримає mount-only) → телеметрія не вистрілить вдруге. Це bug-prone паттерн, особливо коли тег `// мovrnt-only` неявний.

**Why it matters.**
Не critical. Майбутні зміни (e.g. зміна `sourceModule` через router-state) приховають телеметричні події.

**Recommendation.**
Використати `useRef` для "fired-once" семантики (більш явно):

```tsx
const trackedRef = useRef(false);
useEffect(() => {
  if (trackedRef.current) return;
  trackedRef.current = true;
  trackEvent(ANALYTICS_EVENTS.CROSS_MODULE_PREVIEW_SHOWN, { source: sourceModule, target: copy.targetModule });
}, [sourceModule, copy.targetModule]);
```

---

### F21 — `useFinykHubPreview.ts:20` дублює `STORAGE_KEYS.FINYK_TX_CACHE` [severity: low] [perspective: rule]

**Page:** Hub Finyk preview hook
**File:** `apps/web/src/core/hub/useFinykHubPreview.ts`
**Lines:** L20

**Description.**

```typescript
const TX_CACHE_LS_KEY = "finyk_tx_cache";
```

Дубль `STORAGE_KEYS.FINYK_TX_CACHE`. Той самий клас drift-bug-у, як F1.

**Recommendation.**

```typescript
import { STORAGE_KEYS } from "@sergeant/shared";
const TX_CACHE_LS_KEY = STORAGE_KEYS.FINYK_TX_CACHE;
```

Або взагалі видалити локальну константу і використовувати `STORAGE_KEYS.FINYK_TX_CACHE` напряму у `addEventListener("storage", ...)`.

---

### F22 — `HubInsightsPanel.tsx:113` `items?.length || 0` коли `items: Recommendation[]` non-optional [severity: low] [perspective: ts]

**Page:** Hub Insights Panel
**File:** `apps/web/src/core/hub/HubInsightsPanel.tsx`
**Lines:** L113

**Description.**

```typescript
interface HubInsightsPanelProps {
  items: Recommendation[];        // ← non-optional
  ...
}

function HubInsightsPanel({ items, ... }: HubInsightsPanelProps) {
  ...
  const count = items?.length || 0;  // ← `?.` dead, `|| 0` redundant
}
```

`items` обовʼязковий у пропсах — `items?.length` ніколи не undefined, `|| 0` ніколи не активується.

**Recommendation.**

```typescript
const count = items.length;
```

---

### F23 — Тести: `HubReports.tsx` має тільки aggregation-тести; UI рендер без coverage [severity: medium] [perspective: test]

**Page:** Hub Reports
**File:** missing `apps/web/src/core/hub/HubReports.test.tsx`

**Description.**
`hubReports.aggregation.test.ts` покриває **чисту** агрегацію (`aggregateReport`, `aggregateWorkouts`, etc.) — це добре. Але сам `HubReports` компонент (period switcher, BarChart, StatCard collapsible, insights) не має жодного render-у Vitest. Висновок: regression-и у UI (e.g. F2 — bar accessible name, F4 — touch-target, F7 — period chip) ніхто автоматично не зловить.

**Why it matters.**
Test coverage gap для одного з найскладніших компонентів у scope. Скільки разів HubReports перерендериться у середньому тижні — десятки разів на день для активних юзерів.

**Recommendation.**
Додати `HubReports.test.tsx` із:
- Render-smoke (mounting не падає);
- Period switcher (week ↔ month) → range у заголовку оновлюється;
- StatCard collapsible toggling;
- BarChart hover/click — `aria-pressed` toggling (після виправлення F2).

---

### F24 — App shell тести: `App.test.tsx` є, але не покриває `<ErrorBoundary>` reset path [severity: low] [perspective: test]

**Page:** App shell
**File:** `apps/web/src/core/App.test.tsx` (existing) + `apps/web/src/main.tsx` (мунтить ErrorBoundary)

**Description.**
`App.test.tsx` тестує App-rendering і Provider-tree invariant. `ErrorBoundary` у `main.tsx` — це root-level safety-net із logic для (а) chunk-load cooldown через sessionStorage, (б) request-ID extraction, (в) Sentry breadcrumb. Жоден з цих шляхів не покритий unit-test-ом. `ModuleErrorBoundary.tsx` — той же кейс (retry mechanism + remount).

**Why it matters.**
Якщо колись зламається cooldown-logic (e.g. session-storage race), regress буде live тільки після прод-deploy + Sentry-volume-у.

**Recommendation.**
Додати `ErrorBoundary.test.tsx`:
- Throw синтетичний chunk-load error → перевірити, що cooldown-flag встановлено;
- Throw generic error → перевірити `requestId` extraction;
- Reset → перевірити, що Sentry breadcrumb додано.

---

## Per-page coverage matrix

| Page | sec | a11y | perf | ux | bug | rule | ts | tw | i18n | test | ai | lifecycle |
| ---- | --- | ---- | ---- | -- | --- | ---- | -- | -- | ---- | ---- | -- | --------- |
| App.tsx | X | X | 1 (F19) | X | X | X | X | X | X | 1 (F24) | X | X |
| app/router.tsx | X | X | X | X | X | X | X | X | X | X | X | X |
| ErrorBoundary.tsx | X | X | X | X | X | X | X | X | X | 1 (F24) | X | X |
| ModuleErrorBoundary.tsx | 1 (F11) | X | X | X | X | X | X | X | X | X | X | X |
| hub/HubDashboard.tsx | X | X | X | X | X | X | X | X | X | X | X | X |
| hub/HubHeroBlock.tsx | X | X | X | X | X | X | X | X | X | X | X | X |
| hub/HubInsightsBlock.tsx | X | X | X | X | X | X | X | X | X | X | X | X |
| hub/HubInsightsPanel.tsx | X | X | X | X | X | 1 (F9) | 1 (F22) | X | X | X | X | X |
| hub/HubReports.tsx | X | 2 (F2, F4) | X | 1 (F7) | 2 (F3, F6) | 2 (F1, F16) | 1 (F18) | 1 (F5) | X | 1 (F23) | X | X |
| hub/HubModulesGrid.tsx | X | X | X | X | X | 1 (F13) | X | X | X | X | X | X |
| hub/ValueProgressBar.tsx | X | X | X | X | X | X | X | X | X | X | X | X |
| hub/CrossModulePreview.tsx | X | X | X | X | 1 (F20) | X | X | X | X | X | X | X |
| hub/useHubDashboardState.ts | X | X | 1 (F8) | X | X | X | X | X | X | X | X | X |
| hub/useFinykHubPreview.ts | X | X | X | X | X | 1 (F21) | X | X | X | X | X | X |
| hub/hubReports.aggregation.ts | X | — | X | X | X | X | 1 (F15-related) | — | X | X | X | X |
| hub/hub.types.ts | X | — | — | — | — | X | X | — | — | — | — | X |
| hub/dashboard/adaptiveSort.ts | X | — | X | X | X | X | 1 (F15) | — | X | X | X | X |
| hub/dashboard/dashboardStore.ts | X | — | X | X | X | X | X | — | X | X | X | X |
| hub/dashboard/moduleConfigs.tsx | X | X | X | X | X | X | X | X | X | X | X | X |
| hub/dashboard/useMondayAutoDigest.ts | X | — | X | X | 1 (F12) | X | X | — | X | X | X | X |
| hub/dashboard/BentoCard.tsx | X | 1 (F14) | X | X | X | X | X | X | X | X | X | X |
| hub/dashboard/dashboardCards.tsx | X | X | 1 (F10) | X | X | X | 1 (F15-related) | 1 (F17) | X | X | X | X |
| lib/useRoutePrefetch.ts | X | — | X | X | X | X | X | — | X | X | X | X |

> Legend: X = audited, no findings · число = кількість findings на цій сторінці у цій перспективі · — = не застосовно для цього файлу (наприклад, a11y у pure-data модулі).

## Audited-clean perspectives (sample-checked invariants)

Перевірив, не знайшов проблем:

- **Security** — `dangerouslySetInnerHTML` / `eval` / `innerHTML` не зустрічаються у scope. Auth check у App-shell — через `useAuth().status`, lazy-роути self-gate-ять. `console.log` debug-залишків немає. PostHog/Sentry init без leaked secrets.
- **A11y focus-visible** — `BentoCard` / `CrossModulePreview` / `HubReports` всі використовують `focus-visible:ring-*` варіанти (Hard Rule #14). Жодного `focus:ring-*` (без `-visible`).
- **RQ key factories** — `useFinykHubPreview` використовує `hubKeys.preview("finyk")`. Жодного inline `queryKey: [...]` у scope (Hard Rule #2). Grep `queryKey:\s*\[` повернув 0 збігів.
- **`-strong` companion** — `dashboardCards.tsx PILL_ACCENT` коректно вживає `text-finyk-strong dark:text-finyk` тощо (Hard Rule #9). Доменно-обмежений до core/hub.
- **AI markers** — `AI-NOTE` / `AI-CONTEXT` у scope зустрічаються у коректному форматі. `AI-LEGACY` / `AI-GENERATED` без expiry/source у scope **не** виявлено.
- **Kopiykas as number / Kyiv TZ** — `aggregateSpending` делегує до `calcFinykSpendingByDate` (number-у вже на вході); `getPeriodRange` використовує локальний `getDay()` без UTC-конверсії (Kyiv-style week).
- **Bundle policy** — `router.tsx` лазі-завантажує `/nutrition/*`, `/finyk/*`, `/fizruk/*`, `/routine/*`; `useRoutePrefetch.ts` поважає `shouldPrefetchOnConnection()` (Save-Data / 2G).
- **WelcomeCard / CrossModulePreview** — `aria-label`, `kbd`, screen-reader сповіщення (`useAnnounce` у `useHubDashboardState.handleDragStart/End`).

## Audit-freeze exception

Цей PR створено під час freeze-вікна 2026-05-05 → 2026-06-02 (`docs/governance/audit-freeze-2026-05-05.md`). Він потрапляє у override-категорію:

- **Чому це exception:** аудит замовлений батьківським session-ом (`https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40`) як частина systematic page-by-page audit-пасу — серія child-сесій, кожна по своєму scope.
- **Чому не може почекати до 2026-06-02:** parent-сесія координує merging audit-findings у master-tracker одразу після завершення усіх child-ів; затримка зруйнує паралельний pipeline і витратить duplicate-work-у.
- **Куди буде інтегровано після freeze:** P0/P1 findings потраплять у `docs/launch/product-os/ftux-master-tracker.md` (status registry); решта стане до follow-up PR-ів через `[freeze-exception]` шлях.
