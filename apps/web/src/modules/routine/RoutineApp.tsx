/**
 * Routine module composition root.
 *
 * Phase 2 decomposition (initiative 0001) — the prior 745-LOC file
 * has been split into:
 *
 *   - `RoutineApp.helpers.ts` — pure date/grouping utilities.
 *   - `useRoutineAppState.ts` — orchestrator hook with the
 *     time-state reducer, derived memos and effects.
 *   - `RoutineHeader.tsx` — the standard module header bar.
 *   - `RoutineTimeline.tsx` — the calendar/stats timeline body.
 *   - `RoutineActions.tsx` — bottom nav + quick-add dialog.
 *
 * This root is intentionally thin: it wires the public props through
 * the orchestrator hook and renders the three visual chunks inside
 * the module's accent provider. No business logic lives here —
 * adding a new behaviour means editing the matching shard above.
 */

import { MeshBackground, SwipePages } from "@shared/components/layout";
import { ModuleAccentContext } from "@shared/components/layout/ModuleAccentProvider";
import { ROUTINE_TAB_IDS } from "./components/RoutineBottomNav";
import { RoutineActions } from "./RoutineActions";
import { RoutineHeader } from "./RoutineHeader";
import { RoutineTimeline } from "./RoutineTimeline";
import { useRoutineAppState } from "./useRoutineAppState";
import { useRoutineQuickStatsWriter } from "./hooks/useRoutineQuickStatsWriter";
import { useStreakMilestoneCelebration } from "@shared/hooks/useStreakMilestoneCelebration";
import { messages } from "@shared/i18n/uk";

export interface RoutineAppProps {
  onBackToHub?: () => void;
  onGoToHub?: () => void;
  onOpenModule?: (moduleId: string, opts?: { hash?: string }) => void;
  pwaAction?: string | null;
  onPwaActionConsumed?: () => void;
}

export default function RoutineApp({
  onBackToHub,
  onGoToHub,
  onOpenModule,
  pwaAction,
  onPwaActionConsumed,
}: RoutineAppProps = {}) {
  const {
    routine,
    setRoutine,
    isHabitPending,
    storageErrorMsg,
    setStorageErrorMsg,
    mainTab,
    setMainTab,
    quickAddHabitOpen,
    quickAddFocusTick,
    closeQuickAddHabit,
    streakMax,
    calendarData,
    calendarActions,
    handlePullRefresh,
    handlePullRefreshError,
  } = useRoutineAppState({ pwaAction, onPwaActionConsumed, onOpenModule });

  // Віха серії — тиха плашка (O1). Сидить на `streakMax`, а не в
  // `onToggleHabit`, і це навмисно: стрік перетинає поріг і з «відмітити
  // всі» (`onBulkMarkDay`), і після sync із сусіднього пристрою. Хук на
  // похідному значенні ловить усі шляхи разом; обробник ловив би один.
  useStreakMilestoneCelebration(
    "routine",
    streakMax,
    messages.routine.streakMilestone.toast,
  );

  // Keep the Hub routine bento card's quick-stats snapshot in sync with real
  // habits/completions, not just the onboarding demo seed.
  useRoutineQuickStatsWriter({
    habits: routine.habits,
    completions: routine.completions,
    skips: routine.skips,
  });

  return (
    // H: neutral controls even inside the outer ModuleShell accent context.
    // The sole tinted hero and charts choose their Routine tone explicitly.
    <ModuleAccentContext.Provider value={null}>
      {/* `bottom-nav-height-var` — див. FinykApp: навігацію малює модуль,
          тож і змінну висоти для `Sheet` виставляє він. */}
      <MeshBackground className="bottom-nav-height-var">
        {/* `<header>` тут, бо саме Рутина — єдиний модуль, чия шапка
            лежить поза будь-яким landmark-ом. `ModuleShell` загортає
            модуль у `<main>`, АЛЕ для routine свідомо підставляє `<div>`
            (Рутина рендерить власний `<main id="routine-main">` нижче, і
            два `<main>` були б порушенням). Наслідок: у фініка, фізрука й
            їжі шапка потрапляє всередину `<main>`, а тут — нікуди, тож
            «Рутина» і «Звички й події» висіли поза landmark-ами на всіх
            трьох сторінках модуля (axe `region`, свіп 2026-09-16).

            `<header>` не вкладений у main/article/section, тож дає роль
            `banner` — єдиний banner на сторінці (перевірено: ані
            `RootLayout`, ані `ModuleShell` свого не мають). */}
        <header>
          <RoutineHeader onBackToHub={onBackToHub} onGoToHub={onGoToHub} />
        </header>

        <SwipePages
          ids={ROUTINE_TAB_IDS}
          activeId={mainTab}
          onChange={setMainTab}
        >
          <RoutineTimeline
            storageErrorMsg={storageErrorMsg}
            setRoutine={setRoutine}
            onDismissStorageError={() => setStorageErrorMsg(null)}
            calendarData={calendarData}
            calendarActions={calendarActions}
            isHabitPending={isHabitPending}
            mainTab={mainTab}
            routine={routine}
            streakMax={streakMax}
            onPullRefresh={handlePullRefresh}
            onPullRefreshError={handlePullRefreshError}
          />
        </SwipePages>

        <RoutineActions
          mainTab={mainTab}
          setMainTab={setMainTab}
          routine={routine}
          setRoutine={setRoutine}
          quickAddHabitOpen={quickAddHabitOpen}
          quickAddFocusTick={quickAddFocusTick}
          onCloseQuickAddHabit={closeQuickAddHabit}
        />
      </MeshBackground>
    </ModuleAccentContext.Provider>
  );
}
