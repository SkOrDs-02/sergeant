/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import type {
  Workout,
  WorkoutGroup,
  WorkoutItem,
  WorkoutSet,
} from "@sergeant/fizruk-domain";
import { FizrukData } from "@sergeant/fizruk-domain";
import { Button } from "@shared/components/ui/Button";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@shared/components/ui/DropdownMenu";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { WorkoutItemCard } from "../workouts/WorkoutItemCard";
import {
  countDoneSets,
  groupMemberPosition,
  neighbourItems,
  setsProgressLabel,
} from "./sessionLib";

export interface SessionExerciseFocusProps {
  activeWorkout: Workout;
  it: WorkoutItem;
  items: WorkoutItem[];
  group: WorkoutGroup | null | undefined;
  isReadOnly: boolean;
  lastByExerciseId: Record<string, unknown>;
  recBy: Record<string, unknown>;
  updateItem: (
    workoutId: string,
    itemId: string,
    patch: Partial<WorkoutItem>,
  ) => void;
  setRestTimer: (state: RestTimerState | null) => void;
  getDefaultForGroup: (primaryGroup: string) => number;
  getDefaultForExercise?:
    ((exerciseId: string, primaryGroup: string) => number) | undefined;
  setDefaultForExercise?:
    ((exerciseId: string, sec: number) => void) | undefined;
  onDeleteSet: (
    workoutId: string,
    itemId: string,
    snapshot: WorkoutSet[],
  ) => void;
  onOpenItem: (itemId: string) => void;
  onRemoveItem: () => void;
  onUngroup: (() => void) | null;
  onOpenInfo: (() => void) | null;
  onOpenStats: (() => void) | null;
}

/**
 * Екран однієї вправи всередині сесії (спека `fizruk-active-session.md`,
 * рішення 2): шапка з фото, назвою, позицією «вправа 2 з 5 · 1 з 3
 * підходів» і меню ⋯; тіло — `WorkoutItemCard`; знизу стрілки на сусідні
 * вправи, щоб між вправами ходити без повернення в список.
 */
export function SessionExerciseFocus({
  activeWorkout,
  it,
  items,
  group,
  isReadOnly,
  lastByExerciseId,
  recBy,
  updateItem,
  setRestTimer,
  getDefaultForGroup,
  getDefaultForExercise,
  setDefaultForExercise,
  onDeleteSet,
  onOpenItem,
  onRemoveItem,
  onUngroup,
  onOpenInfo,
  onOpenStats,
}: SessionExerciseFocusProps) {
  const ss = messages.fizruk.session;
  const idx = items.findIndex((x) => x.id === it.id);
  const { prev, next } = neighbourItems(items, it.id);
  const pos = groupMemberPosition(it, group);
  const sets = it.sets || [];
  const image = it.exerciseId
    ? FizrukData.exerciseImagePaths(it.exerciseId)[0]
    : undefined;

  const subline =
    it.type === "strength"
      ? `${ss.exerciseOf} ${idx + 1} ${ss.of} ${items.length} · ${setsProgressLabel(countDoneSets(it), sets.length)}`
      : `${ss.exerciseOf} ${idx + 1} ${ss.of} ${items.length}`;

  const menuItems: DropdownMenuItem[] = [
    ...(onOpenInfo
      ? [
          {
            type: "item" as const,
            id: "info",
            label: ss.aboutExercise,
            icon: <Icon name="info" size={16} aria-hidden />,
            onSelect: onOpenInfo,
          },
        ]
      : []),
    ...(onOpenStats
      ? [
          {
            type: "item" as const,
            id: "stats",
            label: ss.exerciseStats,
            icon: <Icon name="trending-up" size={16} aria-hidden />,
            onSelect: onOpenStats,
          },
        ]
      : []),
    ...(onUngroup
      ? [
          {
            type: "item" as const,
            id: "ungroup",
            label: ss.ungroup,
            icon: <Icon name="scissors" size={16} aria-hidden />,
            onSelect: onUngroup,
          },
        ]
      : []),
    ...(!isReadOnly
      ? [
          {
            type: "item" as const,
            id: "remove",
            label: ss.removeFromWorkout,
            icon: <Icon name="trash" size={16} aria-hidden />,
            destructive: true,
            onSelect: onRemoveItem,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <section
        aria-labelledby={`session-exercise-${it.id}`}
        className="rounded-2xl border border-line bg-panel p-3 shadow-e1"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-panelHi">
            {image ? (
              <img
                src={image}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Icon
                name="dumbbell"
                size={22}
                className="text-subtle"
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id={`session-exercise-${it.id}`}
              className="flex items-center gap-2 text-style-label-lg font-bold leading-tight text-text"
            >
              {pos != null ? (
                <span className="rounded-md bg-fizruk-surface px-1.5 text-style-caption font-bold text-fizruk-soft-fg">
                  A{pos}
                </span>
              ) : null}
              <span className="truncate">{it.nameUk}</span>
            </h2>
            <div className="mt-0.5 text-style-caption text-subtle tabular-nums">
              {subline}
            </div>
          </div>
          <DropdownMenu
            ariaLabel={`${ss.moreActions}: ${it.nameUk}`}
            items={menuItems}
            placement="bottom-end"
            trigger={
              <Button
                variant="outline"
                tone="neutral"
                size="md"
                iconOnly
                type="button"
                aria-label={`${ss.moreActions}: ${it.nameUk}`}
              >
                <Icon name="more-horizontal" size={16} aria-hidden />
              </Button>
            }
          />
        </div>
        <div className="mt-2">
          <WorkoutItemCard
            it={it}
            activeWorkout={activeWorkout}
            group={group}
            isReadOnly={isReadOnly}
            lastByExerciseId={lastByExerciseId}
            recBy={recBy}
            updateItem={updateItem}
            setRestTimer={setRestTimer}
            getDefaultForGroup={getDefaultForGroup}
            getDefaultForExercise={getDefaultForExercise}
            setDefaultForExercise={setDefaultForExercise}
            onDeleteSet={onDeleteSet}
          />
        </div>
      </section>

      <nav
        aria-label={ss.neighboursAria}
        className="flex items-center justify-between gap-2"
      >
        {/* Кнопки без сусіда не рендеримо взагалі: вимкнений контрол із
            прочерком читався як зламаний елемент (браузерний прохід
            2026-09-11). Порожній `span` тримає другу кнопку праворуч. */}
        {prev ? (
          <button
            type="button"
            onClick={() => onOpenItem(prev.id)}
            aria-label={`${ss.prevExercise}: ${prev.nameUk}`}
            className="focus-ring flex min-h-[44px] min-w-0 items-center gap-1 rounded-xl px-2 text-style-label text-muted hover:text-text"
          >
            <Icon name="chevron-left" size={16} aria-hidden />
            <span className="truncate">{prev.nameUk}</span>
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button
            type="button"
            onClick={() => onOpenItem(next.id)}
            aria-label={`${ss.nextExercise}: ${next.nameUk}`}
            className="focus-ring flex min-h-[44px] min-w-0 items-center justify-end gap-1 rounded-xl px-2 text-style-label font-semibold text-fizruk-strong dark:text-fizruk hover:bg-fizruk-surface"
          >
            <span className="truncate">{next.nameUk}</span>
            <Icon name="chevron-right" size={16} aria-hidden />
          </button>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
