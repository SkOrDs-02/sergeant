import { useCallback, useState } from "react";
import type {
  ChecklistItem,
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain";
import { Card } from "@shared/components/ui/Card";
import { useRestSettings } from "../../hooks/useRestSettings";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import {
  makeDefaultWarmup,
  makeDefaultCooldown,
} from "../../hooks/useWorkouts";
import { uid } from "./activeWorkoutLib";
import { WarmupCooldownChecklist } from "./WarmupCooldownChecklist";
import { ActiveWorkoutHeader } from "./ActiveWorkoutHeader";
import { WorkoutTimeEditor } from "./WorkoutTimeEditor";
import { WorkoutGroupingControls } from "./WorkoutGroupingControls";
import { WorkoutItemsList } from "./WorkoutItemsList";

/**
 * Group flavour for `handleCreateSuperset`. Mirrors the union used by
 * `WorkoutGroup.type` and `SupersetBadge`.
 */
type WorkoutGroupType = "circuit" | "superset";

/** Warm-up vs cool-down checklist key on `Workout`. */
type WarmupField = "warmup" | "cooldown";

export interface ActiveWorkoutPanelProps {
  /** Currently focused workout (already started, may be ended). */
  activeWorkout: Workout | null;
  /** Pre-formatted duration string (e.g. "42 хв") for the header. */
  activeDuration: string | null;
  /**
   * Map of exerciseId → previous-session snapshot used by `WorkoutItemCard`
   * to render the "last time" hint. Loosely typed to match the persisted
   * shape from `useWorkouts`.
   */
  lastByExerciseId: Record<string, unknown>;
  /** Map of muscle id → Ukrainian label for recovery hints. */
  musclesUk: Record<string, string>;
  /**
   * Recovery state by muscle id. Loosely typed because the consumer
   * (`WorkoutItemCard`) only narrows on `status` / `daysSince` ad-hoc.
   */
  recBy: Record<string, unknown>;
  removeItem: (workoutId: string, itemId: string) => void;
  updateItem: (
    workoutId: string,
    itemId: string,
    patch: Partial<WorkoutItem>,
  ) => void;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  setRestTimer: (state: RestTimerState | null) => void;
  onFinishClick: () => void;
  onDeleteWorkout: () => void;
  /** When the workout is already ended, hide the panel. */
  onCollapse?: () => void;
}

/**
 * Top-level shell for the in-flight workout. Owns superset-selection
 * state and the warmup/cooldown init helpers; delegates rendering to
 * focused sub-components: `ActiveWorkoutHeader`, `WorkoutTimeEditor`,
 * `WorkoutGroupingControls`, and `WorkoutItemsList`.
 */
export function ActiveWorkoutPanel({
  activeWorkout,
  activeDuration,
  lastByExerciseId,
  musclesUk,
  recBy,
  removeItem,
  updateItem,
  updateWorkout,
  setRestTimer,
  onFinishClick,
  onDeleteWorkout,
  onCollapse,
}: ActiveWorkoutPanelProps) {
  const { getDefaultForGroup } = useRestSettings();
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelected, setGroupSelected] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const handleToggleGroupSelect = useCallback((itemId: string) => {
    setGroupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const handleEnterSelectMode = useCallback(() => {
    setGroupSelectMode(true);
    setGroupSelected(new Set());
  }, []);

  const handleCancelSelectMode = useCallback(() => {
    setGroupSelectMode(false);
    setGroupSelected(new Set());
  }, []);

  const handleCreateSuperset = useCallback(
    (type: WorkoutGroupType) => {
      if (!activeWorkout) return;
      if (groupSelected.size < 2 || groupSelected.size > 3) return;
      const itemIds = [...groupSelected];
      const groups = activeWorkout.groups || [];
      const newGroup: WorkoutGroup = {
        id: uid("g"),
        type,
        itemIds,
        restSec: 60,
      };
      const newGroups: WorkoutGroup[] = [
        ...groups.filter(
          (g) => !g.itemIds.some((id: string) => groupSelected.has(id)),
        ),
        newGroup,
      ];
      updateWorkout(activeWorkout.id, { groups: newGroups });
      setGroupSelected(new Set<string>());
      setGroupSelectMode(false);
    },
    [activeWorkout, groupSelected, updateWorkout],
  );

  const handleWarmupToggle = useCallback(
    (field: WarmupField, itemId: string) => {
      if (!activeWorkout) return;
      const arr: ChecklistItem[] = (activeWorkout[field] || []).map(
        (x: ChecklistItem) => (x.id === itemId ? { ...x, done: !x.done } : x),
      );
      updateWorkout(activeWorkout.id, { [field]: arr });
    },
    [activeWorkout, updateWorkout],
  );

  const handleInitWarmup = useCallback(() => {
    if (!activeWorkout) return;
    updateWorkout(activeWorkout.id, { warmup: makeDefaultWarmup() });
  }, [activeWorkout, updateWorkout]);

  const handleInitCooldown = useCallback(() => {
    if (!activeWorkout) return;
    updateWorkout(activeWorkout.id, { cooldown: makeDefaultCooldown() });
  }, [activeWorkout, updateWorkout]);

  if (!activeWorkout) return null;

  const isReadOnly = Boolean(activeWorkout.endedAt);
  const items: WorkoutItem[] = activeWorkout.items || [];
  const groups: WorkoutGroup[] = activeWorkout.groups || [];
  const showGroupingControls =
    !activeWorkout.endedAt && (activeWorkout.items || []).length >= 2;

  return (
    <Card radius="lg">
      <ActiveWorkoutHeader
        activeWorkout={activeWorkout}
        activeDuration={activeDuration}
        onFinishClick={onFinishClick}
        onDeleteWorkout={onDeleteWorkout}
        onCollapse={onCollapse}
      />

      <WorkoutTimeEditor
        activeWorkout={activeWorkout}
        updateWorkout={updateWorkout}
      />

      <div className="mt-3 space-y-2">
        <WarmupCooldownChecklist
          title="Розминка"
          items={activeWorkout.warmup}
          onToggle={(id: string) => handleWarmupToggle("warmup", id)}
          onInit={handleInitWarmup}
          color={{ border: "border-orange-400/40", text: "text-orange-500" }}
        />
      </div>

      <div className="mt-3 space-y-2">
        {showGroupingControls && (
          <WorkoutGroupingControls
            selectedCount={groupSelected.size}
            selectMode={groupSelectMode}
            onEnterSelectMode={handleEnterSelectMode}
            onCancelSelectMode={handleCancelSelectMode}
            onCreateGroup={handleCreateSuperset}
          />
        )}
        <WorkoutItemsList
          activeWorkout={activeWorkout}
          items={items}
          groups={groups}
          groupSelectMode={groupSelectMode}
          groupSelected={groupSelected}
          isReadOnly={isReadOnly}
          lastByExerciseId={lastByExerciseId}
          musclesUk={musclesUk}
          recBy={recBy}
          onToggleGroupSelect={handleToggleGroupSelect}
          removeItem={removeItem}
          updateItem={updateItem}
          updateWorkout={updateWorkout}
          setRestTimer={setRestTimer}
          getDefaultForGroup={getDefaultForGroup}
        />
      </div>

      <div className="mt-3 space-y-2">
        <WarmupCooldownChecklist
          title="Заминка / розтяжка"
          items={activeWorkout.cooldown}
          onToggle={(id: string) => handleWarmupToggle("cooldown", id)}
          onInit={handleInitCooldown}
          color={{ border: "border-blue-400/40", text: "text-blue-500" }}
        />
      </div>

      {!activeWorkout.endedAt && (
        <div className="mt-3">
          <textarea
            className="input-focus-fizruk w-full min-h-[72px] rounded-2xl border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-subtle resize-none"
            placeholder={`Нотатки до тренування (необов${"'"}язково)…`}
            value={activeWorkout.note || ""}
            onChange={(e) =>
              updateWorkout(activeWorkout.id, { note: e.target.value })
            }
          />
        </div>
      )}
    </Card>
  );
}
