import type { ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { safeReadStringLS } from "@shared/lib/storage";
import {
  STORAGE_KEYS,
  selectModulePreview,
  type ModulePreview,
} from "@sergeant/shared";

export interface ModuleConfig {
  icon: ReactNode;
  label: string;
  emoji: string;
  module: string;
  iconClass: string;
  accentClass: string;
  cardBg: string;
  description: string;
  hasGoal: boolean;
  emptyLabel: string;
  getPreview: () => ModulePreview;
}

export type ModuleId = ModuleAccent;

/**
 * Per-module bento-card configuration: icon glyph, label/description,
 * Tailwind palette tokens, goal-progress flag, and a `getPreview()` reader
 * that pulls the latest "quick stats" snapshot from localStorage and
 * normalizes it via `selectModulePreview` (shared module).
 *
 * Keep this in sync with `DASHBOARD_MODULE_LABELS` in `@sergeant/shared` —
 * those labels are the canonical UA strings; the duplicate `label` here is
 * a render-time convenience only.
 */
export const MODULE_CONFIGS: Record<ModuleId, ModuleConfig> = {
  finyk: {
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M6 12h.01M6 16h.01M10 8h8M10 12h8M10 16h8" />
      </svg>
    ),
    label: "Фінік",
    emoji: "\uD83D\uDCB0",
    module: "finyk",
    iconClass: "bg-finyk-soft text-finyk dark:bg-finyk-surface-dark/15",
    accentClass: "bg-finyk",
    cardBg:
      "bg-finyk-soft/40 dark:bg-finyk-surface-dark/10 dark:border-finyk-border-dark/25",
    description: "Транзакції та бюджети",
    hasGoal: false,
    emptyLabel: "Почни тут \u2192",
    getPreview: () =>
      selectModulePreview(
        "finyk",
        safeReadStringLS(STORAGE_KEYS.FINYK_QUICK_STATS),
      ),
  },
  fizruk: {
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6.5 6.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0" />
        <path d="M3 20v-1a7 7 0 0 1 7-7" />
        <path d="M14 14l2 2 4-4" />
      </svg>
    ),
    label: "Фізрук",
    emoji: "\uD83D\uDCAA",
    module: "fizruk",
    iconClass: "bg-fizruk-soft text-fizruk dark:bg-fizruk-surface-dark/15",
    accentClass: "bg-fizruk",
    cardBg:
      "bg-fizruk-soft/40 dark:bg-fizruk-surface-dark/10 dark:border-fizruk-border-dark/25",
    description: "Тренування та прогрес",
    hasGoal: false,
    emptyLabel: "Почни тут \u2192",
    getPreview: () =>
      selectModulePreview(
        "fizruk",
        safeReadStringLS(STORAGE_KEYS.FIZRUK_QUICK_STATS),
      ),
  },
  routine: {
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    label: "Рутина",
    emoji: "\u2705",
    module: "routine",
    iconClass:
      "bg-routine-surface text-routine dark:bg-routine-surface-dark/15",
    accentClass: "bg-routine",
    cardBg:
      "bg-routine-surface/40 dark:bg-routine-surface-dark/10 dark:border-routine-border-dark/25",
    description: "Звички та щоденні цілі",
    hasGoal: true,
    emptyLabel: "Почни тут \u2192",
    getPreview: () =>
      selectModulePreview(
        "routine",
        safeReadStringLS(STORAGE_KEYS.ROUTINE_QUICK_STATS),
      ),
  },
  nutrition: {
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 2a26.6 26.6 0 0 1 10 20c.9-6.82 1.5-9.5 4-14" />
        <path d="M16 8c4 0 6-2 6-6-4 0-6 2-6 6" />
        <path d="M17.41 3.59a10 10 0 1 0 3 3" />
      </svg>
    ),
    label: "Харчування",
    emoji: "\uD83E\uDD57",
    module: "nutrition",
    iconClass:
      "bg-nutrition-soft text-nutrition dark:bg-nutrition-surface-dark/15",
    accentClass: "bg-nutrition",
    cardBg:
      "bg-nutrition-soft/40 dark:bg-nutrition-surface-dark/10 dark:border-nutrition-border-dark/25",
    description: "КБЖВ та раціон",
    hasGoal: true,
    emptyLabel: "Почни тут \u2192",
    getPreview: () =>
      selectModulePreview(
        "nutrition",
        safeReadStringLS(STORAGE_KEYS.NUTRITION_QUICK_STATS),
      ),
  },
};
