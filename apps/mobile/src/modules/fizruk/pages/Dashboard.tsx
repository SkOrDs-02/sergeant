/**
 * Fizruk / Dashboard — mobile port (Phase 6 · Dashboard PR).
 *
 * Mobile-side counterpart of `apps/web/src/modules/fizruk/pages/
 * Dashboard.tsx` (724 LOC). The port keeps the page thin by
 * delegating every numeric aggregation to pure helpers in
 * `@sergeant/fizruk-domain/domain/dashboard` so web and mobile share
 * the same KPI / PR / "next session" semantics — and so each helper is
 * independently covered by vitest.
 *
 * Composition (top → bottom):
 *  1. Greeting + localised date.
 *  2. `HeroCard` — active workout (resume CTA), today's / upcoming
 *     planned session, or an empty-state nudge when nothing is
 *     scheduled.
 *  3. `KpiRow` — streak / weekly volume / weight delta over the
 *     configurable window (30 days by default).
 *  4. `QuickLinksRow` — grid of sibling Fizruk screens
 *     (Plan · Programs · Progress · Measurements · Workouts · Body ·
 *     Atlas). The set is guarded against drift in the router catalogue
 *     by `fizrukDashboardQuickLinkCoverage()`.
 *  5. `RecentWorkoutsSection` + `RecentPRsSection` — history summary.
 *
 * All mutations live in their respective feature hooks. This page
 * only **reads** from `useFizrukWorkouts`, `useMeasurements`,
 * `useMonthlyPlan`, `useWorkoutTemplates`, and the active-workout
 * slot via `useActiveFizrukWorkout` — exactly what `packages/
 * fizruk-domain/src/domain/dashboard/*` expects as inputs.
 */

import {
  computeDashboardKpis,
  getNextPlanSession,
  computeTopPRs,
  listRecentCompletedWorkouts,
  type DashboardKpis,
  type DashboardNextSession,
  type DashboardPRItem,
  type DashboardRecentWorkout,
} from "@sergeant/fizruk-domain/domain";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { hapticTap } from "@sergeant/shared";

import {
  HeroCard,
  KpiRow,
  QuickLinksRow,
  RecentPRsSection,
  RecentWorkoutsSection,
  fizrukDashboardQuickLinkCoverage,
} from "../components/dashboard";
import { useActiveFizrukWorkout } from "../hooks/useActiveFizrukWorkout";
import { useFizrukWorkouts } from "../hooks/useFizrukWorkouts";
import { useMeasurements } from "../hooks/useMeasurements";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";
import {
  FIZRUK_PAGES,
  fizrukRouteFor,
  type FizrukPage,
} from "../shell/fizrukRoute";

// Re-exported so existing call-sites (`Dashboard.test.tsx` and future
// analytics) keep working against the same named surface the stub
// shipped with.
export { fizrukDashboardQuickLinkCoverage };

/**
 * Legacy coverage helper kept as a re-export so existing tests /
 * callers importing `fizrukNavCardCoverage` from the stub don't
 * silently break. The semantics are unchanged from the stub — every
 * non-dashboard page must be reachable from the Dashboard.
 */
export function fizrukNavCardCoverage(): {
  missing: readonly FizrukPage[];
  extras: readonly FizrukPage[];
} {
  const expected = new Set<FizrukPage>(
    FIZRUK_PAGES.filter((p) => p !== "dashboard"),
  );
  const actual = new Set<FizrukPage>();
  // The dashboard covers every non-dashboard page through a
  // combination of the `QuickLinksRow` tiles + the hero CTA
  // (which always lands in `/fizruk/workouts`) + the "Усі тренування"
  // link in `RecentWorkoutsSection`. `exercise` is reached via
  // Workouts / Atlas detail routes.
  const quickCoverage = fizrukDashboardQuickLinkCoverage();
  for (const id of FIZRUK_PAGES) {
    if (id === "dashboard") continue;
    if (id === "exercise") {
      // exercise is a detail route, reached via Workouts / Atlas.
      actual.add(id);
      continue;
    }
    if (!quickCoverage.missing.includes(id)) actual.add(id);
  }
  const missing = [...expected].filter((id) => !actual.has(id));
  const extras = [...actual].filter((id) => !expected.has(id));
  return { missing, extras };
}

function formatToday(now: Date): string {
  try {
    return now.toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return now.toDateString();
  }
}

export interface DashboardProps {
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

export function Dashboard({
  testID = "fizruk-dashboard",
}: DashboardProps = {}) {
  const { workouts } = useFizrukWorkouts();
  const { entries: measurements } = useMeasurements();
  const { state: planState } = useMonthlyPlan();
  const { templates } = useWorkoutTemplates();

  const activeWorkoutStartedAt = useMemo(() => {
    // Active workout = latest workout with no `endedAt`. Keeping this
    // inference here (rather than in the hook) stays consistent with
    // how the web page derives it from the workouts list.
    for (const w of workouts) {
      if (!w.endedAt) return w.startedAt ?? null;
    }
    return null;
  }, [workouts]);

  const { activeWorkoutId, elapsedSec } = useActiveFizrukWorkout({
    startedAt: activeWorkoutStartedAt,
  });

  const todayLabel = useMemo(() => formatToday(new Date()), []);

  const kpis: DashboardKpis = useMemo(
    () =>
      computeDashboardKpis(workouts, {
        measurements,
      }),
    [workouts, measurements],
  );

  const nextSession: DashboardNextSession | null = useMemo(
    () =>
      getNextPlanSession({
        plan: planState,
        templatesById: templates,
      }),
    [planState, templates],
  );

  const topPRs: DashboardPRItem[] = useMemo(
    () => computeTopPRs(workouts, { limit: 3 }),
    [workouts],
  );

  const recent: DashboardRecentWorkout[] = useMemo(
    () => listRecentCompletedWorkouts(workouts, { limit: 3 }),
    [workouts],
  );

  const onHeroPrimary = useCallback(() => {
    hapticTap();
    // When a workout is active, `workouts` is the entry point the
    // mobile layer uses to re-open the session. When a plan session is
    // scheduled, `plan` is the planning context. Otherwise, the
    // workouts catalogue is the natural next step.
    if (activeWorkoutId) {
      router.push(fizrukRouteFor("workouts"));
      return;
    }
    if (nextSession && !nextSession.isToday) {
      router.push(fizrukRouteFor("plan"));
      return;
    }
    router.push(fizrukRouteFor("workouts"));
  }, [activeWorkoutId, nextSession]);

  const onQuickNavigate = useCallback((_page: FizrukPage, href: string) => {
    hapticTap();
    router.push(href);
  }, []);

  const onSeeAllWorkouts = useCallback(() => {
    hapticTap();
    router.push(fizrukRouteFor("workouts"));
  }, []);

  return (
    <SafeAreaView
      className="flex-1 bg-bg dark:bg-bg"
      edges={["bottom"]}
      testID={testID}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 14 }}
        testID={`${testID}-scroll`}
      >
        <View>
          <Text className="text-[22px] font-bold text-fg">Сьогодні</Text>
          <Text
            accessibilityRole="text"
            className="text-sm text-fg-muted capitalize"
          >
            {todayLabel}
          </Text>
        </View>

        <HeroCard
          activeWorkoutId={activeWorkoutId}
          elapsedSec={elapsedSec ?? 0}
          nextSession={nextSession}
          onPrimaryPress={onHeroPrimary}
          testID={`${testID}-hero`}
        />

        <KpiRow kpis={kpis} testID={`${testID}-kpis`} />

        <QuickLinksRow
          onNavigate={onQuickNavigate}
          testID={`${testID}-quicklinks`}
        />

        <RecentWorkoutsSection
          recent={recent}
          onSeeAll={onSeeAllWorkouts}
          testID={`${testID}-recent`}
        />

        <RecentPRsSection prs={topPRs} testID={`${testID}-prs`} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default Dashboard;
