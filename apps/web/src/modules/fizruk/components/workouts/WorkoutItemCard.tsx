/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { MAX_DISTANCE_M, MAX_DURATION_SEC } from "../../lib/numericBounds";
import type {
  Workout,
  WorkoutGroup,
  WorkoutItem,
  WorkoutSet,
} from "@sergeant/fizruk-domain";
import {
  getRestCategory,
  REST_CATEGORY_LABELS,
} from "../../hooks/useRestSettings";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseWorkoutSetSpeech } from "@sergeant/shared";
import { calcCardioMetrics } from "./activeWorkoutLib";
import { SupersetMemberLabel } from "./SupersetBadge";
import {
  filterNonEmptyStrengthSets,
  WorkoutItemLastTimeHint,
  type LastByExerciseEntry,
} from "./WorkoutItemLastTimeHint";
import { WorkoutItemNextSetHint } from "./WorkoutItemNextSetHint";
import { WorkoutItemRecoveryChip } from "./WorkoutItemRecoveryChip";
import { WorkoutItemRestPresets } from "./WorkoutItemRestPresets";
import { isSetDone, WorkoutSetRow } from "./WorkoutSetRow";
import { buildTypeSwitchPatch } from "./WorkoutItemTypeSwitcher";
import { Segmented } from "@shared/components/ui/Segmented";
import { messages } from "@shared/i18n/uk";

import { useFizrukRoute } from "../../hooks/useFizrukRoute";

export type WorkoutItemCardProps = {
  it: WorkoutItem;
  activeWorkout: Workout;
  group: WorkoutGroup | null | undefined;
  /** 1-based position of `it` inside `group.itemIds` — renders as an
   * "A1"/"A2" ordinal next to the title (see `SupersetMemberLabel`).
   * `undefined` for standalone items or while `groupSelectMode` is on. */
  groupMemberPosition?: number | undefined;
  groupSelectMode: boolean;
  isSelected: boolean;
  isReadOnly: boolean;
  lastByExerciseId: Record<string, unknown>;
  musclesUk: Record<string, string>;
  recBy: Record<string, unknown>;
  onToggleGroupSelect: (id: string) => void;
  removeItem: (workoutId: string, itemId: string) => void;
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
  /**
   * Called after updateItem is invoked with the filtered sets array.
   * Receives the workout id, item id, and the snapshot of the sets array
   * BEFORE deletion so the parent can fire an undo toast that restores it.
   */
  onDeleteSet: (
    workoutId: string,
    itemId: string,
    snapshot: WorkoutSet[],
  ) => void;
};

/** Last SET in `sets` with both weight AND reps logged (>0), or `null`
 * when none qualify. Used by "+ Підхід" to copy forward the most
 * recently completed set instead of appending a blank `0×0` row. */
function findLastDoneSet(sets: WorkoutSet[]): WorkoutSet | null {
  for (let i = sets.length - 1; i >= 0; i -= 1) {
    const s = sets[i];
    if (s && isSetDone(s)) return s;
  }
  return null;
}

/**
 * Single editable workout-item tile rendered inside `ActiveWorkoutPanel`.
 *
 * Hosts type-specific inputs (strength sets / time / distance), the
 * per-row "previous time" ghost, a compact recovery-conflict chip, the
 * per-item rest timer, and the multi-select checkbox used when the
 * user is grouping items into a superset/circuit.
 *
 * Pure presentational component: every mutation (`updateItem`,
 * `removeItem`, `setRestTimer`, `onToggleGroupSelect`) flows through a
 * prop. It also reads default rest seconds via `getDefaultForGroup`
 * (passed from the panel so the component doesn't reach into the hook
 * tree itself).
 */
export function WorkoutItemCard({
  it,
  activeWorkout,
  group,
  groupMemberPosition,
  groupSelectMode,
  isSelected,
  isReadOnly,
  lastByExerciseId,
  musclesUk,
  recBy,
  onToggleGroupSelect,
  removeItem,
  updateItem,
  setRestTimer,
  getDefaultForGroup,
  getDefaultForExercise,
  setDefaultForExercise,
  onDeleteSet,
}: WorkoutItemCardProps) {
  // Path-based deep-link into the Exercise detail page. The legacy
  // `window.location.hash = "#exercise/<id>"` callsite became a silent
  // no-op once Fizruk migrated to react-router under initiative 0006
  // §Phase 2.c (#2541): pathname stays `/fizruk/workouts`, so the
  // hash change never re-renders the router. Routing through
  // `useFizrukRoute()` (path-based) keeps the deep-link working.
  const { navigate } = useFizrukRoute();
  const last = it.exerciseId
    ? (lastByExerciseId[it.exerciseId] as LastByExerciseEntry | undefined)
    : undefined;
  const cardioMetrics =
    it.type === "distance"
      ? calcCardioMetrics(it.distanceM, it.durationSec)
      : null;
  // Per-row "було" ghosts (item 1): same-position sets from the last
  // session, filtered with the domain's non-empty criterion. Index N
  // of this array suggests values for row N of the current sets list.
  const lastFilteredSets =
    last?.type === "strength" ? filterNonEmptyStrengthSets(last.sets) : [];

  const defSec = it.exerciseId
    ? (getDefaultForExercise?.(it.exerciseId, it.primaryGroup) ??
      getDefaultForGroup(it.primaryGroup))
    : getDefaultForGroup(it.primaryGroup);
  const cat = getRestCategory(it.primaryGroup);
  const catLabel = REST_CATEGORY_LABELS[cat] || "";
  const quickOptions = [60, 90, 120, 180].filter((s) => s !== defSec);

  // WorkoutSet has no stable id in `@sergeant/fizruk-domain` (it's just
  // `{weightKg, reps}`) — adding one is a domain-type change out of
  // scope for this component. `key={idx}` therefore let React reuse the
  // wrong DOM node after a mid-list delete: the row that had focus kept
  // its node, but that node's data silently jumped to the neighbouring
  // set. We keep a session-local id per set in state instead (NOT a
  // ref — `react-hooks/refs` forbids reading `ref.current` during
  // render, and this array is read every render to build `key`s):
  // appended when the list grows, spliced out at the exact index the
  // per-row delete handler removes. Every `sets`-length mutation site
  // below (delete, "+ Підхід", voice add) updates this array in
  // lockstep, so the id↔set mapping can't drift as long as they stay in
  // sync. `setKeys[idx]` falls back to a positional key if it ever does
  // (e.g. an external non-add/delete mutation of `sets` — notably a
  // type-switch from `ExerciseDetailSheet`/`WorkoutItemTypeSwitcher`,
  // which lives outside this component and can't reach `setSetIds`) —
  // no worse than the original `key={idx}`.
  const [setIds, setSetIds] = useState<string[]>(() =>
    (it.sets || []).map(() => crypto.randomUUID()),
  );
  const sets = it.sets || [];
  const setKeys = sets.map((_s, idx) => setIds[idx] ?? `set-fallback-${idx}`);

  return (
    <div
      className={`border rounded-2xl p-3 bg-bg transition-colors ${groupSelectMode && isSelected ? "border-success bg-success/5" : "border-line"}`}
    >
      <WorkoutItemLastTimeHint last={last} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {groupSelectMode && (
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`${it.nameUk}: вибрати для обʼєднання в суперсет`}
                className={`w-5 h-5 rounded-xl border flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${isSelected ? "bg-success-strong border-success-strong text-white" : "border-line bg-bg"}`}
                onClick={() => onToggleGroupSelect(it.id)}
              >
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5l2.5 2.5L8 3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              className="text-style-label text-text truncate text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              onClick={() => {
                if (it.exerciseId) navigate(`exercise/${it.exerciseId}`);
              }}
            >
              {it.nameUk}
            </button>
            {group && !groupSelectMode && groupMemberPosition != null && (
              <SupersetMemberLabel position={groupMemberPosition} />
            )}
            <WorkoutItemRecoveryChip it={it} recBy={recBy} />
          </div>
          <div className="text-style-caption text-subtle mt-0.5">
            Мʼязи:{" "}
            {/* Типографіка тексту, правило 3: ієрархію несе ВАГА, не третій
                відтінок. Тут стояв `text-muted` поверх батьківського
                `text-subtle` — і тони суперечили вазі: `muted` (#a3aea6,
                до 2026-08-21 #8a968e) СВІТЛІШИЙ за `subtle` (#8a968e, було
                #5f6b64), тобто напівжирне «важливіше»
                фарбувалось у «менш важливе». Тон успадковується, виділяє
                лише вага. */}
            <span className="font-semibold">
              {(it.musclesPrimary || [])
                .map((id) => musclesUk?.[id] || id)
                .join(", ") || "—"}
            </span>
          </div>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 rounded-xl pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] text-style-caption text-danger-strong dark:text-danger hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={() => removeItem(activeWorkout.id, it.id)}
            aria-label="Видалити вправу з тренування"
          >
            <Icon name="trash" size={15} aria-hidden />
          </button>
        )}
      </div>

      {!isReadOnly && (
        <div className="mt-2">
          {/*
            Компактний перемикач типу (повернено після скарги власника
            2026-08-08). Редизайн (item 5) виніс повнорозмірний контрол в
            `ExerciseDetailSheet`, але звідти він фактично недосяжний для
            вправи в активному тренуванні: тап по назві веде на сторінку
            статистики вправи, а не в аркуш, тож перемкнути «час/дистанцію»
            для КОНКРЕТНОЇ вправи стало неможливо. Тут — `size="sm"` без
            панелі й заголовка, щоб не повертати старий габарит.
          */}
          <Segmented
            variant="fizruk"
            size="sm"
            ariaLabel={`${messages.fizruk.typeSwitcher.ariaLabel}: ${it.nameUk}`}
            className="gap-1.5"
            value={it.type || "strength"}
            items={[
              {
                value: "strength",
                label: messages.fizruk.typeSwitcher.strengthLabel,
                title: messages.fizruk.typeSwitcher.strengthTitle,
                ariaLabel: messages.fizruk.typeSwitcher.strengthAriaLabel,
              },
              {
                value: "time",
                label: messages.fizruk.typeSwitcher.timeLabel,
                title: messages.fizruk.typeSwitcher.timeTitle,
                ariaLabel: messages.fizruk.typeSwitcher.timeAriaLabel,
              },
              {
                value: "distance",
                label: messages.fizruk.typeSwitcher.distanceLabel,
                title: messages.fizruk.typeSwitcher.distanceTitle,
                ariaLabel: messages.fizruk.typeSwitcher.distanceAriaLabel,
              },
            ]}
            onChange={(t) => {
              const patch = buildTypeSwitchPatch(t, it);
              // Тримаємо stable-key bookkeeping (див. коментар біля
              // `setIds`) у локстепі з посівом сетів при перемиканні на
              // силову — цей колсайт, на відміну від аркуша, МОЖЕ дістати
              // `setSetIds`.
              if (t === "strength") {
                setSetIds((patch.sets || []).map(() => crypto.randomUUID()));
              }
              updateItem(activeWorkout.id, it.id, patch);
            }}
          />
        </div>
      )}

      {it.type === "strength" && (
        <WorkoutItemNextSetHint
          last={last}
          exerciseId={it.exerciseId}
          isReadOnly={isReadOnly}
          onApply={(weightKg, reps) => {
            // Підказка заповнює перший порожній рядок, а якщо всі вже
            // заповнені — додає новий підхід. Наявні значення не чіпаємо:
            // це підказка, а не автомат.
            const currentSets = it.sets || [];
            const emptyIdx = currentSets.findIndex((s) => !isSetDone(s));
            if (emptyIdx === -1) {
              setSetIds((prev) => [...prev, crypto.randomUUID()]);
              updateItem(activeWorkout.id, it.id, {
                sets: [...currentSets, { weightKg, reps }],
              });
              return;
            }
            const next = [...currentSets];
            next[emptyIdx] = { ...next[emptyIdx], weightKg, reps };
            updateItem(activeWorkout.id, it.id, { sets: next });
          }}
        />
      )}

      {it.type === "strength" && (
        <div className="mt-2 space-y-1.5">
          {sets.map((s, idx) => (
            <WorkoutSetRow
              key={setKeys[idx]}
              index={idx}
              set={s}
              ghost={lastFilteredSets[idx] ?? null}
              isReadOnly={isReadOnly}
              onChangeWeight={(weightKg) => {
                const next = [...(it.sets || [])];
                const current = next[idx];
                if (!current) return;
                next[idx] = { ...current, weightKg };
                updateItem(activeWorkout.id, it.id, { sets: next });
              }}
              onChangeReps={(reps) => {
                const next = [...(it.sets || [])];
                const current = next[idx];
                if (!current) return;
                next[idx] = { ...current, reps };
                updateItem(activeWorkout.id, it.id, { sets: next });
              }}
              onApplyGhost={() => {
                const ghost = lastFilteredSets[idx];
                if (!ghost) return;
                const next = [...(it.sets || [])];
                const current = next[idx];
                if (!current) return;
                next[idx] = {
                  ...current,
                  weightKg: ghost.weightKg ?? 0,
                  reps: ghost.reps ?? 0,
                };
                updateItem(activeWorkout.id, it.id, { sets: next });
              }}
              onCheckTap={() => {
                // Explicit start (item 2): the rest timer used to
                // auto-fire from the reps `onChange` transition
                // 0 → N, which is exactly what produced stray 0×0
                // sets — logging a rep count no longer has a side
                // effect. Same grouped/ended-workout guard as before.
                if (!activeWorkout.endedAt && !group) {
                  setRestTimer({ remaining: defSec, total: defSec });
                }
              }}
              onDelete={() => {
                const currentSets = it.sets || [];
                const snapshot = [...currentSets];
                const next = currentSets.filter((_, i) => i !== idx);
                // Keep the stable-key bookkeeping (see comment near
                // `setIds` above) in lockstep with the delete so the
                // surviving rows keep their own DOM nodes.
                setSetIds((prev) => prev.filter((_id, i) => i !== idx));
                updateItem(activeWorkout.id, it.id, { sets: next });
                onDeleteSet(activeWorkout.id, it.id, snapshot);
              }}
            />
          ))}
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 h-10 min-h-[44px]"
                type="button"
                onClick={() => {
                  const currentSets = it.sets || [];
                  // Item 4: copy the last COMPLETED set forward instead
                  // of appending a blank `{0,0}` row — a fresh set
                  // almost always repeats the previous weight/reps.
                  // Falls back to the same-position "було" ghost when
                  // nothing in the current list is done yet, and to an
                  // empty row only when neither exists (first-ever log
                  // of this exercise).
                  const lastDone = findLastDoneSet(currentSets);
                  const ghostFallback = lastFilteredSets[currentSets.length];
                  const seed = lastDone
                    ? { weightKg: lastDone.weightKg, reps: lastDone.reps }
                    : ghostFallback
                      ? {
                          weightKg: ghostFallback.weightKg ?? 0,
                          reps: ghostFallback.reps ?? 0,
                        }
                      : { weightKg: 0, reps: 0 };
                  setSetIds((prev) => [...prev, crypto.randomUUID()]);
                  updateItem(activeWorkout.id, it.id, {
                    sets: [...currentSets, seed],
                  });
                }}
              >
                + Підхід
              </Button>
              <VoiceMicButton
                size="md"
                label="Голосовий ввід підходу"
                // Domain prompt steers Whisper toward the canonical
                // weight/reps shape ("80 кг 8 разів"). Without it Whisper
                // tends to spell short numbers out ("вісімдесят кілограмів"),
                // which the parser handles too — but digits are easier to
                // confirm visually when the user replays the transcript.
                promptHint="Вправа з вагою та повтореннями: жим штанги 80 кг 8 разів, присідання 100 кг 5 повторень."
                // AI-DANGER: voice (Whisper) set-commit path. The all-null
                // guard, the optimistic `updateItem` append, and the auto
                // rest-timer start are tightly coupled. Removing the guard
                // injects 0×0 sets that the cloud-sync queue silently
                // persists; starting the rest timer on an ended/grouped
                // workout is wrong. Re-verify the parser contract in
                // speechParsers.ts before touching any of these. Voice
                // entry keeps its auto-start on purpose (2026-08 redesign,
                // item 2) — the spoken set is already a complete, explicit
                // action, unlike the old silent 0→N `onChange` heuristic.
                onResult={(transcript) => {
                  const parsed = parseWorkoutSetSpeech(transcript);
                  // Refuse to add an empty set: parser returns a truthy
                  // object with all-null metrics whenever nothing usable
                  // was understood (see speechParsers.ts contract). Without
                  // this guard the user sees a 0×0 set + rest timer and no
                  // explanation — surprising at best, data-corrupting at
                  // worst (silently logged by the cloud-sync queue).
                  if (
                    !parsed ||
                    (parsed.weight == null &&
                      parsed.reps == null &&
                      parsed.sets == null)
                  ) {
                    return;
                  }
                  const newSet = {
                    weightKg: parsed.weight ?? 0,
                    reps: parsed.reps ?? 0,
                  };
                  setSetIds((prev) => [...prev, crypto.randomUUID()]);
                  updateItem(activeWorkout.id, it.id, {
                    sets: [...(it.sets || []), newSet],
                  });
                  if (!activeWorkout.endedAt && !group) {
                    setRestTimer({ remaining: defSec, total: defSec });
                  }
                }}
              />
            </div>
          )}
          {!activeWorkout.endedAt && !group && (
            <WorkoutItemRestPresets
              catLabel={catLabel}
              defSec={defSec}
              quickOptions={quickOptions}
              exerciseId={it.exerciseId}
              setRestTimer={setRestTimer}
              setDefaultForExercise={setDefaultForExercise}
            />
          )}
        </div>
      )}

      {it.type === "time" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
            type="number"
            inputMode="numeric"
            placeholder="сек"
            aria-label="Тривалість у секундах"
            value={it.durationSec || ""}
            readOnly={isReadOnly}
            onFocus={(e) => e.target.select()}
            onChange={(e) =>
              updateItem(activeWorkout.id, it.id, {
                durationSec: clampNumericInput(
                  e.target.value,
                  MAX_DURATION_SEC,
                ),
              })
            }
          />
          {/* AI-DANGER: `text-xs` — розмір КОНТРОЛА. Блок навмисно
              повторює форму поля вводу поруч (`h-10`, та сама рамка й
              радіус): це підказка формату, вирівняна з полем, а не
              підпис під ним. Роль тексту зламала б цю рівність. */}
          <div className="h-10 rounded-xl border border-line bg-bg px-3 text-xs text-subtle flex items-center">
            Напр: планка, ізометрія
          </div>
        </div>
      )}

      {it.type === "distance" && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
              type="number"
              inputMode="numeric"
              placeholder="метри"
              min={0}
              max={MAX_DISTANCE_M}
              aria-label="Дистанція в метрах"
              value={it.distanceM || ""}
              readOnly={isReadOnly}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                updateItem(activeWorkout.id, it.id, {
                  distanceM: clampNumericInput(e.target.value, MAX_DISTANCE_M),
                })
              }
            />
            <input
              className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
              type="number"
              inputMode="numeric"
              placeholder="сек"
              aria-label="Тривалість у секундах"
              value={it.durationSec || ""}
              readOnly={isReadOnly}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                updateItem(activeWorkout.id, it.id, {
                  durationSec: clampNumericInput(
                    e.target.value,
                    MAX_DURATION_SEC,
                  ),
                })
              }
            />
          </div>
          {cardioMetrics && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-bg px-3 py-2 text-center">
                <div className="text-style-caption font-semibold text-subtle">
                  Темп
                </div>
                <div className="text-style-label text-text tabular-nums">
                  {cardioMetrics.pace}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-bg px-3 py-2 text-center">
                <div className="text-style-caption font-semibold text-subtle">
                  Швидкість
                </div>
                <div className="text-style-label text-text tabular-nums">
                  {cardioMetrics.speed}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
