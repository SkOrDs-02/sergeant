import { useCallback, useMemo } from "react";
import type {
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { SupersetBadge } from "./SupersetBadge";
import { WorkoutItemCard } from "./WorkoutItemCard";

export interface WorkoutItemsListProps {
  activeWorkout: Workout;
  items: WorkoutItem[];
  groups: WorkoutGroup[];
  groupSelectMode: boolean;
  groupSelected: Set<string>;
  isReadOnly: boolean;
  lastByExerciseId: Record<string, unknown>;
  musclesUk: Record<string, string>;
  recBy: Record<string, unknown>;
  onToggleGroupSelect: (itemId: string) => void;
  removeItem: (workoutId: string, itemId: string) => void;
  updateItem: (
    workoutId: string,
    itemId: string,
    patch: Partial<WorkoutItem>,
  ) => void;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  setRestTimer: (state: RestTimerState | null) => void;
  getDefaultForGroup: (id: string) => number;
}

/**
 * Renders the workout's items, with grouped items collapsed under a
 * superset/circuit container that exposes a shared rest-timer toggle
 * and quick-pick rest durations. Standalone items render as plain
 * `WorkoutItemCard`s.
 *
 * Lives inside `ActiveWorkoutPanel`. Pulled out to keep the parent
 * focused on coordination rather than item layout.
 */
export function WorkoutItemsList({
  activeWorkout,
  items,
  groups,
  groupSelectMode,
  groupSelected,
  isReadOnly,
  lastByExerciseId,
  musclesUk,
  recBy,
  onToggleGroupSelect,
  removeItem,
  updateItem,
  updateWorkout,
  setRestTimer,
  getDefaultForGroup,
}: WorkoutItemsListProps) {
  const itemIdToGroup = useMemo(() => {
    const m = new Map<string, WorkoutGroup>();
    for (const g of groups) {
      for (const id of g.itemIds || []) m.set(id, g);
    }
    return m;
  }, [groups]);

  const handleRemoveGroup = useCallback(
    (groupId: string) => {
      updateWorkout(activeWorkout.id, {
        groups: groups.filter((g) => g.id !== groupId),
      });
    },
    [activeWorkout.id, groups, updateWorkout],
  );

  const handleGroupRestSec = useCallback(
    (groupId: string, sec: number) => {
      updateWorkout(activeWorkout.id, {
        groups: groups.map((g) =>
          g.id === groupId ? { ...g, restSec: sec } : g,
        ),
      });
    },
    [activeWorkout.id, groups, updateWorkout],
  );

  const renderItem = useCallback(
    (it: WorkoutItem) => (
      <WorkoutItemCard
        key={it.id}
        it={it}
        activeWorkout={activeWorkout}
        group={itemIdToGroup.get(it.id)}
        groupSelectMode={groupSelectMode}
        isSelected={groupSelected.has(it.id)}
        isReadOnly={isReadOnly}
        lastByExerciseId={lastByExerciseId}
        musclesUk={musclesUk}
        recBy={recBy}
        onToggleGroupSelect={onToggleGroupSelect}
        removeItem={removeItem}
        updateItem={updateItem}
        setRestTimer={setRestTimer}
        getDefaultForGroup={getDefaultForGroup}
      />
    ),
    [
      activeWorkout,
      getDefaultForGroup,
      groupSelectMode,
      groupSelected,
      isReadOnly,
      itemIdToGroup,
      lastByExerciseId,
      musclesUk,
      onToggleGroupSelect,
      recBy,
      removeItem,
      setRestTimer,
      updateItem,
    ],
  );

  if (items.length === 0) {
    return (
      <div className="text-sm text-subtle text-center py-6">
        Додай вправи, щоб почати логувати
      </div>
    );
  }

  const rendered: React.ReactNode[] = [];
  const visitedGroups = new Set<string>();

  for (const it of items) {
    const group = itemIdToGroup.get(it.id);
    if (!group) {
      rendered.push(renderItem(it));
      continue;
    }
    if (visitedGroups.has(group.id)) continue;
    visitedGroups.add(group.id);

    const groupItems = items.filter((x: WorkoutItem) =>
      (group.itemIds || []).includes(x.id),
    );
    const qOpts = [60, 90, 120, 180].filter((s: number) => s !== group.restSec);

    rendered.push(
      <div
        key={group.id}
        className="rounded-2xl border-2 border-success/40 bg-success/5 p-2 space-y-2"
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <SupersetBadge type={group.type ?? "superset"} />
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-subtle">
              {groupItems.length} вправи разом
            </span>
            <button
              type="button"
              className="text-2xs text-danger/70 hover:text-danger px-1"
              onClick={() => handleRemoveGroup(group.id)}
              title="Розгрупувати"
            >
              Розгрупувати
            </button>
          </div>
        </div>
        {groupItems.map((gIt: WorkoutItem) => renderItem(gIt))}
        {!activeWorkout.endedAt && (
          <div className="flex flex-wrap items-center gap-2 px-1 pt-1 border-t border-success/20">
            <SectionHeading as="span" size="xs" className="w-full">
              Спільний таймер відпочинку між колами
            </SectionHeading>
            <button
              type="button"
              className="min-h-[40px] px-3 rounded-xl border-2 border-success bg-success/10 text-style-label text-success hover:bg-success/20 transition-colors"
              onClick={() =>
                setRestTimer({
                  remaining: group.restSec || 60,
                  total: group.restSec || 60,
                })
              }
            >
              {group.restSec || 60} с ★
            </button>
            {qOpts.map((sec) => (
              <button
                key={sec}
                type="button"
                className="min-h-[40px] px-3 rounded-xl border border-line bg-panelHi text-sm text-text hover:bg-panel transition-colors"
                onClick={() => {
                  handleGroupRestSec(group.id, sec);
                  setRestTimer({ remaining: sec, total: sec });
                }}
              >
                {sec} с
              </button>
            ))}
          </div>
        )}
      </div>,
    );
  }

  return <>{rendered}</>;
}
