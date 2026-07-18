/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/**
 * Module bento grid for the Hub Dashboard (T1 decomposition).
 *
 * Drag-and-drop reordering, edit mode, and inactive-module toggle.
 */

import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { isActiveModule, type DashboardModuleId } from "@sergeant/shared";
import { useState } from "react";
import { ReorderableCard } from "./dashboard/BentoCard";
import { type ModuleId } from "./dashboard/moduleConfigs";
import type { DashboardDensity } from "./hub.types";
import { DENSITY_BENTO_GAP } from "./hub.types";

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export interface HubModulesGridProps {
  density: DashboardDensity;
  editMode: boolean;
  toggleEditMode: () => void;
  displayOrder: readonly string[];
  announceReorderStart: (id: ModuleId) => void;
  moveModule: (activeId: ModuleId, overId: ModuleId) => void;
  onOpenModule: (module: string) => void;
  activeModules: readonly string[];
  adaptive: { liftedId: ModuleId | null; reason: string | null };
  hasInactive: boolean;
  hideInactive: boolean;
  toggleHideInactive: () => void;
}

export function HubModulesGrid({
  density,
  editMode,
  toggleEditMode,
  displayOrder,
  announceReorderStart,
  moveModule,
  onOpenModule,
  activeModules,
  adaptive,
  hasInactive,
  hideInactive,
  toggleHideInactive,
}: HubModulesGridProps) {
  const [draggedId, setDraggedId] = useState<ModuleId | null>(null);

  const finishNativeDrag = (overId: ModuleId) => {
    if (draggedId) moveModule(draggedId, overId);
    setDraggedId(null);
  };

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
        className={cn(
          "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
          DENSITY_BENTO_GAP[density],
        )}
      >
        {displayOrder.map((id, index) => (
          <ReorderableCard
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
            canMovePrevious={index > 0}
            canMoveNext={index < displayOrder.length - 1}
            onMovePrevious={() =>
              moveModule(id as ModuleId, displayOrder[index - 1] as ModuleId)
            }
            onMoveNext={() =>
              moveModule(id as ModuleId, displayOrder[index + 1] as ModuleId)
            }
            onNativeDragStart={() => {
              const moduleId = id as ModuleId;
              setDraggedId(moduleId);
              announceReorderStart(moduleId);
            }}
            onNativeDrop={() => finishNativeDrag(id as ModuleId)}
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
