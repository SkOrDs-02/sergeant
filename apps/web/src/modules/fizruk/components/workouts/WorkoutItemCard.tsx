/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
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
import {
  filterNonEmptyStrengthSets,
  WorkoutItemLastTimeHint,
  type LastByExerciseEntry,
} from "./WorkoutItemLastTimeHint";
import { WorkoutItemNextSetHint } from "./WorkoutItemNextSetHint";
import { WorkoutItemRecoveryChip } from "./WorkoutItemRecoveryChip";
import { WorkoutItemRestPresets } from "./WorkoutItemRestPresets";
import { WorkoutItemCardioFields } from "./WorkoutItemCardioFields";
import {
  isSetDone,
  WorkoutSetColumnHeader,
  WorkoutSetRow,
} from "./WorkoutSetRow";
import { buildTypeSwitchPatch } from "./WorkoutItemTypeSwitcher";
import { Segmented } from "@shared/components/ui/Segmented";
import { messages } from "@shared/i18n/uk";

export type WorkoutItemCardProps = {
  it: WorkoutItem;
  activeWorkout: Workout;
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
 * Скільки секунд відпочивати після ✓ на цьому item-і. Поза групою — дефолт
 * вправи/групи мʼязів. У суперсеті/колі відпочинок іде ПІСЛЯ останньої
 * вправи кола (між колами), тож таймер стартує лише з останнього member-а;
 * решта учасників без відпочинку ведуть до наступної вправи. Раніше для
 * груп таймер не стартував узагалі, а спільна кнопка жила в контейнері
 * групи, якого в сесійному режимі немає.
 */
export function restSecAfterCheck(
  it: WorkoutItem,
  group: WorkoutGroup | null | undefined,
  defSec: number,
): number | null {
  if (!group) return defSec;
  const ids = group.itemIds || [];
  const last = ids[ids.length - 1];
  return last === it.id ? group.restSec || 60 : null;
}

/**
 * Editable body of one exercise inside the session exercise screen
 * (`SessionExerciseFocus` owns the header: photo, name, progress, ⋯).
 *
 * Hosts the labeled recovery chip, the compact type switcher (only while
 * no set is logged yet — the type is decided before the first set, not
 * after), the "next set" hint, the 4-column set rows, "+ Підхід", voice
 * entry and the rest-timer preset. Pure presentational: every mutation
 * flows through a prop.
 */
export function WorkoutItemCard({
  it,
  activeWorkout,
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
}: WorkoutItemCardProps) {
  const last = it.exerciseId
    ? (lastByExerciseId[it.exerciseId] as LastByExerciseEntry | undefined)
    : undefined;
  // Per-row "було" ghosts: same-position sets from the last session,
  // filtered with the domain's non-empty criterion. Index N of this array
  // suggests values for row N of the current sets list.
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
  // below updates this array in lockstep. `setKeys[idx]` falls back to a
  // positional key if it ever drifts (e.g. a type-switch from
  // `ExerciseDetailSheet`, which can't reach `setSetIds`).
  const [setIds, setSetIds] = useState<string[]>(() =>
    (it.sets || []).map(() => crypto.randomUUID()),
  );
  const sets = it.sets || [];
  const setKeys = sets.map((_s, idx) => setIds[idx] ?? `set-fallback-${idx}`);
  const currentIdx = sets.findIndex((s) => !isSetDone(s));
  const anyDone = sets.some(isSetDone);
  const restSec = restSecAfterCheck(it, group, defSec);

  const startRest = () => {
    if (activeWorkout.endedAt || restSec == null) return;
    setRestTimer({ remaining: restSec, total: restSec });
  };

  const showTypeSwitcher = !isReadOnly && !(it.type === "strength" && anyDone);

  return (
    <div>
      <WorkoutItemRecoveryChip it={it} recBy={recBy} />
      <WorkoutItemLastTimeHint last={last} />

      {showTypeSwitcher && (
        <div className="mt-2">
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
              // Тримаємо stable-key bookkeeping у локстепі з посівом сетів
              // при перемиканні на силову.
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
          readiness={activeWorkout.wellbeing ?? null}
          onApply={(weightKg, reps, variant) => {
            // Вибір записуємо ЗАВЖДИ, навіть коли він плановий: інакше
            // історія не відрізнить «взяв за планом» від «нічого не обирав».
            // Йде одним `updateItem` разом із підходами — два виклики поспіль
            // на той самий item дали б зайвий запис у дуал-райт. Підказка
            // заповнює перший порожній рядок, а якщо всі вже заповнені —
            // додає новий підхід. Наявні значення не чіпаємо.
            const currentSets = it.sets || [];
            const emptyIdx = currentSets.findIndex((s) => !isSetDone(s));
            if (emptyIdx === -1) {
              setSetIds((prev) => [...prev, crypto.randomUUID()]);
              updateItem(activeWorkout.id, it.id, {
                chosenVariant: variant,
                sets: [...currentSets, { weightKg, reps }],
              });
              return;
            }
            const next = [...currentSets];
            next[emptyIdx] = { ...next[emptyIdx], weightKg, reps };
            updateItem(activeWorkout.id, it.id, {
              chosenVariant: variant,
              sets: next,
            });
          }}
        />
      )}

      {it.type === "strength" && (
        <div className="mt-2 space-y-1">
          {sets.length > 0 && <WorkoutSetColumnHeader />}
          {sets.map((s, idx) => (
            <WorkoutSetRow
              key={setKeys[idx]}
              index={idx}
              set={s}
              ghost={lastFilteredSets[idx] ?? null}
              isReadOnly={isReadOnly}
              isCurrent={idx === currentIdx}
              isLast={idx === sets.length - 1}
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
              // Explicit start: the rest timer fires from the ✓ tap, never
              // from the reps `onChange` transition — that heuristic is what
              // produced stray 0×0 sets (redesign 2026-08, item 2).
              onCheckTap={startRest}
              onDelete={() => {
                const currentSets = it.sets || [];
                const snapshot = [...currentSets];
                const next = currentSets.filter((_, i) => i !== idx);
                setSetIds((prev) => prev.filter((_id, i) => i !== idx));
                updateItem(activeWorkout.id, it.id, { sets: next });
                onDeleteSet(activeWorkout.id, it.id, snapshot);
              }}
            />
          ))}
          {!isReadOnly && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                className="flex-1 h-11 min-h-[44px]"
                type="button"
                onClick={() => {
                  const currentSets = it.sets || [];
                  // Copy the last COMPLETED set forward instead of appending
                  // a blank `{0,0}` row — a fresh set almost always repeats
                  // the previous weight/reps. Falls back to the same-position
                  // "було" ghost when nothing is done yet, and to an empty
                  // row only when neither exists.
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
                // weight/reps shape ("80 кг 8 разів").
                promptHint="Вправа з вагою та повтореннями: жим штанги 80 кг 8 разів, присідання 100 кг 5 повторень."
                // AI-DANGER: voice (Whisper) set-commit path. The all-null
                // guard, the optimistic `updateItem` append, and the auto
                // rest-timer start are tightly coupled. Removing the guard
                // injects 0×0 sets that the cloud-sync queue silently
                // persists. Voice entry keeps its auto-start on purpose —
                // the spoken set is already a complete, explicit action.
                onResult={(transcript) => {
                  const parsed = parseWorkoutSetSpeech(transcript);
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
                  startRest();
                }}
              />
              {!activeWorkout.endedAt && (
                // У групі кнопка несе СПІЛЬНИЙ час кола і без меню
                // пресетів: там пресет міняв би типовий час однієї
                // вправи, а відпочинок належить групі. Раніше для
                // згрупованих вправ кнопки не було взагалі — спільна
                // жила в контейнері групи, якого в сесійному режимі
                // немає (браузерний прохід 2026-09-11).
                <WorkoutItemRestPresets
                  catLabel={catLabel}
                  defSec={group ? group.restSec || 60 : defSec}
                  quickOptions={group ? [] : quickOptions}
                  exerciseId={it.exerciseId}
                  setRestTimer={setRestTimer}
                  {...(group ? {} : { setDefaultForExercise })}
                />
              )}
            </div>
          )}
        </div>
      )}

      {it.type !== "strength" && (
        <WorkoutItemCardioFields
          it={it}
          activeWorkout={activeWorkout}
          isReadOnly={isReadOnly}
          updateItem={updateItem}
        />
      )}
    </div>
  );
}
