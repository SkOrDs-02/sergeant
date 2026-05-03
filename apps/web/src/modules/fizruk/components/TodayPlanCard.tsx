import { useMemo, useState } from "react";
import { safeWriteLS } from "@shared/lib/storage";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import {
  ACTIVE_WORKOUT_KEY,
  recoveryConflictsForExercise,
} from "@sergeant/fizruk-domain";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import { useMonthlyPlan } from "../hooks/useMonthlyPlan";
import { useRecovery } from "../hooks/useRecovery";
import { useWorkouts } from "../hooks/useWorkouts";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";

const SELECTED_TEMPLATE_KEY = "fizruk_selected_template_id_v1";

export function TodayPlanCard({
  onOpenCalendar,
}: {
  onOpenCalendar?: () => void;
}) {
  const rec = useRecovery();
  const { exercises, primaryGroupsUk } = useExerciseCatalog();
  const { templates, markTemplateUsed } = useWorkoutTemplates();
  const monthlyPlan = useMonthlyPlan();
  const { workouts, createWorkout, addItem } = useWorkouts();

  const [selectedTemplateId, setSelectedTemplateId] = useLocalStorageState(
    SELECTED_TEMPLATE_KEY,
    "",
    { raw: true },
  );
  const [planConfirmOpen, setPlanConfirmOpen] = useState(false);
  const [pendingPicks, setPendingPicks] = useState<unknown[] | null>(null);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    null,
  );

  const effectiveTemplateId = monthlyPlan.todayTemplateId || selectedTemplateId;

  const plan = useMemo(() => {
    const tpl = templates.find((t) => t.id === effectiveTemplateId);
    const picked = tpl
      ? tpl.exerciseIds
          .map((id) => exercises.find((e) => e.id === id))
          .filter((e): e is NonNullable<typeof e> => Boolean(e))
      : [];
    return { picked, templateName: tpl?.name || "" };
  }, [effectiveTemplateId, templates, exercises]);

  const closePlanConfirm = () => {
    setPlanConfirmOpen(false);
    setPendingPicks(null);
    setPendingTemplateId(null);
  };

  const startWorkoutFromPlan = (
    picks: unknown[],
    templateId?: string | null,
  ) => {
    const w = createWorkout();
    for (const ex of picks as Array<{
      id: string;
      primaryGroup?: string;
      name?: { uk?: string; en?: string };
      muscles?: { primary?: string[]; secondary?: string[] };
    }>) {
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
      (ex) =>
        recoveryConflictsForExercise(
          ex as { muscles?: { primary?: string[]; secondary?: string[] } },
          rec.by,
        ).hasWarning,
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

  return (
    <>
      <Card radius="lg" padding="lg">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-style-caption text-subtle">План на сьогодні</div>
          {onOpenCalendar && (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline shrink-0"
              onClick={onOpenCalendar}
            >
              Календар
            </button>
          )}
        </div>
        {monthlyPlan.todayTemplateId && (
          <p className="text-xs text-success/90 mb-2">
            Шаблон з місячного плану на сьогодні.
          </p>
        )}
        <div className="rounded-2xl border border-line bg-panelHi px-3">
          <SectionHeading as="div" size="xs" className="pt-2">
            Мій шаблон
          </SectionHeading>
          <select
            className="input-focus-fizruk w-full min-h-[44px] bg-transparent text-sm text-text rounded-xl"
            value={selectedTemplateId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedTemplateId(v);
              safeWriteLS(SELECTED_TEMPLATE_KEY, v);
            }}
            aria-label="Обрати збережений шаблон тренування"
          >
            <option value="">
              {templates.length === 0 ? "— немає шаблонів —" : "Оберіть шаблон"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {templates.length === 0 && (
          <div className="mt-3 text-sm text-subtle text-center py-2">
            Створи шаблон у розділі{" "}
            <button
              type="button"
              className="font-semibold text-text underline"
              onClick={() => {
                try {
                  sessionStorage.setItem("fizruk_workouts_mode", "templates");
                } catch {}
                window.location.hash = "#workouts";
              }}
            >
              Тренування → Шаблони
            </button>
          </div>
        )}

        {!workouts?.length ? (
          <div className="text-sm text-subtle text-center py-4">
            Додай перше тренування, щоб статистика була точнішою
          </div>
        ) : null}

        {effectiveTemplateId ? (
          <div className="mt-4">
            <div className="text-xs text-subtle mb-2">
              Вправи з шаблону
              {plan.templateName ? ` «${plan.templateName}»` : ""}:
            </div>
            {plan.picked.length ? (
              <div className="space-y-2">
                {plan.picked.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    className="w-full text-left border border-line rounded-2xl p-3 min-h-[44px] bg-bg hover:bg-panelHi transition-colors"
                    onClick={() => {
                      window.location.hash = `#exercise/${ex.id}`;
                    }}
                  >
                    <div className="text-style-label text-text truncate">
                      {ex?.name?.uk || ex?.name?.en}
                    </div>
                    <div className="text-xs text-subtle mt-0.5">
                      {primaryGroupsUk?.[ex.primaryGroup] || ex.primaryGroup}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-subtle text-center py-6">
                У шаблоні немає вправ або вправи видалені з каталогу
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 text-sm text-subtle text-center py-6">
            Оберіть шаблон, щоб побачити вправи
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button
            className="flex-1 h-12 min-h-[44px]"
            onClick={() => tryStartPlan(plan.picked, effectiveTemplateId)}
            disabled={!plan.picked.length}
          >
            Стартувати тренування
          </Button>
          <Button
            variant="ghost"
            className="h-12 min-h-[44px] px-4"
            onClick={() => {
              window.location.hash = "#workouts";
            }}
          >
            Журнал
          </Button>
        </div>
      </Card>

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
                const picks = pendingPicks?.length ? pendingPicks : plan.picked;
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
    </>
  );
}
