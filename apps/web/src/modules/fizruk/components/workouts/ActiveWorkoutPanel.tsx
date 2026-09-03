/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useCallback, useId, useState } from "react";
import type {
  ChecklistItem,
  Workout,
  WorkoutGroup,
  WorkoutItem,
  WorkoutSet,
} from "@sergeant/fizruk-domain";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useRestSettings } from "../../hooks/useRestSettings";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { useToast } from "@shared/hooks/useToast";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { NOTE_MAX_LEN } from "@shared/lib/text/limits";
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
   * Кінець ретро-сесії, який людина ввела у формі «Записати тренування
   * заднім числом», але який ще не записаний у `endedAt` (див.
   * `pendingRetroEnd`). Прокидається у `WorkoutTimeEditor`, щоб уже введена
   * мітка була видимою й редагованою, а не зникала до кроку «Завершити».
   */
  pendingRetroEnd?: string | null | undefined;
  /** Правка цієї відкладеної мітки. */
  onPendingRetroEndChange?: ((iso: string) => void) | undefined;
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
  pendingRetroEnd,
  onPendingRetroEndChange,
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
  const { getDefaultForGroup, getDefaultForExercise, setDefaultForExercise } =
    useRestSettings();
  const noteId = useId();
  const toast = useToast();
  const { CelebrationComponent } = useCelebration();
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

  /**
   * Called by WorkoutItemsList (via WorkoutItemCard) when the user deletes a
   * set. The card has already called updateItem with the filtered set array;
   * this handler fires an undo toast that restores the snapshot on
   * "Скасувати" click. Undo restores sets only — any analytics events
   * already fired are not rolled back (same policy as workout-level undo).
   */
  const handleDeleteSet = useCallback(
    (workoutId: string, itemId: string, snapshot: WorkoutSet[]) => {
      showUndoToast(toast, {
        msg: "Підхід видалено",
        onUndo: () => {
          updateItem(workoutId, itemId, { sets: snapshot });
        },
      });
    },
    [toast, updateItem],
  );

  if (!activeWorkout) return null;

  const isReadOnly = Boolean(activeWorkout.endedAt);
  const items: WorkoutItem[] = activeWorkout.items || [];
  const groups: WorkoutGroup[] = activeWorkout.groups || [];
  const showGroupingControls =
    !activeWorkout.endedAt && (activeWorkout.items || []).length >= 2;

  return (
    <>
      {CelebrationComponent}
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
          pendingEndedAt={pendingRetroEnd}
          onPendingEndChange={onPendingRetroEndChange}
        />

        <div className="mt-3 space-y-2">
          <WarmupCooldownChecklist
            title="Розминка"
            items={activeWorkout.warmup}
            onToggle={(id: string) => handleWarmupToggle("warmup", id)}
            onInit={handleInitWarmup}
          />
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
            getDefaultForExercise={getDefaultForExercise}
            setDefaultForExercise={setDefaultForExercise}
            onDeleteSet={handleDeleteSet}
          />
          <WarmupCooldownChecklist
            title="Заминка / розтяжка"
            items={activeWorkout.cooldown}
            onToggle={(id: string) => handleWarmupToggle("cooldown", id)}
            onInit={handleInitCooldown}
          />
          {!activeWorkout.endedAt && (
            // Той самий згорнутий рядок, що й час, розминка та заминка:
            // порожня textarea на весь екран була найгучнішим полем панелі,
            // хоча нотатка потрібна далеко не щоразу.
            <details
              className="group rounded-xl border border-line bg-panelHi/50 px-3 py-2"
              open={Boolean(activeWorkout.note)}
            >
              <summary className="flex items-center justify-between gap-2 min-h-[28px] cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <span className="text-style-caption text-subtle">
                  Нотатки до тренування · необовʼязково
                </span>
                <Icon
                  name="chevron-down"
                  size={16}
                  className="shrink-0 text-subtle transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <textarea
                id={noteId}
                aria-label="Нотатки до тренування"
                className="input-focus-fizruk mt-2 w-full min-h-[72px] rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-subtle resize-none"
                placeholder="Напр. Важко на присіданнях, болить коліно…"
                value={activeWorkout.note || ""}
                maxLength={NOTE_MAX_LEN}
                onChange={(e) =>
                  updateWorkout(activeWorkout.id, { note: e.target.value })
                }
              />
            </details>
          )}
        </div>
      </Card>
    </>
  );
}
