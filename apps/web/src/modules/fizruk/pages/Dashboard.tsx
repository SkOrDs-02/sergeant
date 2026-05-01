import { safeWriteLS } from "@shared/lib/storage";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { useMemo, useState } from "react";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useMeasurements } from "../hooks/useMeasurements";
import { useRecovery } from "../hooks/useRecovery";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";
import { useWorkouts } from "../hooks/useWorkouts";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { HeroCard, type HeroCardState } from "../components/dashboard/HeroCard";
import { KpiRow } from "../components/dashboard/KpiRow";
import { RecentWorkoutsSection } from "../components/dashboard/RecentWorkoutsSection";
import { recoveryConflictsForExercise } from "@sergeant/fizruk-domain";
import { workoutDurationSec } from "@sergeant/fizruk-domain";
import { ACTIVE_WORKOUT_KEY } from "@sergeant/fizruk-domain";
import {
  computeDashboardKpis,
  getNextPlanSession,
  listRecentCompletedWorkouts,
} from "@sergeant/fizruk-domain/domain";
import { Card } from "@shared/components/ui/Card";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";

export function Dashboard({
  onOpenPrograms,
  activeProgram,
  todaySession,
  onStartProgramWorkout,
}) {
  const today = new Date().toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const rec = useRecovery();
  const { workouts, createWorkout, addItem } = useWorkouts();
  const { exercises } = useExerciseCatalog();
  const { templates, recentlyUsed, markTemplateUsed } = useWorkoutTemplates();
  const monthlyPlan = useMonthlyPlan();
  const { entries: measurements } = useMeasurements();

  const [planConfirmOpen, setPlanConfirmOpen] = useState(false);
  const [pendingPicks, setPendingPicks] = useState(null);
  const [pendingTemplateId, setPendingTemplateId] = useState(null);

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

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Доброго ранку";
    if (hour < 18) return "Доброго дня";
    return "Доброго вечора";
  }, []);

  const startWorkoutFromPlan = (picks, templateId) => {
    const w = createWorkout();
    for (const ex of picks) {
      const isCardio = ex.primaryGroup === "cardio";
      addItem(w.id, {
        exerciseId: ex.id,
        nameUk: ex?.name?.uk || ex?.name?.en,
        primaryGroup: ex.primaryGroup,
        musclesPrimary: ex?.muscles?.primary || [],
        musclesSecondary: ex?.muscles?.secondary || [],
        type: isCardio ? "distance" : "strength",
        sets: isCardio ? undefined : [{ weightKg: 0, reps: 0 }],
        durationSec: 0,
        distanceM: isCardio ? 0 : 0,
      });
    }
    if (templateId) markTemplateUsed(templateId);
    safeWriteLS(ACTIVE_WORKOUT_KEY, w.id);
    try {
      sessionStorage.setItem("fizruk_workouts_mode", "log");
    } catch {}
    window.location.hash = "#workouts";
  };

  const tryStartPlan = (picks: unknown[], templateId?: string | null) => {
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
          .filter(Boolean);
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
    // otherwise.
    try {
      sessionStorage.setItem("fizruk_workouts_mode", "log");
    } catch {
      /* non-fatal: default view is still reachable */
    }
    window.location.hash = "#workouts";
  };
  const openTemplates = () => {
    try {
      sessionStorage.setItem("fizruk_workouts_mode", "templates");
    } catch {}
    window.location.hash = "#workouts";
  };
  const openPlan = () => {
    window.location.hash = "#plan";
  };

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
        />

        <KpiRow kpis={dashboardKpis} />

        {templates.length > 0 &&
          (() => {
            const quickTemplates =
              recentlyUsed.length > 0 ? recentlyUsed : templates.slice(0, 3);
            return (
              <Card as="section" radius="lg" aria-label="Швидкий старт">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <SectionHeading as="h2" size="sm">
                    Швидкий старт
                  </SectionHeading>
                  <span className="text-2xs text-muted">
                    {recentlyUsed.length > 0
                      ? "Нещодавно використані"
                      : "Останні шаблони"}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {quickTemplates.map((tpl) => {
                    const picks = (tpl.exerciseIds || [])
                      .map((id) => exercises.find((e) => e.id === id))
                      .filter(Boolean);
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        className="w-full text-left flex items-center gap-3 rounded-2xl border border-line bg-bg hover:bg-panelHi p-3 min-h-[52px] transition-colors active:scale-[0.99]"
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
                          <div className="text-sm font-semibold text-text truncate">
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

        {activeProgram && (
          <Card as="section" radius="lg" aria-label="Програма сьогодні">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <SectionHeading as="h2" size="sm">
                  Програма: {activeProgram.name}
                </SectionHeading>
                {todaySession ? (
                  <p className="text-sm font-semibold text-text mt-0.5">
                    {todaySession.name}
                  </p>
                ) : (
                  <p className="text-sm text-subtle mt-0.5">
                    Сьогодні відпочинок 💤
                  </p>
                )}
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-success hover:underline shrink-0"
                onClick={() => onOpenPrograms?.()}
              >
                Програми →
              </button>
            </div>
            {todaySession && (
              <button
                type="button"
                className="w-full py-3 rounded-xl bg-fizruk-strong text-white font-semibold text-sm transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98]"
                onClick={() => {
                  const session =
                    activeProgram.sessions?.[todaySession.sessionKey];
                  if (session && onStartProgramWorkout) {
                    onStartProgramWorkout(session, activeProgram);
                  }
                }}
              >
                Розпочати тренування за програмою
              </button>
            )}
          </Card>
        )}

        <RecentWorkoutsSection
          recent={recentWorkouts}
          onSeeAll={openWorkoutsTab}
        />
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
              variant="ghost"
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
