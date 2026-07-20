/**
 * Last validated: 2026-07-20
 * Status: Active
 */
/**
 * Module bento grid for the Hub Dashboard (T1 decomposition).
 *
 * Native pointer/keyboard drag-and-drop reordering, edit mode, and
 * inactive-module toggle (S10-T2 — no `@dnd-kit`).
 */

import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { isActiveModule, type DashboardModuleId } from "@sergeant/shared";
import { SortableCard } from "./dashboard/BentoCard";
import { type ModuleId } from "./dashboard/moduleConfigs";
import type { NativeSortableHandlers } from "./dashboard/nativeSortable";
import type { DashboardDensity } from "./hub.types";
import { DENSITY_BENTO_GAP } from "./hub.types";

export interface HubModulesGridProps {
  density: DashboardDensity;
  editMode: boolean;
  toggleEditMode: () => void;
  displayOrder: readonly string[];
  sortableHandlers: NativeSortableHandlers;
  onOpenModule: (module: string) => void;
  activeModules: readonly string[];
  adaptive: { liftedId: ModuleId | null; reason: string | null };
  hasInactive: boolean;
  hideInactive: boolean;
  toggleHideInactive: () => void;
}

function columnsForDensity(_density: DashboardDensity): number {
  // Matches `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`. Keyboard ArrowUp/Down
  // uses the mobile 2-col baseline (most common coarse-pointer case).
  return 2;
}

export function HubModulesGrid({
  density,
  editMode,
  toggleEditMode,
  displayOrder,
  sortableHandlers,
  onOpenModule,
  activeModules,
  adaptive,
  hasInactive,
  hideInactive,
  toggleHideInactive,
}: HubModulesGridProps) {
  const columns = useMemo(() => columnsForDensity(density), [density]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <SectionHeading as="h2" size="xs" className="px-0!">
          Модулі
        </SectionHeading>
        <button
          type="button"
          onClick={toggleEditMode}
          aria-pressed={editMode}
          aria-label={
            editMode
              ? "Завершити налаштування порядку модулів"
              : "Налаштувати порядок модулів"
          }
          title={editMode ? "Готово" : "Налаштувати"}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 text-style-caption font-medium rounded-xl transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
            editMode
              ? "bg-primary text-bg px-2.5 py-1"
              : "text-muted hover:text-text hover:bg-panelHi w-7 h-7 touch-target",
          )}
        >
          <Icon
            name={editMode ? "check" : "grip-vertical"}
            size="xs"
            strokeWidth={2}
            aria-hidden
          />
          {editMode ? <span>Готово</span> : null}
        </button>
      </div>

      <div
        data-testid="native-sortable-grid"
        className={cn(
          "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
          DENSITY_BENTO_GAP[density],
        )}
      >
        {displayOrder.map((id) => (
          <SortableCard
            key={id}
            id={id as ModuleId}
            onOpenModule={onOpenModule}
            inactive={
              !isActiveModule(
                activeModules as DashboardModuleId[],
                id as DashboardModuleId,
              )
            }
            editMode={editMode}
            adaptiveReason={id === adaptive.liftedId ? adaptive.reason : null}
            displayOrder={displayOrder}
            sortableHandlers={sortableHandlers}
            columns={columns}
          />
        ))}
      </div>

      {hasInactive && (
        <button
          type="button"
          onClick={toggleHideInactive}
          className="mx-auto mt-2 block text-style-caption text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
        >
          {hideInactive
            ? "Показати неактивні модулі"
            : "Приховати неактивні модулі"}
        </button>
      )}
    </section>
  );
}
