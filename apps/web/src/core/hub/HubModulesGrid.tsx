/**
 * Module bento grid for the Hub Dashboard (T1 decomposition).
 *
 * Drag-and-drop reordering, edit mode, inactive-module toggle, and
 * FTUX inline hint.
 */

import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { isActiveModule, type DashboardModuleId } from "@sergeant/shared";
import {
  DndContext,
  closestCenter,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { SortableCard } from "./dashboard/BentoCard";
import { type ModuleId } from "./dashboard/moduleConfigs";
import type { DashboardDensity } from "./hub.types";
import { DENSITY_BENTO_GAP } from "./hub.types";

// ─────────────────────────────────────────────────────────────────────
// FTUX inline hint
// ─────────────────────────────────────────────────────────────────────

const FTUX_MODULES_HINT_KEY = "sergeant.hub.ftuxModulesHint.dismissed.v1";

function FtuxModulesHint() {
  const [dismissed, setDismissed] = useLocalStorageState<boolean>(
    FTUX_MODULES_HINT_KEY,
    false,
    { validate: (v): v is boolean => typeof v === "boolean" },
  );
  if (dismissed) return null;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-2xl border border-line bg-panel/70 px-3 py-2",
        "text-2xs leading-snug text-muted",
      )}
    >
      <Icon
        name="info"
        size={14}
        strokeWidth={2}
        aria-hidden
        className="mt-0.5 shrink-0 text-brand-strong"
      />
      <p className="flex-1 min-w-0">
        Тут усі твої розділи поруч — обери будь-який, щоб почати.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Сховати підказку"
        className={cn(
          "shrink-0 -mr-1 -mt-0.5 w-6 h-6 inline-flex items-center justify-center rounded-md",
          "text-muted hover:text-text hover:bg-panelHi transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        )}
      >
        <Icon name="close" size={14} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export interface HubModulesGridProps {
  density: DashboardDensity;
  hasRealEntry: boolean;
  editMode: boolean;
  toggleEditMode: () => void;
  displayOrder: readonly string[];
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  onOpenModule: (module: string) => void;
  quickAddByModule: Record<
    string,
    { label: string; run: () => void } | undefined
  >;
  activeModules: readonly string[];
  adaptive: { liftedId: ModuleId | null; reason: string | null };
  hasInactive: boolean;
  hideInactive: boolean;
  toggleHideInactive: () => void;
}

export function HubModulesGrid({
  density,
  hasRealEntry,
  editMode,
  toggleEditMode,
  displayOrder,
  sensors,
  handleDragStart,
  handleDragEnd,
  onOpenModule,
  quickAddByModule,
  activeModules,
  adaptive,
  hasInactive,
  hideInactive,
  toggleHideInactive,
}: HubModulesGridProps) {
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
            "inline-flex items-center justify-center gap-1.5 text-2xs font-medium rounded-xl transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
            editMode
              ? "bg-primary text-bg px-2.5 py-1"
              : "text-muted hover:text-text hover:bg-panelHi w-7 h-7",
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

      {!hasRealEntry && <FtuxModulesHint />}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={displayOrder as string[]}
          strategy={rectSortingStrategy}
        >
          <div
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
                quickAdd={quickAddByModule[id] || null}
                inactive={
                  !isActiveModule(
                    activeModules as DashboardModuleId[],
                    id as DashboardModuleId,
                  )
                }
                editMode={editMode}
                adaptiveReason={
                  id === adaptive.liftedId ? adaptive.reason : null
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {hasInactive && (
        <button
          type="button"
          onClick={toggleHideInactive}
          className="mx-auto mt-2 block text-2xs text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          {hideInactive
            ? "Показати неактивні модулі"
            : "Приховати неактивні модулі"}
        </button>
      )}
    </section>
  );
}
