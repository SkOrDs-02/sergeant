import type { ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import {
  STORAGE_KEYS,
  selectModulePreview,
  type ModulePreview,
} from "@sergeant/shared";
import type { HubModuleAction } from "@shared/lib/modules/hubNav";

export interface ModuleConfig {
  icon: ReactNode;
  label: string;
  emoji: string;
  module: string;
  accentClass: string;
  /**
   * Колір великого показника картки. Мова «Папір» П4: у світлій темі
   * модульний акцент живе не в пастельній заливці, а в ink-елементах —
   * 2px-rule (`accentClass`) і цифрі. Всі чотири — tier-700/ink на білому
   * (≥4.5:1, пари в `packages/design-tokens/contrast.test.js`).
   */
  inkClass: string;
  /**
   * Заливка картки. Світла тема — біла плита (`bg-panel`) + модульна
   * рамка; насичену пастель прибрано (вона тягнула картку ДО кольору
   * сторінки, а не від неї). Темна тема лишається еталоном.
   */
  cardBg: string;
  description: string;
  hasGoal: boolean;
  emptyLabel: string;
  /**
   * FTUX-обіцянка порожньої картки: що тут зʼявиться. Раніше порожня
   * картка мовчала (лише назва + опис), і перший екран після онбордінгу
   * нічого не обіцяв. Мовою «Папір» (П3) приклад — ink/mono, не пастель,
   * тому текст розділено: слова в `emptyPromise`, справжнє значення
   * модуля — в `emptyExample` (JetBrains Mono, модульний ink).
   */
  emptyPromise: string;
  emptyExample: string;
  getPreview: () => ModulePreview;
  /**
   * #8 — trend delta chip. Relative change vs previous period expressed as a
   * number (e.g. 0.12 = +12 %, -0.05 = −5 %). `null` means "not enough data
   * to compute a trend yet" and the chip is omitted.  Callers can supply this
   * via a local quick-stats snapshot — it is intentionally separate from the
   * canonical `ModulePreview` so the bento tile can show it while the module
   * page is still lazy-loading.
   */
  trendDelta?: number | null | undefined;
  /**
   * #10 — empty-state ghost preview. A small SVG path (relative, e.g.
   * "M0,20 L10,14 L20,16 L30,8 L40,12") that sketches what a real sparkline
   * or ring would look like once the user has data. Rendered as a faded
   * silhouette inside the empty card so the layout destination is visible.
   * Each module defines its own characteristic shape.
   */
  ghostPath?: string | undefined;
  /** Ring percentage (0–100) used as the ghost preview for goal-bearing
   *  modules (routine, nutrition). When present, renders a partial arc
   *  instead of a sparkline silhouette. */
  ghostRingPct?: number | undefined;
  /**
   * #18 — long-press peek quick actions.
   * Up to 3 items shown in the peek sheet when the user long-presses the
   * BentoCard. Each action fires `openHubModuleWithAction` so the module
   * opens directly to the right create-flow.
   */
  quickActions?:
    | ReadonlyArray<{
        action: HubModuleAction;
        label: string;
        icon: string; // lucide-compatible icon name for <Icon>
      }>
    | undefined;
}

export type ModuleId = ModuleAccent;

/**
 * Копія стану «історія є, але за поточний період порожньо».
 *
 * FTUX-обіцянка (`emptyPromise` + `emptyLabel: "Почни тут →"`) обіцяє
 * перший крок — і це брехня людині, яка залогувала 84 прийоми їжі за
 * місяць, просто нічого не внесла СЬОГОДНІ (browser QA 2026-08-23).
 * Тому «порожньо» розщеплено надвоє: `emptyLabel` лишається за тими, у
 * кого записів не було ніколи, а тут живе чесний текст затишшя.
 *
 * Період названо буквально по тому, що рахує знімок quick-stats:
 * Фізрук — тиждень (`weekWorkouts`), решта — день.
 */
export const MODULE_DORMANT_COPY: Record<
  ModuleId,
  { readonly label: string; readonly hint: string }
> = {
  finyk: {
    label: "Сьогодні ще порожньо",
    hint: "Записи на місці. Відкрий, щоб додати",
  },
  fizruk: {
    label: "Цього тижня ще порожньо",
    hint: "Тренування на місці. Відкрий, щоб додати",
  },
  routine: {
    label: "Сьогодні ще порожньо",
    hint: "Звички на місці. Відкрий, щоб відмітити",
  },
  nutrition: {
    label: "Сьогодні ще порожньо",
    hint: "Записи на місці. Відкрий, щоб додати",
  },
};

const DEFAULT_DORMANT_COPY = MODULE_DORMANT_COPY.finyk;

/**
 * Копія затишшя за `ModuleConfig["module"]` (він типізований як `string`,
 * бо той самий рядок їде у навігацію). Невідомий id падає на нейтральний
 * денний варіант — плитка радше скаже «сьогодні ще порожньо», ніж
 * порушить контракт рендера.
 */
export function dormantCopyFor(module: string): {
  readonly label: string;
  readonly hint: string;
} {
  return (
    (MODULE_DORMANT_COPY as Record<string, { label: string; hint: string }>)[
      module
    ] ?? DEFAULT_DORMANT_COPY
  );
}

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
    accentClass: "bg-finyk",
    inkClass: "text-finyk",
    cardBg:
      "bg-panel border-finyk/30 dark:bg-finyk-surface-dark/10 dark:border-finyk-border-dark/25",
    description: "Сьогодні витрачено",
    hasGoal: false,
    emptyLabel: "Почни тут \u2192",
    emptyPromise: "Тут зʼявиться баланс, напр.",
    emptyExample: "450 ₴",
    // #10 — ghost sparkline: gentle rising curve (net-worth trend shape)
    ghostPath: "M0,22 L8,18 L16,20 L24,14 L32,16 L40,10 L48,12",
    // #18 — long-press peek
    quickActions: [
      { action: "add_expense", label: "Витрата", icon: "minus-circle" },
    ],
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
    accentClass: "bg-fizruk",
    inkClass: "text-fizruk",
    cardBg:
      "bg-panel border-fizruk/30 dark:bg-fizruk-surface-dark/10 dark:border-fizruk-border-dark/25",
    description: "Тренування та прогрес",
    hasGoal: false,
    emptyLabel: "Почни тут \u2192",
    emptyPromise: "Тут зʼявиться серія, напр.",
    emptyExample: "5 трен.",
    // #10 — ghost sparkline: volume bars (weekly workout volume shape)
    ghostPath:
      "M4,24 L4,16 M12,24 L12,20 M20,24 L20,12 M28,24 L28,18 M36,24 L36,8 M44,24 L44,14",
    // #18 — long-press peek
    quickActions: [
      { action: "start_workout", label: "Тренування", icon: "dumbbell" },
    ],
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
    accentClass: "bg-routine",
    inkClass: "text-routine",
    cardBg:
      "bg-panel border-routine/30 dark:bg-routine-surface-dark/10 dark:border-routine-border-dark/25",
    description: "Звички та щоденні цілі",
    hasGoal: true,
    emptyLabel: "Почни тут \u2192",
    emptyPromise: "Тут зʼявиться прогрес дня, напр.",
    emptyExample: "3/5",
    // #10 — ghost ring at ~60 % fill to preview the daily-progress ring
    ghostRingPct: 60,
    // #18 — long-press peek
    quickActions: [
      { action: "add_habit", label: "Нова звичка", icon: "check-circle" },
    ],
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
    label: "Їжа",
    emoji: "\uD83E\uDD57",
    module: "nutrition",
    accentClass: "bg-nutrition",
    inkClass: "text-nutrition",
    cardBg:
      "bg-panel border-nutrition/30 dark:bg-nutrition-surface-dark/10 dark:border-nutrition-border-dark/25",
    description: "КБЖВ та раціон",
    hasGoal: true,
    emptyLabel: "Почни тут \u2192",
    emptyPromise: "Тут зʼявиться КБЖВ, напр.",
    emptyExample: "1250 ккал",
    // #10 — ghost ring at ~45 % fill to preview the calorie-target ring
    ghostRingPct: 45,
    // #18 — long-press peek
    quickActions: [
      { action: "add_meal", label: "Прийом їжі", icon: "plus" },
      { action: "add_meal_photo", label: "Фото страви", icon: "camera" },
    ],
    getPreview: () =>
      selectModulePreview(
        "nutrition",
        safeReadStringLS(STORAGE_KEYS.NUTRITION_QUICK_STATS),
      ),
  },
};
