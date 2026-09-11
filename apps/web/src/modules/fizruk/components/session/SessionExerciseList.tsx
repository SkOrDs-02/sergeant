/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import type { WorkoutGroup, WorkoutItem } from "@sergeant/fizruk-domain";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { fmtLoose } from "../../lib/numberFmt";
import type { LastByExerciseEntry } from "../workouts/WorkoutItemLastTimeHint";
import { filterNonEmptyStrengthSets } from "../workouts/WorkoutItemLastTimeHint";
import { isSetDone } from "../workouts/WorkoutSetRow";
import { summarizeRecoveryChip } from "../workouts/WorkoutItemRecoveryChip";
import {
  groupMemberPosition,
  itemStates,
  setsProgressLabel,
  type SessionItemState,
} from "./sessionLib";

export interface SessionExerciseListProps {
  items: WorkoutItem[];
  groupOf: Map<string, WorkoutGroup>;
  isReadOnly: boolean;
  lastByExerciseId: Record<string, unknown>;
  recBy: Record<string, unknown>;
  onOpenItem: (itemId: string) => void;
  onAddExercise: () => void;
  /** Режим вибору для суперсету: рядки стають чекбоксами. */
  selectMode: boolean;
  selected: Set<string>;
  onToggleSelect: (itemId: string) => void;
}

/**
 * Один короткий факт під назвою вправи — те, чого людині бракує, щоб
 * вирішити «відкривати чи ні»: скільки підходів зроблено, або ціль із
 * минулого разу, або біль. Один рядок, найважливіше першим.
 */
function rowSubline(
  it: WorkoutItem,
  state: SessionItemState,
  last: LastByExerciseEntry | undefined,
  recBy: Record<string, unknown>,
): { text: string; danger: boolean } {
  const ss = messages.fizruk.session;
  const rec = summarizeRecoveryChip(it, recBy);
  if (rec?.tone === "red") return { text: rec.label, danger: true };
  if (it.type === "strength") {
    const sets = it.sets || [];
    const done = sets.filter(isSetDone).length;
    if (done > 0 || state === "done") {
      const lastDone = [...sets].reverse().find(isSetDone);
      const tail = lastDone
        ? ` · ${fmtLoose(lastDone.weightKg ?? 0)} кг × ${lastDone.reps}`
        : "";
      return {
        text: `${setsProgressLabel(done, sets.length)}${tail}`,
        danger: false,
      };
    }
    const ghost =
      last?.type === "strength"
        ? filterNonEmptyStrengthSets(last.sets)[0]
        : undefined;
    if (ghost) {
      return {
        text: `${ss.lastTime}: ${fmtLoose(ghost.weightKg ?? 0)} кг × ${ghost.reps}`,
        danger: false,
      };
    }
    return { text: setsProgressLabel(done, sets.length), danger: false };
  }
  if (it.type === "time") {
    return {
      text: it.durationSec ? `${it.durationSec} с` : ss.stateCurrent,
      danger: false,
    };
  }
  return {
    text: it.distanceM ? `${it.distanceM} м` : ss.stateCurrent,
    danger: false,
  };
}

/**
 * Огляд сесії як чекліст вправ (спека `fizruk-active-session.md`,
 * рішення 2): номер, назва, стан «зроблено / поточна / далі» і один факт.
 * Тап відкриває екран вправи. Суперсет позначений A1/A2 у рядках, без
 * окремого контейнера — межа групи тут не потрібна, бо підходів у списку
 * немає.
 */
export function SessionExerciseList({
  items,
  groupOf,
  isReadOnly,
  lastByExerciseId,
  recBy,
  onOpenItem,
  onAddExercise,
  selectMode,
  selected,
  onToggleSelect,
}: SessionExerciseListProps) {
  const ss = messages.fizruk.session;
  const states = itemStates(items);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel px-4 py-8 text-center">
        <div className="text-style-label text-text">{ss.emptyTitle}</div>
        <div className="mt-1 text-style-caption text-subtle">
          {ss.emptyBody}
        </div>
        {!isReadOnly && (
          <div className="mt-4">
            <Button
              module="fizruk"
              className="h-11 w-full"
              onClick={onAddExercise}
              aria-label={ss.addExerciseAria}
            >
              <Icon name="plus" size={16} aria-hidden />
              {ss.addExercise}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-e1">
      <ul className="divide-y divide-line">
        {items.map((it, idx) => {
          const state = states[idx] ?? "todo";
          const group = groupOf.get(it.id);
          const pos = groupMemberPosition(it, group);
          const last = it.exerciseId
            ? (lastByExerciseId[it.exerciseId] as
                LastByExerciseEntry | undefined)
            : undefined;
          const sub = rowSubline(it, state, last, recBy);
          const isCurrent = state === "current" && !isReadOnly;
          const checked = selected.has(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                role={selectMode ? "checkbox" : undefined}
                aria-checked={selectMode ? checked : undefined}
                aria-label={
                  selectMode
                    ? `${it.nameUk}: ${ss.groupIntoSuperset}`
                    : `${ss.openExercise}: ${it.nameUk}`
                }
                aria-current={isCurrent ? "step" : undefined}
                onClick={() =>
                  selectMode ? onToggleSelect(it.id) : onOpenItem(it.id)
                }
                className={cn(
                  "focus-ring flex min-h-[72px] w-full items-center gap-3 py-2.5 pr-3 text-left transition-colors",
                  // Ліва акцентна рейка звʼязує сусідні рядки однієї групи:
                  // самих міток A1/A2 було замало, щоб побачити суперсет як
                  // одне ціле (браузерний прохід 2026-09-11). Контейнера тут
                  // свідомо немає — у списку немає підходів, які він мав би
                  // окреслювати.
                  pos != null
                    ? "border-l-[3px] border-fizruk pl-[9px]"
                    : "border-l-[3px] border-transparent pl-[9px]",
                  isCurrent ? "bg-fizruk-surface" : "hover:bg-panelHi",
                  selectMode && checked && "bg-fizruk-surface",
                )}
              >
                {selectMode ? (
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                      checked
                        ? "border-fizruk-strong bg-fizruk-strong text-white dark:bg-fizruk dark:text-bg"
                        : "border-border-strong bg-panel",
                    )}
                  >
                    {checked ? <Icon name="check" size={14} /> : null}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-style-label font-bold tabular-nums",
                      state === "done"
                        ? "border-success/40 bg-success/10 text-success-strong dark:text-success"
                        : isCurrent
                          ? "border-fizruk-ring bg-panel text-fizruk-strong dark:text-fizruk"
                          : "border-line bg-panelHi text-subtle",
                    )}
                  >
                    {state === "done" ? (
                      <Icon name="check" size={18} />
                    ) : (
                      idx + 1
                    )}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {pos != null ? (
                      <span className="rounded-md bg-fizruk-surface px-1.5 text-style-caption font-bold text-fizruk-soft-fg">
                        A{pos}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "truncate text-style-label",
                        isCurrent ? "font-bold text-text" : "font-semibold",
                        state === "done" ? "text-muted" : "text-text",
                      )}
                    >
                      {it.nameUk}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-style-caption",
                      sub.danger
                        ? "font-semibold text-danger-strong dark:text-danger"
                        : "text-subtle",
                    )}
                  >
                    {sub.text}
                  </span>
                </span>
                {!selectMode && (
                  <Icon
                    name="chevron-right"
                    size={18}
                    className={cn(
                      "shrink-0",
                      isCurrent
                        ? "text-fizruk-strong dark:text-fizruk"
                        : "text-subtle",
                    )}
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {/* «+ Вправа» тут НЕМАЄ навмисно: дію несе докована панель, яка
          видима завжди. Два однакові CTA на одному короткому екрані —
          те, що показав браузерний прохід 2026-09-11. */}
    </div>
  );
}
