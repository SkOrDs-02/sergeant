import { Card } from "@shared/components/ui/Card";
import { useLocale } from "@shared/i18n/useLocale";
import type { AdaptiveGoalState } from "../hooks/useAdaptiveNutritionGoal";

interface AdaptiveGoalCardProps {
  state: AdaptiveGoalState;
  onOpenSettings?: (() => void) | undefined;
}

export function AdaptiveGoalCard({
  state,
  onOpenSettings,
}: AdaptiveGoalCardProps) {
  const { messages } = useLocale();
  const text =
    state.mode === "disabled"
      ? "Встановлено вручну. Автокалібрування можна знову ввімкнути в денному плані."
      : state.mode === "profile-needed"
        ? "Додай вагу, зріст, дату народження, стать і рівень активності у профілі."
        : state.mode === "calibrating"
          ? `Калібрую за журналом: ${state.completeDays}/10 повних днів і ${state.weightPoints}/4 зважувань.`
          : "Ціль щотижня звіряється з вагою та фактичним харчуванням. Тренування й щоденна активність уже проявляються у зміні ваги.";

  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="text-style-label text-text">
          {messages.nutrition.adaptiveGoal.heading}
        </div>
        <p className="mt-1 text-style-caption text-muted">{text}</p>
      </div>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="touch-target shrink-0 text-style-caption text-nutrition-strong dark:text-nutrition focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
        >
          {messages.nutrition.adaptiveGoal.edit}
        </button>
      )}
    </Card>
  );
}
