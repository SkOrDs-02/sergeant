/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useCallback, useMemo, useState } from "react";
import type {
  ChecklistItem,
  Workout,
  WorkoutGroup,
  WorkoutItem,
  WorkoutSet,
} from "@sergeant/fizruk-domain";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import type { DropdownMenuItem } from "@shared/components/ui/DropdownMenu";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { messages } from "@shared/i18n/uk";
import { useRestSettings } from "../../hooks/useRestSettings";
import { useRestTimer } from "../../context/RestTimerContext";
import {
  makeDefaultWarmup,
  makeDefaultCooldown,
} from "../../hooks/useWorkouts";
import { trackFizrukRestTimerDone } from "../../lib/workoutTelemetry";
import { uid } from "../workouts/activeWorkoutLib";
import { isSetDone } from "../workouts/WorkoutSetRow";
import { SessionTopBar } from "./SessionTopBar";
import { SessionDock } from "./SessionDock";
import { SessionExtrasRow } from "./SessionExtrasRow";
import { SessionExerciseList } from "./SessionExerciseList";
import { SessionExerciseFocus } from "./SessionExerciseFocus";
import { groupByItemId, sessionProgress } from "./sessionLib";

type WorkoutGroupType = "circuit" | "superset";
type WarmupField = "warmup" | "cooldown";

export interface SessionViewProps {
  activeWorkout: Workout;
  activeDuration: string | null;
  /** `workout/<id>/<itemId>` — вправа, відкрита на весь екран. */
  focusItemId?: string | undefined;
  pendingRetroEnd?: string | null | undefined;
  onPendingRetroEndChange?: ((iso: string) => void) | undefined;
  lastByExerciseId: Record<string, unknown>;
  recBy: Record<string, unknown>;
  removeItem: (workoutId: string, itemId: string) => void;
  updateItem: (
    workoutId: string,
    itemId: string,
    patch: Partial<WorkoutItem>,
  ) => void;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  onFinishClick: () => void;
  onDeleteWorkout: () => void;
  /** «Згорнути» — назад на `/fizruk/workouts`, сесія живе далі. */
  onCollapse: () => void;
  /** `null` — назад до списку; id — відкрити вправу. */
  onOpenItem: (itemId: string | null) => void;
  onAddExercise: () => void;
  onOpenExerciseInfo?: ((exerciseId: string) => void) | undefined;
  onOpenExerciseStats?: ((exerciseId: string) => void) | undefined;
}

/**
 * Оркестратор сесійного режиму: вирішує, що показати (список чи вправу),
 * тримає стан вибору для суперсету, ініціалізацію розминки/заминки,
 * undo для видаленого підходу і стан дока. Усі мутації йдуть через пропси
 * з `WorkoutJournalSection`; таймер відпочинку — з модульного контексту.
 */
export function SessionView({
  activeWorkout,
  activeDuration,
  focusItemId,
  pendingRetroEnd,
  onPendingRetroEndChange,
  lastByExerciseId,
  recBy,
  removeItem,
  updateItem,
  updateWorkout,
  onFinishClick,
  onDeleteWorkout,
  onCollapse,
  onOpenItem,
  onAddExercise,
  onOpenExerciseInfo,
  onOpenExerciseStats,
}: SessionViewProps) {
  const ss = messages.fizruk.session;
  const toast = useToast();
  const { restTimer, setRestTimer } = useRestTimer();
  const { getDefaultForGroup, getDefaultForExercise, setDefaultForExercise } =
    useRestSettings();
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelected, setGroupSelected] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const isReadOnly = Boolean(activeWorkout.endedAt);
  const items: WorkoutItem[] = activeWorkout.items || [];
  const groups: WorkoutGroup[] = useMemo(
    () => activeWorkout.groups || [],
    [activeWorkout.groups],
  );
  const groupOf = useMemo(() => groupByItemId(groups), [groups]);
  const focused = focusItemId
    ? (items.find((x) => x.id === focusItemId) ?? null)
    : null;
  const progress = sessionProgress(activeWorkout);

  const handleToggleGroupSelect = useCallback((itemId: string) => {
    setGroupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const enterSelectMode = useCallback(() => {
    setGroupSelectMode(true);
    setGroupSelected(new Set());
  }, []);

  const cancelSelectMode = useCallback(() => {
    setGroupSelectMode(false);
    setGroupSelected(new Set());
  }, []);

  const handleCreateGroup = useCallback(
    (type: WorkoutGroupType) => {
      if (groupSelected.size < 2 || groupSelected.size > 3) return;
      const itemIds = [...groupSelected];
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
    [activeWorkout.id, groupSelected, groups, updateWorkout],
  );

  const handleUngroup = useCallback(
    (groupId: string) => {
      updateWorkout(activeWorkout.id, {
        groups: groups.filter((g) => g.id !== groupId),
      });
    },
    [activeWorkout.id, groups, updateWorkout],
  );

  const handleChecklistToggle = useCallback(
    (field: WarmupField, itemId: string) => {
      const arr: ChecklistItem[] = (activeWorkout[field] || []).map(
        (x: ChecklistItem) => (x.id === itemId ? { ...x, done: !x.done } : x),
      );
      updateWorkout(activeWorkout.id, { [field]: arr });
    },
    [activeWorkout, updateWorkout],
  );

  const handleInitWarmup = useCallback(() => {
    updateWorkout(activeWorkout.id, { warmup: makeDefaultWarmup() });
  }, [activeWorkout.id, updateWorkout]);

  const handleInitCooldown = useCallback(() => {
    updateWorkout(activeWorkout.id, { cooldown: makeDefaultCooldown() });
  }, [activeWorkout.id, updateWorkout]);

  /**
   * Картка вже викликала `updateItem` з відфільтрованим масивом; тут лише
   * undo-тост, що повертає знімок. Undo відновлює тільки підходи — вже
   * відправлена аналітика не відкочується (та сама політика, що й для
   * undo всього тренування).
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

  const skipRest = useCallback(() => {
    trackFizrukRestTimerDone("skipped");
    setRestTimer(null);
  }, [setRestTimer]);

  const adjustRest = useCallback(
    (seconds: number) =>
      setRestTimer((current) => {
        if (!current) return null;
        const remaining = Math.max(1, current.remaining + seconds);
        return { remaining, total: Math.max(current.total, remaining) };
      }),
    [setRestTimer],
  );

  // Підпис під відліком у доку: який підхід далі (на екрані вправи) або
  // яка вправа наступна (у списку).
  const restHint = (() => {
    if (focused && focused.type === "strength") {
      const sets = focused.sets || [];
      const nextIdx = sets.findIndex((s) => !isSetDone(s));
      if (nextIdx !== -1) return `${ss.restNextSet} ${nextIdx + 1}`;
      const idx = items.findIndex((x) => x.id === focused.id);
      const next = items[idx + 1];
      return next ? `${ss.restNextExercise}: ${next.nameUk}` : null;
    }
    return null;
  })();

  const topMenu: DropdownMenuItem[] =
    !isReadOnly && items.length >= 2 && !focused
      ? [
          {
            type: "item",
            id: "group",
            label: ss.groupIntoSuperset,
            icon: <Icon name="repeat" size={16} aria-hidden />,
            onSelect: enterSelectMode,
          },
        ]
      : [];

  const groupCount = groupSelected.size;
  const groupDisabled = groupCount < 2 || groupCount > 3;

  return (
    <div className="page-tabbar-pad">
      <SessionTopBar
        duration={activeDuration}
        leftLabel={focused ? ss.backToList : ss.collapse}
        onLeft={focused ? () => onOpenItem(null) : onCollapse}
        onFinish={onFinishClick}
        menuItems={topMenu}
        onDeleteWorkout={onDeleteWorkout}
      />

      <div className="mt-3 space-y-3">
        {focused ? (
          <SessionExerciseFocus
            activeWorkout={activeWorkout}
            it={focused}
            items={items}
            group={groupOf.get(focused.id)}
            isReadOnly={isReadOnly}
            lastByExerciseId={lastByExerciseId}
            recBy={recBy}
            updateItem={updateItem}
            setRestTimer={setRestTimer}
            getDefaultForGroup={getDefaultForGroup}
            getDefaultForExercise={getDefaultForExercise}
            setDefaultForExercise={setDefaultForExercise}
            onDeleteSet={handleDeleteSet}
            onOpenItem={(id) => onOpenItem(id)}
            onRemoveItem={() => {
              removeItem(activeWorkout.id, focused.id);
              onOpenItem(null);
            }}
            onUngroup={(() => {
              const g = groupOf.get(focused.id);
              return g && !isReadOnly ? () => handleUngroup(g.id) : null;
            })()}
            onOpenInfo={
              focused.exerciseId && onOpenExerciseInfo
                ? () => onOpenExerciseInfo(focused.exerciseId as string)
                : null
            }
            onOpenStats={
              focused.exerciseId && onOpenExerciseStats
                ? () => onOpenExerciseStats(focused.exerciseId as string)
                : null
            }
          />
        ) : (
          <>
            <div className="text-style-caption text-subtle tabular-nums">
              {ss.startedAt}{" "}
              {new Date(activeWorkout.startedAt).toLocaleTimeString("uk-UA", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ·{" "}
              <span className="font-semibold text-text">
                {progress.exercisesDone} {ss.of} {progress.exercisesTotal}
              </span>{" "}
              {ss.exercisesWord} ·{" "}
              <span className="font-semibold text-text">
                {progress.setsDone}
              </span>{" "}
              {ss.setsDone}
            </div>
            <SessionExtrasRow
              activeWorkout={activeWorkout}
              updateWorkout={updateWorkout}
              pendingRetroEnd={pendingRetroEnd}
              onPendingRetroEndChange={onPendingRetroEndChange}
              onToggleChecklist={handleChecklistToggle}
              onInitWarmup={handleInitWarmup}
              onInitCooldown={handleInitCooldown}
            />
            {groupSelectMode && (
              <div className="text-style-caption text-subtle">
                {ss.selectHint}
              </div>
            )}
            <SessionExerciseList
              items={items}
              groupOf={groupOf}
              isReadOnly={isReadOnly}
              lastByExerciseId={lastByExerciseId}
              recBy={recBy}
              onOpenItem={(id) => onOpenItem(id)}
              onAddExercise={onAddExercise}
              selectMode={groupSelectMode}
              selected={groupSelected}
              onToggleSelect={handleToggleGroupSelect}
            />
            {!isReadOnly && items.length > 0 && !groupSelectMode && (
              <Button
                module="fizruk"
                className="h-11 w-full"
                type="button"
                onClick={onFinishClick}
              >
                {ss.finishLong}
              </Button>
            )}
          </>
        )}
      </div>

      <SessionDock
        restTimer={restTimer}
        onSkipRest={skipRest}
        onAdjustRest={adjustRest}
        restHint={restHint}
      >
        {groupSelectMode ? (
          <>
            <Button
              variant="soft"
              tone="fizruk"
              className="h-11 flex-1"
              disabled={groupDisabled}
              onClick={() => handleCreateGroup("superset")}
            >
              {ss.makeSuperset} ({groupCount}/3)
            </Button>
            <Button
              variant="outline"
              tone="fizruk"
              className="h-11 flex-1"
              disabled={groupDisabled}
              onClick={() => handleCreateGroup("circuit")}
            >
              {ss.makeCircuit} ({groupCount}/3)
            </Button>
            <Button variant="ghost" className="h-11" onClick={cancelSelectMode}>
              {ss.cancelSelect}
            </Button>
          </>
        ) : isReadOnly ? (
          <Button
            variant="secondary"
            className="h-11 flex-1"
            onClick={onCollapse}
          >
            {ss.collapse}
          </Button>
        ) : (
          <>
            <Button
              variant="soft"
              tone="fizruk"
              className="h-11 flex-1"
              onClick={onAddExercise}
              aria-label={ss.addExerciseAria}
            >
              <Icon name="plus" size={16} aria-hidden />
              {ss.addExercise}
            </Button>
            {focused ? (
              <Button
                variant="outline"
                tone="neutral"
                className="h-11"
                onClick={() => {
                  const sec = focused.exerciseId
                    ? (getDefaultForExercise?.(
                        focused.exerciseId,
                        focused.primaryGroup,
                      ) ?? getDefaultForGroup(focused.primaryGroup))
                    : getDefaultForGroup(focused.primaryGroup);
                  setRestTimer({ remaining: sec, total: sec });
                }}
                aria-label={ss.restStartAria}
              >
                <Icon name="clock" size={16} aria-hidden />
                {ss.restNow}
              </Button>
            ) : null}
          </>
        )}
      </SessionDock>
    </div>
  );
}
