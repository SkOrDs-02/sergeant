import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
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

type LastByExerciseEntry = WorkoutItem & { _startedAt?: string };

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
}: WorkoutItemCardProps) {
  const last = it.exerciseId
    ? (lastByExerciseId[it.exerciseId] as LastByExerciseEntry | undefined)
    : undefined;
  const cardioMetrics =
    it.type === "distance"
      ? calcCardioMetrics(it.distanceM, it.durationSec)
      : null;

  const defSec = getDefaultForGroup(it.primaryGroup);
  const cat = getRestCategory(it.primaryGroup);
  const catLabel = REST_CATEGORY_LABELS[cat] || "";
  const quickOptions = [60, 90, 120, 180].filter((s) => s !== defSec);

  return (
    <div
      className={`border rounded-2xl p-3 bg-bg transition-colors ${groupSelectMode && isSelected ? "border-success bg-success/5" : "border-line"}`}
    >
      {last && (
        <div className="text-xs text-subtle/70 mb-1">
          Минулого разу{" "}
          {last._startedAt
            ? `(${new Date(last._startedAt).toLocaleDateString("uk-UA", { month: "short", day: "numeric" })})`
            : ""}
          :{" "}
          {last.type === "strength"
            ? (last.sets || [])
                .map((s: WorkoutSet) => `${s.weightKg ?? 0}×${s.reps ?? 0}`)
                .slice(0, 3)
                .join(", ")
            : last.type === "distance"
              ? (() => {
                  const m = calcCardioMetrics(last.distanceM, last.durationSec);
                  return m
                    ? `${last.distanceM ?? 0}м · ${m.pace}`
                    : `${last.distanceM ?? 0}м за ${last.durationSec ?? 0}с`;
                })()
              : `${last.durationSec ?? 0}с`}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {groupSelectMode && (
              <button
                type="button"
                className={`w-5 h-5 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-success-strong border-success-strong text-white" : "border-line bg-bg"}`}
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
              className="text-style-label text-text truncate text-left hover:underline"
              onClick={() => {
                if (it.exerciseId)
                  window.location.hash = `#exercise/${it.exerciseId}`;
              }}
            >
              {it.nameUk}
            </button>
            {group && !groupSelectMode && (
              <SupersetBadge type={group.type ?? "superset"} />
            )}
          </div>
          <div className="text-xs text-subtle mt-0.5">
            М{"'"}язи:{" "}
            <span className="font-semibold text-muted">
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
              <div className="text-xs mt-1.5 rounded-xl border border-warning/40 bg-warning/10 px-2 py-1.5 text-warning leading-snug">
                {cf.red.length ? (
                  <>
                    Рано навантажувати:{" "}
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
            className="text-xs text-danger/80 hover:text-danger"
            onClick={() => removeItem(activeWorkout.id, it.id)}
            aria-label="Видалити вправу з тренування"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-2">
        <div className="rounded-2xl border border-line bg-panelHi px-3">
          <SectionHeading as="div" size="xs" className="pt-2">
            Тип
          </SectionHeading>
          <select
            className="input-focus-fizruk w-full h-10 bg-transparent text-sm text-text disabled:opacity-70 rounded-xl"
            value={it.type || "strength"}
            disabled={isReadOnly}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "strength")
                updateItem(activeWorkout.id, it.id, {
                  type: t,
                  sets: it.sets?.length ? it.sets : [{ weightKg: 0, reps: 0 }],
                  durationSec: undefined,
                  distanceM: undefined,
                });
              if (t === "time")
                updateItem(activeWorkout.id, it.id, {
                  type: t,
                  durationSec: it.durationSec ?? 0,
                  sets: undefined,
                  distanceM: undefined,
                });
              if (t === "distance")
                updateItem(activeWorkout.id, it.id, {
                  type: t,
                  distanceM: it.distanceM ?? 0,
                  durationSec: it.durationSec ?? 0,
                  sets: undefined,
                });
            }}
          >
            <option value="strength">Силова (кг × повтори × підходи)</option>
            <option value="time">Час (секунди)</option>
            <option value="distance">Дистанція (метри) + час</option>
          </select>
        </div>
      </div>

      {it.type === "strength" && (
        <div className="mt-2 space-y-2">
          {(it.sets || []).map((s, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-2">
              <input
                className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
                type="number"
                inputMode="decimal"
                placeholder="кг"
                aria-label="Вага в кілограмах"
                value={s.weightKg || ""}
                readOnly={isReadOnly}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const next = [...(it.sets || [])];
                  next[idx] = {
                    ...next[idx],
                    weightKg:
                      e.target.value === "" ? 0 : Number(e.target.value),
                  };
                  updateItem(activeWorkout.id, it.id, { sets: next });
                }}
              />
              <input
                className="input-focus-fizruk h-10 rounded-xl border border-line bg-panelHi px-3 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
                type="number"
                inputMode="numeric"
                placeholder="повт."
                aria-label="Кількість повторень"
                value={s.reps || ""}
                readOnly={isReadOnly}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  // UX: як у більшості трекерів — Enter на повторах = "залоговано" → запускаємо таймер
                  if (activeWorkout.endedAt) return;
                  if (group) return;
                  const reps = Number(s.reps) || 0;
                  const w = Number(s.weightKg) || 0;
                  if (reps <= 0 && w <= 0) return;
                  setRestTimer({ remaining: defSec, total: defSec });
                }}
                onChange={(e) => {
                  const next = [...(it.sets || [])];
                  next[idx] = {
                    ...next[idx],
                    reps: e.target.value === "" ? 0 : Number(e.target.value),
                  };
                  updateItem(activeWorkout.id, it.id, { sets: next });
                }}
              />
              <button
                type="button"
                className="h-10 rounded-xl border border-line text-xs text-subtle hover:text-danger hover:border-danger/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-subtle disabled:hover:border-line"
                disabled={isReadOnly}
                onClick={() => {
                  const next = (it.sets || []).filter((_, i) => i !== idx);
                  updateItem(activeWorkout.id, it.id, { sets: next });
                }}
              >
                Видалити
              </button>
            </div>
          ))}
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 h-10 min-h-[44px]"
                type="button"
                onClick={() =>
                  updateItem(activeWorkout.id, it.id, {
                    sets: [...(it.sets || []), { weightKg: 0, reps: 0 }],
                  })
                }
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
            <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-line">
              <div className="flex items-center justify-between w-full gap-1">
                <SectionHeading as="span" size="xs">
                  Таймер відпочинку
                </SectionHeading>
                <span className="text-2xs text-muted">
                  {catLabel} · реком. {defSec}с
                </span>
              </div>
              <button
                type="button"
                className="min-h-[44px] px-4 rounded-xl border-2 border-success bg-success/10 text-style-label text-success hover:bg-success/20 transition-colors"
                onClick={() =>
                  setRestTimer({ remaining: defSec, total: defSec })
                }
                title={`Рекомендований час для ${catLabel.toLowerCase()}`}
              >
                {defSec} с ★
              </button>
              {quickOptions.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className="min-h-[44px] px-4 rounded-xl border border-line bg-panelHi text-sm text-text hover:bg-panel transition-colors"
                  onClick={() => setRestTimer({ remaining: sec, total: sec })}
                >
                  {sec} с
                </button>
              ))}
            </div>
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
                durationSec: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
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
              aria-label="Дистанція в метрах"
              value={it.distanceM || ""}
              readOnly={isReadOnly}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                updateItem(activeWorkout.id, it.id, {
                  distanceM: e.target.value === "" ? 0 : Number(e.target.value),
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
                  durationSec:
                    e.target.value === "" ? 0 : Number(e.target.value),
                })
              }
            />
          </div>
          {cardioMetrics && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-line bg-bg px-3 py-2 text-center">
                {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
                    Cardio metric caption at text-2xs (smaller than
                    SectionHeading xs's text-2xs) inside a compact stat
                    tile; intentional microtype. */}
                <div className="text-2xs font-bold text-subtle uppercase tracking-widest">
                  Темп
                </div>
                <div className="text-sm font-bold text-text tabular-nums">
                  {cardioMetrics.pace}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-bg px-3 py-2 text-center">
                {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
                    Matching caption on the speed tile; see sibling above. */}
                <div className="text-2xs font-bold text-subtle uppercase tracking-widest">
                  Швидкість
                </div>
                <div className="text-sm font-bold text-text tabular-nums">
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
