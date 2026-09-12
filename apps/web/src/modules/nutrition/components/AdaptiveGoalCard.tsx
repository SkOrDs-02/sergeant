import type { AdaptiveGoalState } from "../hooks/useAdaptiveNutritionGoal";
import { nutritionPageMessages as nutritionCopy } from "@shared/i18n/uk.nutrition";

interface AdaptiveGoalCardProps {
  state: AdaptiveGoalState;
  onOpenSettings?: (() => void) | undefined;
}

/**
 * Дашборд показує рядок лише тоді, коли є що робити: `active` і
 * `disabled` рендерять `null` — 2026-09-11, вмикач переїхав у
 * Налаштування → Їжа, а «увімкнено й рахує» не потребує окремої картки
 * на кожен день. `calibrating` і `profile-needed` лишаються компактним
 * інформаційним рядком (не повною Card), бо це стани, де людині
 * справді може знадобитись дія.
 */
export function AdaptiveGoalCard({
  state,
  onOpenSettings,
}: AdaptiveGoalCardProps) {
  if (state.mode === "active" || state.mode === "disabled") {
    return null;
  }

  const text =
    state.mode === "profile-needed"
      ? "Додай вагу, зріст, дату народження, стать і рівень активності у профілі."
      : `Калібрую за журналом: ${state.completeDays}/10 повних днів і ${state.weightPoints}/4 зважувань.`;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-panel/60 px-3 py-2">
      <div className="min-w-0">
        <div className="text-style-label text-text">
          {nutritionCopy.adaptiveGoal.heading}
        </div>
        <p className="mt-1 text-style-caption text-muted">{text}</p>
      </div>
      {/* Немає окремого коллбека навігації в профіль (`onGoToProfile`) —
          лишаємо наявний `onOpenSettings`, як і до переносу вмикача в
          Налаштування → Їжа. */}
      {state.mode === "profile-needed" && onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="touch-target shrink-0 text-style-caption text-nutrition-strong dark:text-nutrition focus:outline-none focus-visible:ring-2 focus-visible:ring-nutrition/60"
        >
          {nutritionCopy.adaptiveGoal.edit}
        </button>
      )}
    </div>
  );
}
