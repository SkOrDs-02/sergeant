import { useMemo } from "react";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { cn } from "@shared/lib/cn";
import { useMonthlyPlan } from "../../fizruk/hooks/useMonthlyPlan";
import { useWorkoutTemplates } from "../../fizruk/hooks/useWorkoutTemplates";
import { useExerciseCatalog } from "../../fizruk/hooks/useExerciseCatalog";
import { parseDateKey } from "../lib/hubCalendarAggregate";

interface CatalogExercise {
  id: string;
  name?: { uk?: string; en?: string };
  primaryGroup?: string;
  primaryGroupUk?: string;
}

export interface FizrukDayPlanSheetProps {
  dateKey: string | null;
  onClose: () => void;
}

export function FizrukDayPlanSheet({
  dateKey,
  onClose,
}: FizrukDayPlanSheetProps) {
  const { templates } = useWorkoutTemplates();
  const { exercises } = useExerciseCatalog();
  const { getTemplateForDate, setDayTemplate } = useMonthlyPlan();

  const currentTemplateId = dateKey ? getTemplateForDate(dateKey) : null;

  const currentTemplate = useMemo(
    () =>
      currentTemplateId
        ? (templates.find((t) => t.id === currentTemplateId) ?? null)
        : null,
    [currentTemplateId, templates],
  );

  const exerciseList = useMemo<CatalogExercise[]>(() => {
    if (!currentTemplate) return [];
    return ((currentTemplate.exerciseIds || []) as string[])
      .map((id: string) =>
        (exercises as CatalogExercise[]).find((e) => e.id === id),
      )
      .filter((e): e is CatalogExercise => Boolean(e));
  }, [currentTemplate, exercises]);

  const dateLabel = dateKey
    ? parseDateKey(dateKey).toLocaleDateString("uk-UA", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const handleAssign = (templateId: string | null) => {
    if (!dateKey) return;
    setDayTemplate(dateKey, templateId);
  };

  return (
    <Sheet
      open={!!dateKey}
      onClose={onClose}
      title={dateLabel}
      panelClassName="max-w-md"
      zIndex={100}
      footer={
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onClose}
        >
          Закрити
        </Button>
      }
    >
      {dateKey && (
        <div className="space-y-4">
          {currentTemplate ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <SectionHeading as="p" size="xs" variant="subtle">
                    Призначений шаблон
                  </SectionHeading>
                  <p className="text-base font-bold text-text mt-0.5">
                    {currentTemplate.name}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="!text-xs border border-line shrink-0"
                  onClick={() => handleAssign(null)}
                >
                  Зняти
                </Button>
              </div>

              {exerciseList.length > 0 && (
                <div>
                  <SectionHeading
                    as="p"
                    size="xs"
                    variant="subtle"
                    className="mb-1.5"
                  >
                    Вправи ({exerciseList.length})
                  </SectionHeading>
                  <ul className="space-y-1.5">
                    {exerciseList.map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 border border-line bg-panel/60"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                        <span className="text-sm text-text truncate">
                          {ex?.name?.uk || ex?.name?.en || ex.id}
                        </span>
                        {ex?.primaryGroup && (
                          <span className="text-2xs text-subtle shrink-0 ml-auto">
                            {ex.primaryGroupUk || ex.primaryGroup}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              compact
              title="Тренування не призначено"
              description="Обери шаблон нижче, щоб запланувати тренування на цей день."
            />
          )}

          <div>
            <SectionHeading as="p" size="xs" variant="subtle" className="mb-2">
              {currentTemplate ? "Змінити шаблон" : "Обрати шаблон"}
            </SectionHeading>
            {templates.length === 0 ? (
              <p className="text-xs text-subtle">
                Шаблонів поки немає. Створи їх у Фізруку → Тренування.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {templates.map((tpl) => {
                  const isActive = tpl.id === currentTemplateId;
                  const exCount = (tpl.exerciseIds || []).length;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        if (isActive) return;
                        handleAssign(tpl.id);
                      }}
                      className={cn(
                        "w-full text-left rounded-xl px-3 py-2.5 border transition-colors",
                        isActive
                          ? "border-sky-400/50 bg-sky-500/10"
                          : "border-line bg-panel/60 hover:bg-panelHi",
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          isActive
                            ? "text-info-strong dark:text-info"
                            : "text-text",
                        )}
                      >
                        {tpl.name}
                      </p>
                      <p className="text-2xs text-subtle mt-0.5">
                        {exCount}{" "}
                        {exCount === 1
                          ? "вправа"
                          : exCount < 5
                            ? "вправи"
                            : "вправ"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
