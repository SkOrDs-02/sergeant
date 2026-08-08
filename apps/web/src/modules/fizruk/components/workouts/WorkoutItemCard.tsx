/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Segmented } from "@shared/components/ui/Segmented";
import { Icon } from "@shared/components/ui/Icon";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import {
  MAX_DISTANCE_M,
  MAX_DURATION_SEC,
  MAX_REPS,
  MAX_WEIGHT_KG,
} from "../../lib/numericBounds";
import {
  recoveryConflictsForWorkoutItem,
  type Workout,
  type WorkoutGroup,
  type WorkoutItem,
  type WorkoutSet,
} from "@sergeant/fizruk-domain";
import {
  getRestCategory,
  REST_CATEGORY_LABELS,
} from "../../hooks/useRestSettings";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseWorkoutSetSpeech } from "@sergeant/shared";
import { calcCardioMetrics } from "./activeWorkoutLib";
import { SupersetBadge } from "./SupersetBadge";
import {
  WorkoutItemLastTimeHint,
  type LastByExerciseEntry,
} from "./WorkoutItemLastTimeHint";
import { WorkoutItemRestPresets } from "./WorkoutItemRestPresets";

import { useFizrukRoute } from "../../hooks/useFizrukRoute";

export type WorkoutItemCardProps = {
  it: WorkoutItem;
  activeWorkout: Workout;
  group: WorkoutGroup | null | undefined;
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

/**
 * Single editable workout-item tile rendered inside `ActiveWorkoutPanel`.
 *
 * Hosts type-specific inputs (strength sets / time / distance), the
 * "previous time" hint, recovery-conflict warnings, the per-item rest
 * timer with quick presets, and the multi-select checkbox used when the
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
  // "Видалити" handler removes. Every `sets`-length mutation site below
  // (delete, "+ Підхід", voice add, switching type to "strength" from
  // empty) updates this array in lockstep, so the id↔set mapping can't
  // drift as long as they stay in sync. `setKeys[idx]` falls back to a
  // positional key if it ever does (e.g. an external non-add/delete
  // mutation of `sets`) — no worse than the original `key={idx}`.
  const [setIds, setSetIds] = useState<string[]>(() =>
    (it.sets || []).map(() => crypto.randomUUID()),
  );
  const sets = it.sets || [];
  const setKeys = sets.map((_s, idx) => setIds[idx] ?? `set-fallback-${idx}`);

  // `Segmented` has no `disabled` prop (see its API in
  // `@shared/components/ui/Segmented`) and that shared component is out
  // of scope for this fix. `opacity-50 pointer-events-none` on its own
  // only blocks the mouse: Tab still lands on the active tab (roving
  // `tabIndex=0`) and Arrow keys still fire `onChange`, letting the
  // keyboard mutate the "Тип" of an already-completed workout item. The
  // `onChange` guard below refuses the mutation outright; this effect
  // force-removes every rendered tab from the Tab order after each
  // commit so keyboard users can't even reach the control once
  // read-only.
  const segmentedTypeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isReadOnly) return;
    const tabs =
      segmentedTypeRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabs?.forEach((tab) => {
      tab.tabIndex = -1;
    });
  });

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
                aria-label={`${it.nameUk} — вибрати для об'єднання в суперсет`}
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
            {group && !groupSelectMode && (
              <SupersetBadge type={group.type ?? "superset"} />
            )}
          </div>
          <div className="text-style-caption text-subtle mt-0.5">
            М{"'"}язи:{" "}
            {/* Типографіка тексту, правило 3: ієрархію несе ВАГА, не третій
                відтінок. Тут стояв `text-muted` поверх батьківського
                `text-subtle` — і тони суперечили вазі: `muted #8a968e`
                СВІТЛІШИЙ за `subtle #5f6b64`, тобто напівжирне «важливіше»
                фарбувалось у «менш важливе». Тон успадковується, виділяє
                лише вага. */}
            <span className="font-semibold">
              {(it.musclesPrimary || [])
                .map((id) => musclesUk?.[id] || id)
                .join(", ") || "—"}
            </span>
          </div>
          {(() => {
            const cf = recoveryConflictsForWorkoutItem(
              it,
              recBy as Parameters<typeof recoveryConflictsForWorkoutItem>[1],
            );
            if (!cf.hasWarning) return null;
            const redL = cf.red.map((x) => x.label).join(", ");
            const yelL = cf.yellow.map((x) => x.label).join(", ");
            return (
              <div className="text-style-caption mt-1.5 rounded-xl border border-warning/40 bg-warning/10 px-2 py-1.5 text-warning-strong dark:text-warning leading-snug">
                {cf.red.length ? (
                  <>
                    Ще не відновились:{" "}
                    <span className="font-semibold">{redL}</span>.{" "}
                  </>
                ) : null}
                {cf.yellow.length ? (
                  <>
                    Краще почекати:{" "}
                    <span className="font-semibold">{yelL}</span>.
                  </>
                ) : null}
              </div>
            );
          })()}
        </div>
        {!isReadOnly && (
          <button
            type="button"
            className="flex items-center justify-center shrink-0 rounded-xl pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] text-style-caption text-danger/80 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={() => removeItem(activeWorkout.id, it.id)}
            aria-label="Видалити вправу з тренування"
          >
            <Icon name="trash" size={15} aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-2">
        <div
          ref={segmentedTypeRef}
          aria-disabled={isReadOnly || undefined}
          className="rounded-2xl border border-line bg-panelHi px-3"
        >
          <SectionHeading as="div" size="xs" variant="fizruk" className="pt-2">
            Тип
          </SectionHeading>
          <Segmented
            variant="fizruk"
            style="solid"
            size="md"
            ariaLabel="Тип вправи"
            className={isReadOnly ? "opacity-50 pointer-events-none" : ""}
            value={it.type || "strength"}
            items={[
              {
                value: "strength",
                label: "Силова",
                title: "Силова (кг × повтори × підходи)",
                ariaLabel: "Силова — кг × повтори × підходи",
              },
              {
                value: "time",
                label: "Час",
                title: "Час (секунди)",
                ariaLabel: "Час — секунди",
              },
              {
                value: "distance",
                label: "Дист",
                title: "Дистанція (метри) + час",
                ariaLabel: "Дистанція — метри та час",
              },
            ]}
            onChange={(t) => {
              // Real block, not just visual — see the effect above this
              // component's `return` for why (Segmented has no `disabled`
              // prop, and both mouse AND keyboard paths land here).
              if (isReadOnly) return;
              if (t === "strength") {
                if (!it.sets?.length) setSetIds([crypto.randomUUID()]);
                updateItem(activeWorkout.id, it.id, {
                  type: t,
                  sets: it.sets?.length ? it.sets : [{ weightKg: 0, reps: 0 }],
                });
              }
              if (t === "time")
                updateItem(activeWorkout.id, it.id, {
                  type: t,
                  durationSec: it.durationSec ?? 0,
                });
              if (t === "distance")
                updateItem(activeWorkout.id, it.id, {
                  type: t,
                  distanceM: it.distanceM ?? 0,
                  durationSec: it.durationSec ?? 0,
                });
            }}
          />
        </div>
      </div>

      {it.type === "strength" && (
        <div className="mt-2 space-y-2">
          {sets.map((s, idx) => (
            <div key={setKeys[idx]} className="grid grid-cols-3 gap-2">
              <input
                className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
                type="number"
                inputMode="decimal"
                placeholder="кг"
                min={0}
                max={MAX_WEIGHT_KG}
                aria-label="Вага в кілограмах"
                value={s.weightKg || ""}
                readOnly={isReadOnly}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const next = [...(it.sets || [])];
                  const current = next[idx];
                  if (!current) return;
                  next[idx] = {
                    ...current,
                    weightKg: clampNumericInput(e.target.value, MAX_WEIGHT_KG),
                  };
                  updateItem(activeWorkout.id, it.id, { sets: next });
                }}
              />
              <input
                className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
                type="number"
                inputMode="numeric"
                placeholder="повт."
                min={0}
                max={MAX_REPS}
                aria-label="Кількість повторень"
                value={s.reps || ""}
                readOnly={isReadOnly}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const next = [...(it.sets || [])];
                  const current = next[idx];
                  if (!current) return;
                  const reps = clampNumericInput(e.target.value, MAX_REPS);
                  next[idx] = {
                    ...current,
                    reps,
                  };
                  updateItem(activeWorkout.id, it.id, { sets: next });
                  if (
                    !activeWorkout.endedAt &&
                    !group &&
                    (Number(current.reps) || 0) <= 0 &&
                    reps > 0
                  ) {
                    setRestTimer({ remaining: defSec, total: defSec });
                  }
                }}
              />
              <button
                type="button"
                // AI-DANGER: `text-xs` тут — розмір КОНТРОЛА, а не роль
                // тексту. Кнопка стоїть у ряд із полями вводу тієї самої
                // висоти (`h-10`), тож її розмір належить формі керування,
                // і роль `text-style-caption` (12px/400) описувала б не те.
                // Не міняти на роль механічно — спершу перевір ряд.
                // Touch floor gated to `pointer-coarse:` (not
                // unconditional `min-h-[44px]`): this button sits in a
                // row with the two `h-10` inputs above, and an
                // always-on 44px floor broke that 4px alignment on
                // mouse/desktop. Coarse pointers still get the full
                // ≥44px target (Button.tsx uses the same gate for its
                // xs/sm/iconOnly sizes).
                className="h-10 pointer-coarse:min-h-[44px] rounded-xl border border-line text-xs text-subtle hover:text-danger hover:border-danger/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-subtle disabled:hover:border-line"
                disabled={isReadOnly}
                onClick={() => {
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
              >
                Видалити
              </button>
            </div>
          ))}
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 h-10 min-h-[44px]"
                type="button"
                onClick={() => {
                  setSetIds((prev) => [...prev, crypto.randomUUID()]);
                  updateItem(activeWorkout.id, it.id, {
                    sets: [...(it.sets || []), { weightKg: 0, reps: 0 }],
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
                // speechParsers.ts before touching any of these.
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
