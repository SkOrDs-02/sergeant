/**
 * Рейок модулів — один компонент для хабу і для шапки модуля.
 *
 * Спека: `docs/work/specs/hub-action-axis.md` § «Рейок модулів» (рішення
 * власника 2026-09-17). До того та сама робота — потрапити в модуль —
 * виконувалась двома різними компонентами у двох місцях: сіткою плиток 2×2
 * на хабі та рядом чипів `ModuleSwitcher` усередині модуля. Тепер це один
 * рядок під шапкою всюди; людина вчить його один раз (закриває N-1 аудиту
 * шуму як питання зв'язності, не видаленням).
 *
 * Чотири рівні комірки, іконка в акценті модуля + коротка назва; без чисел,
 * бейджів і дельт — навмисно: з числами рядок стає другим дашбордом і
 * повертає ту саму однорідну сітку, від якої вісь відходить (рішення
 * 2026-08-08). Порядок сталий (`MODULE_RAIL_ORDER`), не користувацький.
 * Завжди видимий, не згорнутий: згорнутий знову стає умовним входом.
 *
 * `shared/components/layout` звільнено від module-accent containment, тож
 * усі чотири акценти в одному файлі — свідомо.
 *
 * Last validated: 2026-09-17
 * Status: Active
 */
import type { ReactNode } from "react";
import type { ModuleOpenSource } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import {
  openHubModule,
  openHubSettingsSection,
} from "@shared/lib/modules/hubNav";
import { useTablistArrowKeys } from "@shared/hooks/useTablistArrowKeys";
import {
  MODULE_LABELS,
  type HubModuleId,
} from "@shared/lib/modules/moduleLabels";
import { coreMessages } from "@shared/i18n/uk.core";

export const MODULE_RAIL_ORDER: readonly HubModuleId[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

// Compact labels for the equal-width cells. Only modules whose full
// `MODULE_LABELS` name overflows the ~51px cell on a phone need an entry;
// the rest fall back to the full label. Full names stay in each cell's
// `aria-label`, so screen readers are unaffected.
const MODULE_RAIL_SHORT_LABELS: Partial<Record<HubModuleId, string>> = {
  nutrition: "Їжа",
};

// SVG glyphs are inlined to avoid pulling the full Icon registry into
// every module header — cell icons are tiny and don't change.
const MODULE_RAIL_ICONS: Record<HubModuleId, ReactNode> = {
  finyk: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  ),
  fizruk: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.4 14.4 9.6 9.6" />
      <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z" />
      <path d="m21.5 21.5-1.4-1.4" />
      <path d="M3.9 3.9 2.5 2.5" />
      <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
    </svg>
  ),
  routine: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  nutrition: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 2v7a3 3 0 0 0 3 3v9" />
      <path d="M9 2v20" />
      <path d="M9 9H3" />
      <path d="M14 2c-1.7 0-3 1.3-3 3v7h3V2Z" />
      <path d="M14 12v10" />
      <path d="M21 22V11l-3-3v14" />
    </svg>
  ),
};

const MODULE_RAIL_TOKENS: Record<
  HubModuleId,
  { active: string; inactive: string; ring: string }
> = {
  finyk: {
    active: "bg-finyk-strong text-white dark:bg-finyk dark:text-bg",
    inactive:
      "zone-chip text-finyk-strong dark:text-finyk hover:bg-finyk-soft hover:border-finyk-soft-border",
    ring: "focus-visible:ring-finyk",
  },
  fizruk: {
    active: "bg-fizruk-strong text-white dark:bg-fizruk dark:text-bg",
    inactive:
      "zone-chip text-fizruk-strong dark:text-fizruk-300 hover:bg-fizruk-soft hover:border-fizruk-soft-border",
    ring: "focus-visible:ring-fizruk",
  },
  routine: {
    active: "bg-routine-strong text-white dark:bg-routine dark:text-bg",
    inactive:
      "zone-chip text-routine-strong dark:text-routine hover:bg-routine-soft hover:border-routine-soft-border",
    ring: "focus-visible:ring-routine",
  },
  nutrition: {
    active: "bg-nutrition-strong text-white dark:bg-nutrition dark:text-bg",
    inactive:
      "zone-chip text-nutrition-strong dark:text-nutrition hover:bg-nutrition-soft hover:border-nutrition-soft-border",
    ring: "focus-visible:ring-nutrition",
  },
};

export interface ModuleRailProps {
  /** Підсвічена комірка; на хабі — `null`, бо жоден модуль не відкритий. */
  active: HubModuleId | null;
  /** Джерело для `module_opened` (базова лінія осі): де стоїть рейок. */
  source: Extract<ModuleOpenSource, "module_switcher" | "module_rail">;
  /**
   * Активні модулі користувача (Налаштування → Дашборд). Неактивний модуль
   * лишається в рейку приглушеним — рейок сталий за формою, інакше він
   * «стрибає» — а тап веде в налаштування, як і неактивна плитка раніше.
   * `undefined` — усі активні (усередині модулів це питання не стоїть).
   */
  activeModules?: readonly string[] | undefined;
  className?: string | undefined;
}

export function ModuleRail({
  active,
  source,
  activeModules,
  className,
}: ModuleRailProps) {
  // Roving tabindex + стрілки: без стрілок неактивні комірки були б
  // недосяжні з клавіатури взагалі (знахідка PR-C5, аудит 2026-09-13).
  const onTabKeyDown = useTablistArrowKeys();
  // На хабі жодна комірка не активна — Tab має зупинятись на першій.
  const tabStop = active ?? MODULE_RAIL_ORDER[0];
  return (
    <div
      role="tablist"
      aria-label={coreMessages.hub.moduleRail}
      data-testid="module-rail"
      className={cn("flex items-stretch gap-1", className)}
    >
      {MODULE_RAIL_ORDER.map((id) => {
        const isActive = id === active;
        const isEnabled = activeModules ? activeModules.includes(id) : true;
        const tokens = MODULE_RAIL_TOKENS[id];
        const label = MODULE_LABELS[id];
        const cellLabel = MODULE_RAIL_SHORT_LABELS[id] ?? label;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={
              isEnabled
                ? `Перейти до модуля ${label}`
                : `${label}: неактивний, увімкнути в налаштуваннях`
            }
            data-inactive={isEnabled ? undefined : "true"}
            tabIndex={id === tabStop ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => {
              if (isActive) return;
              hapticTap();
              if (!isEnabled) {
                openHubSettingsSection("dashboard");
                return;
              }
              openHubModule(id, undefined, source);
            }}
            className={cn(
              // 44 px на coarse pointer — спека § «Рейок модулів»; на
              // fine-pointer floor навмисно не діє (та сама політика, що й у
              // `Button`).
              "flex-1 inline-flex items-center justify-center gap-1.5 h-8 pointer-coarse:h-11 px-2 rounded-xl text-style-caption font-semibold border border-transparent transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
              isActive ? tokens.active : tokens.inactive,
              // На хабі немає зони модуля (`--module-zone-rgb`), тож
              // `zone-chip` не дає комірці тіла — ставимо панель і лінію,
              // як у решти карток головної.
              active === null && !isActive && "bg-panel border-line",
              !isEnabled && "opacity-60",
              tokens.ring,
            )}
          >
            <span aria-hidden className="shrink-0">
              {MODULE_RAIL_ICONS[id]}
            </span>
            <span className="truncate">{cellLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
