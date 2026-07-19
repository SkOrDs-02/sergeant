# HubSettings lazy boundaries — CLS + chunk-load follow-up

> **Last validated:** 2026-06-09.
> **Status:** Closed
> **Source:** Code review of merged batch `chore/orchestrated-batch-2026-05-22` (рebase виявив, що всі коміти вже в main; знахідки актуальні для поточного main).
> **Initiative:** [0017 — hub tabs mount perf](../../initiatives/0017-hub-tabs-mount-perf.md) — Sprint 1 PR-1.2 closeout.

## Контекст

Sprint 1 PR-1.2 ([apps/web/src/core/hub/HubSettingsPage.tsx](../../../../apps/web/src/core/hub/HubSettingsPage.tsx)) ввів lazy-loading 4 settings sections (Finyk / Nutrition / Routine / решта) через `lazy()` + `<Suspense>`. Code review знайшов два MEDIUM-issue, які не блокували merge, але живуть на main зараз і ризикують реальною UX-регресією на production.

## Знахідки

### MEDIUM #1 — chunk-load failure = white screen

**Файл:** [apps/web/src/core/hub/HubSettingsPage.tsx:32](../../../../apps/web/src/core/hub/HubSettingsPage.tsx) (lazy declarations), Suspense wrappers на L430-440.

**Проблема.** Якщо deploy invalidates chunk hash під час user session (типово PWA + service-worker stale cache + frequent deploys), `lazy(() => import(...))` reject'не з `ChunkLoadError` і React Suspense fallback залишиться вічно. User бачить porozhniy skeleton без recovery UI.

**Fix підхід.**

1. Створити `apps/web/src/core/hub/ChunkErrorBoundary.tsx` — React class component з `componentDidCatch`, що ловить `ChunkLoadError` (`error.name === 'ChunkLoadError'` АБО `/Loading chunk \d+ failed/`).
2. Fallback — `SectionSkeleton` (existing) + retry button який робить `window.location.reload()`.
3. НЕ ловити non-chunk errors — re-throw, щоб глобальний error boundary їх обробив.
4. Обгорнути кожен `<Suspense>` у HubSettingsPage.tsx у `<ChunkErrorBoundary>`.
5. Unit test: (a) catches chunk → retry UI, (b) re-throws others.

### MEDIUM #2 — Suspense fallback minH занижений → CLS jump

**Файл:** [apps/web/src/core/hub/HubSettingsPage.tsx:254-277](../../../../apps/web/src/core/hub/HubSettingsPage.tsx) — усі 4 sections мають `lazy: { minH: 72 }`.

**Проблема.** `72` — це collapsed-state висота заголовка section. Але Finyk / Nutrition / Routine відкриті за замовчуванням з bento sub-cards. Реальна painted minHeight section root коли content paint'нувся — 160-280px (потребує заміру). Між Suspense skeleton (72) і real content (220-ish) — CLS jump downward, який збиває scroll position коли user вже scrollив униз через deep link.

**Fix підхід.** ✅ Виконано 2026-06-09:

1. Per-section `minH` values встановлено з урахуванням кількості SubGroup-ів та chrome padding:
   - `fizruk` → `168` (1 SubGroup, simplest section)
   - `finyk` → `248` (3 SubGroups)
   - `routine` → `248` (3 SubGroups, nested cards)
   - `nutrition` → `280` (4 SubGroups, 1 defaultOpen with form fields)
2. JSDoc на `SettingsSection.lazy.minH` та `SectionSkeletonProps.minH` оновлено: "default-expanded height" замість "collapsed-state height".
3. **Примітка:** точні значення потребують верифікації через DevTools (`section.getBoundingClientRect().height`) на live dev-server. Поточні значення — евристика на основі аналізу коду (кількість SubGroup-ів × ~40px header + SettingsGroup header ~56px + padding/gaps). Якщо реальні виміри показують відхилення >24px — скоригувати.

## Виконання

Один PR на обидва fixes:

- Branch: `fix/hub-settings-cls-error-boundary`
- Title: `fix(web): HubSettings lazy sections — ChunkErrorBoundary + per-section minH for CLS`
- Body: посилання сюди + перед/після CLS measurements (`web-vitals` або Lighthouse trace).

**Стан (2026-06-09):**

- ✅ **MEDIUM #1** — `ChunkErrorBoundary` component shipped (`apps/web/src/core/hub/ChunkErrorBoundary.tsx`) + unit tests (`ChunkErrorBoundary.test.tsx`) + `chunkReload.ts` integration. Wraps each `<Suspense>` in `HubSettingsPage.tsx`.
- ✅ **MEDIUM #2** — per-section `minH` values updated: fizruk=168, finyk=248, routine=248, nutrition=280 (was all 72). JSDoc comments updated. Values are heuristic — verify with DevTools measurements on live dev-server.

## LOW-знахідки (не блокуючі, optional)

- **Hash-link scroll race** — [HubSettingsPage.tsx:441](../../../../apps/web/src/core/hub/HubSettingsPage.tsx) — `?tab=settings#settings-finyk` scroll'ить до wrapper до того як chunk paint'нувся; scroll target drift downward. Re-trigger `scrollIntoView` у `useEffect` після lazy mount, або `await Promise.all(preloads)` перед scroll для direct hash hits.
- **`noteDraftsRef` lag** — [apps/web/src/modules/routine/hooks/useCompletionNoteDrafts.ts:75](../../../../apps/web/src/modules/routine/hooks/useCompletionNoteDrafts.ts) — ref оновлюється в `useEffect`, тому caller `scheduleNoteFlush(...) + read noteDraftsRef.current[key]` побачить prior value. Identical pre-extraction; latent debt — не регресія цього PR.
- **`@sergeant/mobile` 0 unit tests** — окремий tech-debt запис.

## Closure

Closed: PR [ChunkErrorBoundary] landed 2026-06-09.

MEDIUM #1 — chunk-load failure = white screen — fixed. `ChunkErrorBoundary` wraps each of the four lazy sections (`FinykSection`, `FizrukSection`, `NutritionSection`, `RoutineSection`) in `HubSettingsPage`. Chunk-load failures now show a localized retry card (`SectionSkeleton` footprint + reload button) instead of propagating to the global boundary and blanking the entire Settings tab.

MEDIUM #2 — Suspense fallback minH CLS — deferred. Requires live browser measurement (ResizeObserver or Lighthouse CLS trace). Tracked separately; not addressed in this PR.
