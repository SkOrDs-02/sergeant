/**
 * Sergeant Design System — useCelebration hook
 *
 * Imperative API around CelebrationModal for screens that want to fire
 * a celebration without managing a `boolean` open-state per call site.
 *
 * Returns:
 * - `celebrate(config)` / `dismiss()` — low-level open/close.
 * - `success`, `achievement`, `goalCompleted`, `levelUp`, `streak`,
 *   `confetti` — type-specific shortcuts with sensible defaults
 *   (auto-close timing, copy, themes).
 * - `CelebrationComponent` — the rendered modal element to drop in
 *   the JSX tree once.
 */

import { useCallback, useState } from "react";
import { CelebrationModal } from "../CelebrationModal";
import type {
  CelebrationConfig,
  ConfettiIntensity,
  ModuleTheme,
} from "../types";

export function useCelebration() {
  const [config, setConfig] = useState<CelebrationConfig | null>(null);

  const celebrate = useCallback((options: CelebrationConfig) => {
    setConfig(options);
  }, []);

  const dismiss = useCallback(() => {
    setConfig(null);
  }, []);

  const success = useCallback(
    (title: string, description?: string) => {
      celebrate({ type: "success", title, description, autoCloseMs: 4500 });
    },
    [celebrate],
  );

  const achievement = useCallback(
    (
      title: string,
      description?: string,
      rewards?: CelebrationConfig["rewards"],
    ) => {
      celebrate({
        type: "achievement",
        title,
        description,
        rewards,
        autoCloseMs: 6000,
      });
    },
    [celebrate],
  );

  const goalCompleted = useCallback(
    (
      title: string,
      value: number | string,
      unit: string,
      theme?: ModuleTheme,
    ) => {
      celebrate({
        type: "goal",
        title,
        value,
        unit,
        theme,
        description: "Ціль досягнуто!",
        autoCloseMs: 5500,
      });
    },
    [celebrate],
  );

  const levelUp = useCallback(
    (
      level: number,
      progress?: { current: number; max: number },
      rewards?: CelebrationConfig["rewards"],
    ) => {
      celebrate({
        type: "levelUp",
        title: `Рівень ${level}!`,
        description: "Ти стаєш сильнішим!",
        value: level,
        unit: "рівень",
        progress,
        rewards,
        autoCloseMs: 6000,
      });
    },
    [celebrate],
  );

  const streak = useCallback(
    (days: number, message?: string) => {
      celebrate({
        type: "streak",
        title: message || `${days} днів поспіль!`,
        value: days,
        unit: "днів",
        description: days >= 30 ? "Ти справжня легенда!" : "Так тримати!",
        theme: "routine",
        autoCloseMs: 5000,
      });
    },
    [celebrate],
  );

  const confetti = useCallback(
    (title: string, description?: string, intensity?: ConfettiIntensity) => {
      celebrate({
        type: "confetti",
        title,
        description,
        confettiIntensity: intensity || "high",
        autoCloseMs: 5500,
      });
    },
    [celebrate],
  );

  const CelebrationComponent = config ? (
    <CelebrationModal {...config} open={true} onClose={dismiss} />
  ) : null;

  return {
    celebrate,
    dismiss,
    success,
    achievement,
    goalCompleted,
    levelUp,
    streak,
    confetti,
    CelebrationComponent,
  };
}
