/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import type { FizrukPage } from "../shell/fizrukRoute";
// FizrukPage is referenced in the JSDoc above and in the onNavigate type
// signature — keep the import even when TS doesn't track JSDoc refs.

import { safeWriteLS, safeWriteSS } from "@shared/lib/storage/storage";
import {
  formatKyivNominativeDate,
  getKyivGreeting,
} from "@shared/lib/time/greeting";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { useMemo, useState } from "react";
import type { Insight } from "@shared/lib/insights/types";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useMeasurements } from "../hooks/useMeasurements";
import { useRecovery } from "../hooks/useRecovery";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";
import { useWorkouts } from "../hooks/useWorkouts";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { HeroCard, type HeroCardState } from "../components/dashboard/HeroCard";
import { PrBadge } from "../components/dashboard/PrBadge";
import { RecentWorkoutsSection } from "../components/dashboard/RecentWorkoutsSection";
import { StatusStrip } from "../components/dashboard/StatusStrip";
import { recoveryConflictsForExercise } from "@sergeant/fizruk-domain";
import { workoutDurationSec } from "@sergeant/fizruk-domain";
import { ACTIVE_WORKOUT_KEY } from "@sergeant/fizruk-domain";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";
import {
  computeDashboardKpis,
  getNextPlanSession,
  listRecentCompletedWorkouts,
} from "@sergeant/fizruk-domain/domain";
import type {
  ProgramSessionDef,
  TrainingProgramDef,
} from "@sergeant/fizruk-domain/domain";
import { Card } from "@shared/components/ui/Card";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { useAuth } from "../../../core/auth/AuthContext";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { useRestDayOverdueInsight } from "../hooks/useRestDayOverdueInsight";
import { usePrPendingInsight } from "../hooks/usePrPendingInsight";
import { usePrLatest } from "../hooks/usePrLatest";

interface DashboardTodaySession {
  sessionKey: string;
  name: string;
}

interface DashboardProps {
  onOpenPrograms?: () => void;
  activeProgram: TrainingProgramDef | null;
  todaySession: DashboardTodaySession | null;
  onStartProgramWorkout?: (
    session: ProgramSessionDef,
    program: TrainingProgramDef,
  ) => void;
  /**
   * Path-based navigation handler injected by `FizrukRouter`. Each of the
   * five quick-action shortcuts on the Dashboard («Лог», «Шаблони»,
   * «План», «Прогрес», «Тіло») needs to switch the Fizruk page without
   * touching `window.location.hash` — the module migrated to react-router
   * in initiative 0006 §Phase 2.c (#2541) and hash assignments became a
   * silent no-op (pathname unchanged ⇒ no re-render). Accepts the wider
   * `FizrukPage | string` shape to mirror `useFizrukRoute().navigate`. The
   * «План» CTA was a hash “#plan”, then a silent no-op via
   * `parseFizrukSegments`; it now routes to the Workouts tab, which
   * absorbed the planning surface.
   */
  onNavigate: (target: FizrukPage | string) => void;
}

export function Dashboard({
  onOpenPrograms,
  activeProgram,
  todaySession,
  onStartProgramWorkout,
  onNavigate,
}: DashboardProps) {
  // Use the shared nominative formatter so weekday matches HubHeader
  // ("Пʼятниця" not "пʼятницю") and the Kyiv timezone is anchored correctly.
  const today = useMemo(formatKyivNominativeDate, []);
  const { user } = useAuth();
  const rec = useRecovery();
  const {
    workouts,
    loaded: workoutsLoaded,
    createWorkout,
    addItem,
  } = useWorkouts();
  const { exercises } = useExerciseCatalog();
  const {
    templates,
    loaded: templatesLoaded,
    recentlyUsed,
    markTemplateUsed,
  } = useWorkoutTemplates();
  const monthlyPlan = useMonthlyPlan();
  const { entries: measurements } = useMeasurements();

  const [planConfirmOpen, setPlanConfirmOpen] = useState(false);
  const [pendingPicks, setPendingPicks] = useState<RawExerciseDef[] | null>(
    null,
  );
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    null,
  );

  const closePlanConfirm = () => {
    setPlanConfirmOpen(false);
    setPendingPicks(null);
    setPendingTemplateId(null);
  };

  const avgDurationSec = useMemo(() => {
    const done = (workouts || []).filter((w) => w.endedAt);
    if (!done.length) return 0;
    const sum = done.reduce((s, w) => s + workoutDurationSec(w), 0);
    return Math.round(sum / done.length);
  }, [workouts]);

  // Use the shared Kyiv-anchored greeting so thresholds match HubHeader
  // (5/12/17/22 buckets including "Доброї ночі" for 22:00–05:00).
  const greeting = useMemo(getKyivGreeting, []);

  const startWorkoutFromPlan = (
    picks: RawExerciseDef[],
    templateId?: string | null,
  ) => {
    const w = createWorkout();
    for (const ex of picks) {
      const isCardio = ex.primaryGroup === "cardio";
      addItem(w.id, {
        exerciseId: ex.id,
        nameUk: ex?.name?.uk || ex?.name?.en || ex.id,
        primaryGroup: ex.primaryGroup || "",
        musclesPrimary: ex?.muscles?.primary || [],
        musclesSecondary: ex?.muscles?.secondary || [],
        type: isCardio ? "distance" : "strength",
        ...(isCardio ? {} : { sets: [{ weightKg: 0, reps: 0 }] }),
        durationSec: 0,
        distanceM: 0,
      });
    }
    if (templateId) markTemplateUsed(templateId);
    safeWriteLS(ACTIVE_WORKOUT_KEY, w.id);
    // non-fatal: workouts tab remains reachable in its default mode
    safeWriteSS("fizruk_workouts_mode", "log");
    onNavigate("workouts");
  };

  const tryStartPlan = (
    picks: RawExerciseDef[],
    templateId?: string | null,
  ) => {
    if (!picks?.length) return;
    const risky = picks.some(
      (ex) => recoveryConflictsForExercise(ex, rec.by).hasWarning,
    );
    if (risky) {
      setPendingPicks(picks);
      setPendingTemplateId(templateId || null);
      setPlanConfirmOpen(true);
      return;
    }
    setPendingPicks(null);
    setPendingTemplateId(null);
    startWorkoutFromPlan(picks, templateId);
  };

  const primaryAction = useMemo(() => {
    if (activeProgram && todaySession) {
      const session = activeProgram.sessions?.[todaySession.sessionKey];
      if (session) {
        return {
          kind: "program" as const,
          label: todaySession.name,
          hint: activeProgram.name,
          exerciseCount: (session.exerciseIds || []).length,
          sessionKey: todaySession.sessionKey,
        };
      }
    }
    const fallbackTemplateId =
      monthlyPlan.todayTemplateId ||
      recentlyUsed[0]?.id ||
      templates[0]?.id ||
      null;
    if (fallbackTemplateId) {
      const tpl = templates.find((t) => t.id === fallbackTemplateId);
      if (tpl) {
        const picks = (tpl.exerciseIds || [])
          .map((id) => exercises.find((e) => e.id === id))
          .filter((e): e is NonNullable<typeof e> => Boolean(e));
        if (picks.length > 0) {
          let hint: string | null = null;
          if (monthlyPlan.todayTemplateId === tpl.id) {
            hint = "З місячного плану";
          } else if (recentlyUsed[0]?.id === tpl.id) {
            hint = "Останнє тренування";
          }
          return {
            kind: "template" as const,
            label: tpl.name,
            hint,
            exerciseCount: picks.length,
            templateId: tpl.id,
            picks,
          };
        }
      }
    }
    return null;
  }, [
    activeProgram,
    todaySession,
    monthlyPlan.todayTemplateId,
    recentlyUsed,
    templates,
    exercises,
  ]);

  // Rule 5.3: primitive result + trivial arithmetic → no useMemo needed.
  const estimatedDurationMin = !primaryAction?.exerciseCount
    ? null
    : avgDurationSec > 300
      ? Math.max(10, Math.round(avgDurationSec / 60 / 5) * 5)
      : Math.max(10, primaryAction.exerciseCount * 8);

  const handleStartPrimary = () => {
    if (!primaryAction) return;
    if (primaryAction.kind === "program") {
      const session = activeProgram?.sessions?.[primaryAction.sessionKey];
      if (session && onStartProgramWorkout) {
        onStartProgramWorkout(session, activeProgram);
      }
      return;
    }
    tryStartPlan(primaryAction.picks, primaryAction.templateId);
  };

  // ── Hero state resolution ───────────────────────────────────────
  // Priority: active session > today by program/plan > fallback
  // template (recentlyUsed) > upcoming scheduled day > empty nudge.
  // Each branch returns a fully-typed `HeroCardState` so the hero can
  // decide on layout without re-deriving any data.
  const activeWorkoutId = useActiveFizrukWorkout();

  // ── Insight triggers ────────────────────────────────────────────────
  // Max 2 shown simultaneously; PR-pending takes priority over rest-day.
  const restDayInsight = useRestDayOverdueInsight(workouts, workoutsLoaded);
  const prPendingInsight = usePrPendingInsight({
    workouts,
    loaded: workoutsLoaded,
    activeWorkoutId,
  });
  // Phase 6.7 — persistent PR summary surfaced on the hero corner.
  // Independent of the proximity-driven `pr-pending` insight: this
  // is a "what did you actually hit recently" read-only summary.
  const prLatest = usePrLatest({ workouts, loaded: workoutsLoaded });
  // Collect non-null insights respecting priority order.
  const activeInsights = useMemo((): Insight[] => {
    const out: Insight[] = [];
    if (prPendingInsight) out.push(prPendingInsight);
    if (restDayInsight && out.length < 2) out.push(restDayInsight);
    return out;
  }, [prPendingInsight, restDayInsight]);

  const activeWorkout = useMemo(() => {
    if (!activeWorkoutId) return null;
    const w = (workouts || []).find(
      (it) => it && it.id === activeWorkoutId && !it.endedAt,
    );
    return w || null;
  }, [activeWorkoutId, workouts]);

  const nextPlanSession = useMemo(() => {
    if (!templates?.length) return null;
    try {
      return getNextPlanSession({
        plan: monthlyPlan,
        templatesById: templates,
      });
    } catch {
      return null;
    }
  }, [monthlyPlan, templates]);

  const dashboardKpis = useMemo(
    () =>
      computeDashboardKpis(workouts || [], {
        measurements: measurements || [],
      }),
    [workouts, measurements],
  );

  const recentWorkouts = useMemo(
    () => listRecentCompletedWorkouts(workouts || [], { limit: 3 }),
    [workouts],
  );

  const heroState: HeroCardState = useMemo(() => {
    if (activeWorkout?.startedAt) {
      return {
        kind: "active",
        startedAtIso: activeWorkout.startedAt,
        itemsCount: (activeWorkout.items || []).length,
      };
    }
    if (primaryAction) {
      return {
        kind: "today",
        label: primaryAction.label,
        exerciseCount: primaryAction.exerciseCount,
        estimatedMin: estimatedDurationMin,
        hint: primaryAction.hint,
      };
    }
    if (nextPlanSession && !nextPlanSession.isToday) {
      return {
        kind: "upcoming",
        label: nextPlanSession.templateName,
        daysFromNow: nextPlanSession.daysFromNow,
        dateKey: nextPlanSession.dateKey,
        exerciseCount: nextPlanSession.exerciseCount,
      };
    }
    return { kind: "empty", hasTemplates: (templates?.length || 0) > 0 };
  }, [
    activeWorkout,
    primaryAction,
    nextPlanSession,
    templates,
    estimatedDurationMin,
  ]);

  const openWorkoutsTab = () => {
    // `Workouts` defaults to the `home` view and only switches to the
    // journal/log when the `fizruk_workouts_mode` hint is primed in
    // sessionStorage (see `apps/web/src/modules/fizruk/pages/Workouts.tsx`).
    // When the hero CTA resumes an active session we want the user to
    // land directly on the log — one extra tap is a real UX regression
    // otherwise. non-fatal: default view is still reachable.
    safeWriteSS("fizruk_workouts_mode", "log");
    onNavigate("workouts");
  };
  const openTemplates = () => {
    safeWriteSS("fizruk_workouts_mode", "templates");
    onNavigate("workouts");
  };
  const openPlan = () => {
    // «План» tab was dissolved into the Workouts tab — "plan" is not a
    // valid FizrukPage (parseFizrukSegments falls back to dashboard, so
    // onNavigate("plan") was a silent no-op). Land on the Workouts home
    // overview, which now owns the planning/schedule surface.
    onNavigate("workouts");
  };
  const openProgress = () => {
    onNavigate("progress");
  };
  const openBody = () => {
    onNavigate("body");
  };

  // Gate the data-derived hero/KPI body on hydration for signed-in users.
  // The SQLite read path boots only when a userId is present
  // (`useFizrukSqliteReadBoot`), so `workoutsLoaded` flips to true only for
  // authed users; gating guests on it would trap them in a permanent
  // skeleton (the empty hero is their correct, final state). For authed
  // returning users, render a skeleton until the warm cache
  // (`workoutsLoaded`) and templates LS read (`templatesLoaded`) settle —
  // otherwise they see a «План порожній» / «Серія 0 днів» flash before
  // real data lands (matches the sibling Workouts page skeleton pattern).
  if (user?.id && (!workoutsLoaded || !templatesLoaded)) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div
          className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4"
          role="status"
          aria-live="polite"
          aria-label="Завантаження дашборду"
        >
          <Skeleton className="h-44 w-full" variant="card" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <HeroCard
          state={heroState}
          greeting={greeting}
          today={today}
          onResume={openWorkoutsTab}
          onStartToday={handleStartPrimary}
          onOpenPlan={openPlan}
          onOpenTemplates={openTemplates}
          onOpenPrograms={() => onOpenPrograms?.()}
          cornerSlot={<PrBadge pr={prLatest} />}
        />

        {activeInsights.map((insight) => (
          <InsightCard
            key={insight.id}
            id={insight.id}
            title={insight.title}
            subtitle={insight.subtitle}
            onActivate={() => {
              if (insight.action.type === "navigate") {
                onNavigate("workouts");
              }
            }}
          />
        ))}

        <StatusStrip
          kpis={dashboardKpis}
          recovery={{ avoid: rec.avoid }}
          onOpenBody={openBody}
          onOpenProgress={openProgress}
          onOpenWorkouts={openWorkoutsTab}
        />

        {templates.length > 0 &&
          (() => {
            const quickTemplates =
              recentlyUsed.length > 0 ? recentlyUsed : templates.slice(0, 3);
            return (
              <Card
                as="section"
                prominence="glass"
                radius="r-lg"
                aria-label="Швидкий старт"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <SectionHeading as="h2" size="sm">
                    Швидкий старт
                  </SectionHeading>
                  <span className="text-style-caption text-muted">
                    {recentlyUsed.length > 0
                      ? "Нещодавно використані"
                      : "Останні шаблони"}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {quickTemplates.map((tpl) => {
                    const picks = (tpl.exerciseIds || [])
                      .map((id) => exercises.find((e) => e.id === id))
                      .filter((e): e is RawExerciseDef => Boolean(e));
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        className="w-full text-left flex items-center gap-3 rounded-r-lg hover:bg-panelHi p-3 min-h-[52px] transition-colors active:scale-[0.99]"
                        onClick={() => tryStartPlan(picks, tpl.id)}
                        disabled={!picks.length}
                      >
                        <div
                          className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success shrink-0"
                          aria-hidden
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-style-label text-text truncate">
                            {tpl.name}
                          </div>
                          <div className="text-xs text-subtle mt-0.5">
                            {picks.length > 0
                              ? `${picks.length} вправ`
                              : "Немає вправ у каталозі"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })()}

        {/*
          The «Програма сьогодні» card used to live here, but it duplicated
          what the Hero already shows in the `today` state and is now
          surfaced from the `Тренування` tab where programs live. Removed
          to keep the overview an index instead of a wall of CTAs.
          —
          Hide the «Останні тренування» card on first-run (no completed
          workouts) — the empty-state copy duplicates what the hero CTA
          already nudges toward and added noise to an otherwise empty
          dashboard. Once the user logs at least one workout the section
          renders normally with the recent rows.
        */}
        {recentWorkouts.length > 0 && (
          <RecentWorkoutsSection
            recent={recentWorkouts}
            onSeeAll={openWorkoutsTab}
          />
        )}
      </div>

      <Sheet
        open={planConfirmOpen}
        onClose={closePlanConfirm}
        title="Увага"
        panelClassName="fizruk-sheet max-w-4xl"
        zIndex={100}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 h-12 min-h-[44px]"
              onClick={closePlanConfirm}
            >
              Скасувати
            </Button>
            <Button
              className="flex-1 h-12 min-h-[44px]"
              onClick={() => {
                const picks = pendingPicks ?? [];
                const templateId = pendingTemplateId;
                closePlanConfirm();
                startWorkoutFromPlan(picks, templateId);
              }}
            >
              Продовжити
            </Button>
          </div>
        }
      >
        <p className="text-sm text-subtle leading-relaxed">
          У цьому шаблоні є вправи на мʼязи, які ще відновлюються. Продовжити
          старт тренування?
        </p>
      </Sheet>
    </div>
  );
}
