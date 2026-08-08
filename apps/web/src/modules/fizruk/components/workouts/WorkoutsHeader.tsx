import { pluralExercises } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import type { Workout } from "@sergeant/fizruk-domain";
import type { WorkoutsView } from "../../pages/Workouts.types";

export interface WorkoutsHeaderProps {
  view: WorkoutsView;
  activeWorkout: Workout | null;
  finishedCount: number;
  onBack: () => void;
  onAddCatalog: () => void;
}

/**
 * Top header bar for the Workouts page. Renders a back-to-home button
 * for non-home subviews, the contextual title + subtitle, and the
 * "+ Додати" action which is only visible while the catalog is
 * focused.
 */
export function WorkoutsHeader({
  view,
  activeWorkout,
  finishedCount,
  onBack,
  onAddCatalog,
}: WorkoutsHeaderProps) {
  const title =
    view === "catalog"
      ? "Каталог вправ"
      : view === "templates"
        ? "Шаблони"
        : view === "log"
          ? activeWorkout && !activeWorkout.endedAt
            ? "Активне тренування"
            : "Журнал"
          : "Тренування";

  const homeSubtitle =
    activeWorkout && !activeWorkout.endedAt
      ? `Активне · ${(activeWorkout.items || []).length} ${pluralExercises(
          (activeWorkout.items || []).length,
        )}`
      : finishedCount > 0
        ? `Завершено: ${finishedCount}`
        : "Перше тренування — попереду";

  return (
    <div className="flex items-center gap-3 mb-3">
      {view !== "home" ? (
        <button
          type="button"
          className="w-9 h-9 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] -ml-1 rounded-xl flex items-center justify-center text-text hover:bg-panelHi focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          onClick={onBack}
          aria-label="Повернутись до тренувань"
        >
          <Icon name="chevron-left" size="sm" />
        </button>
      ) : null}
      <div className="flex-1">
        <h1 className="text-style-title text-text">{title}</h1>
        {view === "home" ? (
          <p className="text-style-caption text-subtle mt-0.5">
            {homeSubtitle}
          </p>
        ) : null}
      </div>
      {view === "catalog" ? (
        <Button
          module="fizruk"
          size="sm"
          className="h-9 px-4"
          onClick={onAddCatalog}
          aria-label="Додати вправу в каталог"
        >
          + Додати
        </Button>
      ) : null}
    </div>
  );
}
