/**
 * Sergeant Design System — CelebrationModal palette + intensity tables
 *
 * Pure data: per-module confetti palettes, modal-card backgrounds, and
 * the `low | medium | high` → particle-count map consumed by the
 * confetti hook.
 */

import type { ConfettiIntensity, ModuleTheme } from "./types";

export const MODULE_COLORS: Record<ModuleTheme, string[]> = {
  finyk: ["#10B981", "#14B8A6", "#059669", "#34D399"],
  fizruk: ["#14B8A6", "#0D9488", "#2DD4BF", "#0F766E"],
  routine: ["#F97066", "#FB923C", "#F59E0B", "#EF4444"],
  nutrition: ["#84CC16", "#A3E635", "#65A30D", "#BEF264"],
  default: ["#10B981", "#F97066", "#84CC16", "#14B8A6"],
};

export const MODULE_BG_COLORS: Record<ModuleTheme, string> = {
  finyk: "#ecfdf5",
  fizruk: "#f0fdfa",
  routine: "#fff5f3",
  nutrition: "#f8fee7",
  default: "#f0fdf4",
};

export const CONFETTI_COUNTS: Record<ConfettiIntensity, number> = {
  low: 20,
  medium: 40,
  high: 60,
};
