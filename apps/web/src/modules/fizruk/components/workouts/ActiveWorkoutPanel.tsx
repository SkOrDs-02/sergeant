import { useCallback, useId, useMemo, useState } from "react";
import type {
  ChecklistItem,
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { useRestSettings } from "../../hooks/useRestSettings";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import {
  makeDefaultWarmup,
  makeDefaultCooldown,
} from "../../hooks/useWorkouts";
import { Card } from "@shared/components/ui/Card";
import {
  uid,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from "./activeWorkoutLib";
import { WarmupCooldownChecklist } from "./WarmupCooldownChecklist";
import { SupersetBadge } from "./SupersetBadge";
import { WorkoutItemCard } from "./WorkoutItemCard";

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
  const dtFieldsId = useId();
  const workoutStartId = `${dtFieldsId}-started`;
  const workoutEndId = `${dtFieldsId}-ended`;
  const { getDefaultForGroup } = useRestSettings();
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelected, setGroupSelected] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const isReadOnly = Boolean(activeWorkout?.endedAt);

  const groups = useMemo<WorkoutGroup[]>(
    () => activeWorkout?.groups || [],
    [activeWorkout?.groups],
  );
  const items = useMemo<WorkoutItem[]>(
    () => activeWorkout?.items || [],
    [activeWorkout?.items],
  );
  const itemIdToGroup = useMemo(() => {
    const m = new Map<string, WorkoutGroup>();
    for (const g of groups) {
      for (const id of g.itemIds || []) m.set(id, g);
    }
    return m;
  }, [groups]);

  const handleToggleGroupSelect = useCallback((itemId: string) => {
    setGroupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const handleCreateSuperset = useCallback(
    (type: WorkoutGroupType) => {
      if (!activeWorkout) return;
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
    [activeWorkout, groupSelected, groups, updateWorkout],
  );

  const handleRemoveGroup = useCallback(
    (groupId: string) => {
      if (!activeWorkout) return;
      updateWorkout(activeWorkout.id, {
        groups: groups.filter((g) => g.id !== groupId),
      });
    },
    [activeWorkout, groups, updateWorkout],
  );

  const handleGroupRestSec = useCallback(
    (groupId: string, sec: number) => {
      if (!activeWorkout) return;
      updateWorkout(activeWorkout.id, {
        groups: groups.map((g) =>
          g.id === groupId ? { ...g, restSec: sec } : g,
        ),
      });
    },
    [activeWorkout, groups, updateWorkout],
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
        onToggleGroupSelect={handleToggleGroupSelect}
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
      handleToggleGroupSelect,
      isReadOnly,
      itemIdToGroup,
      lastByExerciseId,
      musclesUk,
      recBy,
      removeItem,
      setRestTimer,
      updateItem,
    ],
  );

  const renderedItemsList = useMemo(() => {
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
      const qOpts = [60, 90, 120, 180].filter(
        (s: number) => s !== group.restSec,
      );

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
          {!activeWorkout?.endedAt && (
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

    return rendered;
  }, [
    activeWorkout,
    handleGroupRestSec,
    handleRemoveGroup,
    itemIdToGroup,
    items,
    renderItem,
    setRestTimer,
  ]);

  if (!activeWorkout) return null;

  return (
    <Card radius="lg">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-text">
            {activeWorkout.endedAt
              ? "Завершене тренування"
              : "Активне тренування"}
          </div>
          <div className="text-xs text-subtle mt-0.5">
            {new Date(activeWorkout.startedAt).toLocaleString("uk-UA", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {activeDuration ? (
              <span className="ml-2">· {activeDuration}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!activeWorkout.endedAt ? (
            <Button
              size="sm"
              className="h-9 px-4"
              type="button"
              onClick={onFinishClick}
            >
              Завершити
            </Button>
          ) : onCollapse ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-4"
              type="button"
              onClick={onCollapse}
              aria-label="Згорнути завершене тренування"
            >
              Згорнути
            </Button>
          ) : (
            <span className="text-xs text-subtle">Завершено</span>
          )}
          <Button
            variant="danger"
            size="sm"
            className="h-9 px-4"
            type="button"
            onClick={onDeleteWorkout}
          >
            Видалити
          </Button>
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-line bg-panelHi/50 px-3 py-2">
        <summary className="text-xs font-semibold text-subtle cursor-pointer select-none">
          Час тренування
        </summary>
        <div className="mt-2 space-y-2">
          <label
            className="block text-2xs text-subtle"
            htmlFor={workoutStartId}
          >
            Початок
          </label>
          <input
            id={workoutStartId}
            type="datetime-local"
            className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
            value={isoToDatetimeLocalValue(activeWorkout.startedAt)}
            onChange={(e) => {
              const iso = datetimeLocalValueToIso(e.target.value);
              if (iso) updateWorkout(activeWorkout.id, { startedAt: iso });
            }}
          />
          {activeWorkout.endedAt ? (
            <>
              <label
                className="block text-2xs text-subtle"
                htmlFor={workoutEndId}
              >
                Завершення (можна виправити після занесення)
              </label>
              <input
                id={workoutEndId}
                type="datetime-local"
                className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                value={isoToDatetimeLocalValue(activeWorkout.endedAt)}
                onChange={(e) => {
                  const iso = datetimeLocalValueToIso(e.target.value);
                  updateWorkout(activeWorkout.id, { endedAt: iso || null });
                }}
              />
            </>
          ) : null}
        </div>
      </details>

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
        {!activeWorkout.endedAt && (activeWorkout.items || []).length >= 2 && (
          <div className="flex items-center gap-2">
            {!groupSelectMode ? (
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-xl border border-line text-subtle hover:text-text hover:bg-panelHi transition-colors"
                onClick={() => {
                  setGroupSelectMode(true);
                  setGroupSelected(new Set());
                }}
              >
                ⊕ Об{"'"}єднати в суперсет
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-xl border border-success/40 text-success bg-success/10 hover:bg-success/20 transition-colors disabled:opacity-40"
                  disabled={groupSelected.size < 2 || groupSelected.size > 3}
                  onClick={() => handleCreateSuperset("superset")}
                  title="Обери 2-3 вправи"
                >
                  Суперсет ({groupSelected.size}/3)
                </button>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-xl border border-fizruk/40 text-fizruk bg-fizruk/10 hover:bg-fizruk/20 transition-colors disabled:opacity-40"
                  disabled={groupSelected.size < 2 || groupSelected.size > 3}
                  onClick={() => handleCreateSuperset("circuit")}
                  title="Обери 2-3 вправи"
                >
                  Коло ({groupSelected.size}/3)
                </button>
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-xl border border-line text-subtle hover:text-text transition-colors"
                  onClick={() => {
                    setGroupSelectMode(false);
                    setGroupSelected(new Set());
                  }}
                >
                  Скасувати
                </button>
              </>
            )}
          </div>
        )}
        {renderedItemsList}
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
