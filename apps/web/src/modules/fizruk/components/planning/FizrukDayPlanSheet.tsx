/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo } from "react";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useMonthlyPlan } from "../../hooks/useMonthlyPlan";
import { useWorkoutTemplates } from "../../hooks/useWorkoutTemplates";
import { useExerciseCatalog } from "../../hooks/useExerciseCatalog";
import { parseDateKey } from "../../../routine/lib/hubCalendarAggregate";
import { formatUaWeekdayDate } from "@shared/lib/time/uaWeekdayDate";

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

  const dateLabel = dateKey ? formatUaWeekdayDate(parseDateKey(dateKey)) : "";

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
          {messages.actions.close}
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
                    {messages.fizruk.dayPlan.assignedTemplate}
                  </SectionHeading>
                  <p className="text-style-title text-text mt-0.5">
                    {currentTemplate.name}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs! border border-line shrink-0"
                  onClick={() => handleAssign(null)}
                >
                  {messages.fizruk.dayPlan.removeTemplate}
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
                    {messages.fizruk.dayPlan.exercises} ({exerciseList.length})
                  </SectionHeading>
                  <ul className="space-y-1.5">
                    {exerciseList.map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 border border-line bg-panel/60"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-info shrink-0" />
                        <span className="text-style-label text-text truncate">
                          {ex?.name?.uk || ex?.name?.en || ex.id}
                        </span>
                        {ex?.primaryGroup && (
                          <span className="text-style-caption text-subtle shrink-0 ml-auto">
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
              title={messages.fizruk.dayPlan.emptyTitle}
              description={messages.fizruk.dayPlan.emptyDescription}
            />
          )}

          <div>
            <SectionHeading as="p" size="xs" variant="subtle" className="mb-2">
              {currentTemplate
                ? messages.fizruk.dayPlan.changeTemplate
                : messages.fizruk.dayPlan.chooseTemplate}
            </SectionHeading>
            {templates.length === 0 ? (
              <p className="text-style-body text-subtle">
                {messages.fizruk.dayPlan.noTemplates}
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
                        "w-full text-left rounded-xl px-3 py-2.5 border transition-colors min-h-[44px]",
                        isActive
                          ? "border-info/50 bg-info/10"
                          : "border-line bg-panel/60 hover:bg-panelHi",
                      )}
                    >
                      <p
                        className={cn(
                          "text-style-label truncate",
                          isActive
                            ? "text-info-strong dark:text-info"
                            : "text-text",
                        )}
                      >
                        {tpl.name}
                      </p>
                      <p className="text-style-caption text-subtle mt-0.5">
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
