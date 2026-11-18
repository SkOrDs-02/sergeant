/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useState } from "react";
import type { InjurySiteId } from "@sergeant/fizruk-domain/data";
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
import { startRestTimerState } from "../../lib/restTimer";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseWorkoutSetSpeech } from "@sergeant/shared";
import {
  itemMeasure,
  itemUsesSetRows,
  measureCountsBy,
  programPlanForWorkoutItem,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";
import { findExerciseById } from "@sergeant/fizruk-domain/data";
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
import { MeasureChoice } from "./WorkoutItemTypeSwitcher";
import { messages } from "@shared/i18n/uk";

export type WorkoutItemCardProps = {
  it: WorkoutItem;
  activeWorkout: Workout;
  group: WorkoutGroup | null | undefined;
  isReadOnly: boolean;
  lastByExerciseId: Record<string, unknown>;
  recBy: Record<string, unknown>;
  /** Активні позначки травми (ADR-0083) для чипа відновлення. */
  injurySites: ReadonlySet<InjurySiteId>;
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
  /**
   * Людина обрала тип вправи в перемикачі (зріз 5 спеки типу виміру):
   * памʼять типу, що їде між пристроями. Без пропа — лише це тренування.
   */
  onMeasureChosen?:
    ((exerciseId: string, measure: ExerciseMeasure) => void) | undefined;
};

/** Найближчий ВИКОНАНИЙ підхід над рядком `idx`, або `null`. */
function findDoneSetBefore(
  sets: WorkoutSet[],
  idx: number,
  item?: WorkoutItem,
): WorkoutSet | null {
  for (let i = Math.min(idx, sets.length) - 1; i >= 0; i -= 1) {
    const s = sets[i];
    if (s && isSetDone(s, item)) return s;
  }
  return null;
}

/**
 * Плейсхолдер порожнього рядка `idx`: «було» з тієї ж позиції минулої сесії,
 * а коли його немає, найближчий виконаний підхід вище в цій сесії. ✓ на
 * порожньому рядку приймає саме ці значення, тож «те саме, що минулий»
 * лишається одним тапом.
 *
 * AI-CONTEXT: logic-18 (OD-28, Фз-3). «+ Підхід» колись копіював значення в
 * сам рядок, а виконаність похідна (`isSetDone` = reps > 0), тож незроблений
 * підхід одразу йшов у лічильник, обʼєм, рекорди й відновлення. Тепер рядок
 * народжується `{0, 0}` і стає виконаним лише після ✓ (або власного вводу
 * повторень). Не повертай копію значень у сам підхід.
 */
export function placeholderSetFor(
  sets: WorkoutSet[],
  idx: number,
  lastSessionSets: WorkoutSet[],
  item?: WorkoutItem,
): WorkoutSet | null {
  const ghost = lastSessionSets[idx] ?? findDoneSetBefore(sets, idx, item);
  if (!ghost) return null;
  // Вага, що вже стоїть у рядку (план програми або власний ввід), лишається:
  // ✓ бере з «було» лише те, чого рядку бракує. Інакше старт програми сіяв
  // рядок із вагою плану (+крок прогресії), а ✓ повертав минулу вагу
  // (OD-28 Фз-4, П-9).
  const ownWeight = Number(sets[idx]?.weightKg);
  return Number.isFinite(ownWeight) && ownWeight > 0
    ? { ...ghost, weightKg: ownWeight }
    : ghost;
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
  injurySites,
  updateItem,
  setRestTimer,
  getDefaultForGroup,
  getDefaultForExercise,
  setDefaultForExercise,
  onDeleteSet,
  onMeasureChosen,
}: WorkoutItemCardProps) {
  // Помилка голосу — ЛОКАЛЬНИЙ стан, свідомо не `useToast`. Той хук
  // кидає поза `ToastProvider`, а картка рендериться і в деревах без
  // нього (саме на цьому падали наявні тести) — тобто замість
  // повідомлення людина отримала б білий екран. Той самий висновок уже
  // записаний у `SilpoReceiptSection.tsx`.
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const last = it.exerciseId
    ? (lastByExerciseId[it.exerciseId] as LastByExerciseEntry | undefined)
    : undefined;
  const usesRows = itemUsesSetRows(it);
  const measure = itemMeasure(it);
  const countsBy = measureCountsBy(measure);
  // Per-row "було" ghosts: same-position sets from the last session of the
  // SAME measure, filtered with the domain's completion rule. Index N of
  // this array suggests values for row N of the current sets list.
  const lastFilteredSets =
    last && itemUsesSetRows(last) && itemMeasure(last) === measure
      ? filterNonEmptyStrengthSets(last.sets, last)
      : [];
  // Без «було» поле секунд показує діапазон плану програми (спека типу
  // виміру): лише підказка, ✓ її не підставляє.
  const plan =
    countsBy === "time"
      ? programPlanForWorkoutItem(
          activeWorkout.programRef,
          it.exerciseId ? findExerciseById(it.exerciseId) : null,
          measure,
        )
      : null;
  const timePlaceholder =
    plan?.kind === "time"
      ? plan.secMin === plan.secMax
        ? String(plan.secMin)
        : `${plan.secMin}–${plan.secMax}`
      : undefined;

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
  const currentIdx = sets.findIndex((s) => !isSetDone(s, it));
  const anyDone = sets.some((s) => isSetDone(s, it));
  const restSec = restSecAfterCheck(it, group, defSec);

  const startRest = () => {
    if (activeWorkout.endedAt || restSec == null) return;
    setRestTimer(startRestTimerState(restSec));
  };

  // Тип вирішується до першого підходу: після зарахованого перемикач
  // зникає (журнал канону 2026-09-11, спека типу виміру).
  const showTypeSwitcher = !isReadOnly && !(usesRows && anyDone);

  const updateSet = (idx: number, patch: Partial<WorkoutSet>) => {
    const next = [...(it.sets || [])];
    const current = next[idx];
    if (!current) return;
    next[idx] = { ...current, ...patch };
    updateItem(activeWorkout.id, it.id, { sets: next });
  };

  return (
    <div>
      <WorkoutItemRecoveryChip
        it={it}
        recBy={recBy}
        injurySites={injurySites}
      />
      {!usesRows && <WorkoutItemLastTimeHint last={last} />}

      {showTypeSwitcher && (
        <div className="mt-2">
          <MeasureChoice
            ariaLabel={`${messages.fizruk.typeSwitcher.ariaLabel}: ${it.nameUk}`}
            item={it}
            onChange={(patch, m) => {
              // Тримаємо stable-key bookkeeping у локстепі з рядками патча.
              setSetIds((patch.sets || []).map(() => crypto.randomUUID()));
              updateItem(activeWorkout.id, it.id, patch);
              if (it.exerciseId) onMeasureChosen?.(it.exerciseId, m);
            }}
          />
        </div>
      )}

      {usesRows && countsBy === "reps" && (
        <WorkoutItemNextSetHint
          last={last}
          exerciseId={it.exerciseId}
          isReadOnly={isReadOnly}
          readiness={activeWorkout.wellbeing ?? null}
          programRef={activeWorkout.programRef ?? null}
          onApply={(weightKg, reps, variant) => {
            // Вибір записуємо ЗАВЖДИ, навіть коли він плановий: інакше
            // історія не відрізнить «взяв за планом» від «нічого не обирав».
            // Йде одним `updateItem` разом із підходами — два виклики поспіль
            // на той самий item дали б зайвий запис у дуал-райт. Підказка
            // заповнює перший порожній рядок, а якщо всі вже заповнені —
            // додає новий підхід. Наявні значення не чіпаємо.
            const currentSets = it.sets || [];
            const emptyIdx = currentSets.findIndex((s) => !isSetDone(s, it));
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

      {usesRows && (
        <div className="mt-2 space-y-1">
          {sets.length > 0 && <WorkoutSetColumnHeader measure={measure} />}
          {sets.map((s, idx) => (
            <WorkoutSetRow
              key={setKeys[idx]}
              index={idx}
              set={s}
              ghost={placeholderSetFor(sets, idx, lastFilteredSets, it)}
              measure={measure}
              item={it}
              timePlaceholder={timePlaceholder}
              isReadOnly={isReadOnly}
              isCurrent={idx === currentIdx}
              isLast={idx === sets.length - 1}
              onChangeWeight={(weightKg) => updateSet(idx, { weightKg })}
              onChangeReps={(reps) => updateSet(idx, { reps })}
              onChangeDuration={(durationSec) =>
                updateSet(idx, { durationSec })
              }
              onChangeDistance={(distanceM) => updateSet(idx, { distanceM })}
              rpe={typeof s["rpe"] === "number" ? (s["rpe"] as number) : null}
              onChangeRpe={(rpe) => updateSet(idx, { rpe })}
              onApplyGhost={() => {
                const ghost = placeholderSetFor(
                  it.sets || [],
                  idx,
                  lastFilteredSets,
                  it,
                );
                if (!ghost) return;
                updateSet(idx, {
                  weightKg: ghost.weightKg ?? 0,
                  reps: ghost.reps ?? 0,
                  ...(ghost.durationSec != null
                    ? { durationSec: ghost.durationSec }
                    : {}),
                  ...(ghost.distanceM != null
                    ? { distanceM: ghost.distanceM }
                    : {}),
                });
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
                variant="outline"
                className="flex-1 h-11 min-h-[44px]"
                type="button"
                onClick={() => {
                  const currentSets = it.sets || [];
                  // Порожній рядок: минулі значення лише плейсхолдерами
                  // (`placeholderSetFor`), виконаним він стає після ✓.
                  // Див. AI-CONTEXT біля `placeholderSetFor` (logic-18).
                  setSetIds((prev) => [...prev, crypto.randomUUID()]);
                  updateItem(activeWorkout.id, it.id, {
                    sets: [...currentSets, { weightKg: 0, reps: 0 }],
                  });
                }}
              >
                + Підхід
              </Button>
              {countsBy === "reps" && (
                <VoiceMicButton
                  module="fizruk"
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
                  onError={setVoiceErr}
                  onResult={(transcript) => {
                    const parsed = parseWorkoutSetSpeech(transcript);
                    if (
                      !parsed ||
                      (parsed.weight == null &&
                        parsed.reps == null &&
                        parsed.sets == null)
                    ) {
                      // Мовчазний `return` тут коштував дорожче, ніж
                      // виглядав: людина говорила, бачила чип із
                      // розпізнаним текстом — і далі не з'являлось ні
                      // сету, ні помилки. Збій був невидимий, тому й
                      // польових скарг на голос не було.
                      setVoiceErr(messages.fizruk.voiceSet.notParsed);
                      return;
                    }
                    const newSet = {
                      weightKg: parsed.weight ?? 0,
                      reps: parsed.reps ?? 0,
                    };
                    setVoiceErr(null);
                    setSetIds((prev) => [...prev, crypto.randomUUID()]);
                    updateItem(activeWorkout.id, it.id, {
                      sets: [...(it.sets || []), newSet],
                    });
                    startRest();
                  }}
                />
              )}
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
          {voiceErr && (
            // `role="alert"` — повідомлення зʼявляється у відповідь на дію
            // людини, і без ролі скрінрідер про нього не дізнається.
            <p role="alert" className="pt-1 text-style-caption text-danger">
              {voiceErr}
            </p>
          )}
        </div>
      )}

      {!usesRows && (
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
