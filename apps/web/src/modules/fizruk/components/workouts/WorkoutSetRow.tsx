/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useRef, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import {
  isSetCompleted,
  measureCountsBy,
  measureFields,
  type ExerciseMeasure,
  type SetCompletionItemContext,
} from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";
import {
  MAX_DISTANCE_M,
  MAX_DURATION_SEC,
  MAX_REPS,
  MAX_WEIGHT_KG,
} from "../../lib/numericBounds";
import { fmtLoose } from "../../lib/numberFmt";
import { WorkoutSetRpeMenu } from "./WorkoutSetRpeMenu";

export interface WorkoutSetRowProps {
  /** 0-based position inside `it.sets`. */
  index: number;
  set: WorkoutSet;
  /** Same-position set from the previous session for this exercise
   * (already filtered to non-empty by the caller), or `null` when
   * there is nothing to suggest at this row. */
  ghost: WorkoutSet | null;
  isReadOnly: boolean;
  /**
   * Перший незроблений рядок картки — «поточний підхід». Один похідний
   * прапорець замість нового стану в домені: підсвітка й жирний номер.
   */
  isCurrent: boolean;
  /**
   * Останній рядок картки — єдиний, що несе кошик. Видалення підходу —
   * рідкісна дія, і майже завжди це «зайвий + Підхід» у кінці; кошик у
   * кожному рядку коштував 38 px ширини полів (аудит 09-03, B4).
   */
  isLast: boolean;
  onChangeWeight: (weightKg: number) => void;
  onChangeReps: (reps: number) => void;
  /**
   * Тип виміру вправи (спека `fizruk-exercise-measure-type.md`): які поля
   * має рядок. Без пропа — вага × повтори, як до фічі.
   */
  measure?: ExerciseMeasure | undefined;
  /** Item для правила зарахованості (`isSetCompleted`). */
  item?: SetCompletionItemContext | undefined;
  onChangeDuration?: ((durationSec: number) => void) | undefined;
  onChangeDistance?: ((distanceM: number) => void) | undefined;
  /**
   * Плейсхолдер секунд без «було» — діапазон плану програми («20–40»). Лише
   * підказка: ✓ на такому рядку ставить фокус у поле, а не підставляє число.
   */
  timePlaceholder?: string | undefined;
  /**
   * Borg 1..10 effort rating for this set — `null` means "not filled
   * in" (never `0`, see `WorkoutSetRpeMenu`). Optional prop so callers
   * that don't wire RPE yet (tests, older call-sites) keep compiling.
   */
  rpe?: number | null | undefined;
  onChangeRpe?: ((rpe: number | null) => void) | undefined;
  /** Fill both fields from `ghost` — no-op if `ghost` is null. */
  onApplyGhost: () => void;
  /** Tap on the ✓ control once the row is "done" (see {@link isSetDone});
   * the caller decides whether this also starts the rest timer. */
  onCheckTap: () => void;
  onDelete: () => void;
}

/**
 * A set row is "done" once REPS are logged (>0). Weight may legitimately
 * stay 0: підтягування, віджимання, прес — вправи з власною вагою, і
 * каталог має для них окремий фільтр обладнання «Власна вага». Вимога
 * `weightKg > 0` зробила б ✓ мертвою для цілого класу вправ, тобто
 * зламала б і старт таймера для них.
 *
 * Це похідне читання, а НЕ збережений прапорець — `WorkoutSet`
 * лишається простою доменною формою `{weightKg, reps}`; додавання поля
 * означало б зміну `packages/fizruk-domain` + sqlite-схеми + dual-write
 * заради того, що виводиться з наявних даних.
 */
export function isSetDone(
  s: WorkoutSet | null | undefined,
  item?: SetCompletionItemContext | null,
): boolean {
  // Єдине визначення модуля (`isSetCompleted`, домен): той самий предикат
  // читають `computeWorkoutSetCount`, відновлення і `isFullWorkout`. Без
  // `item` — правило повторень (силова вправа без явного типу).
  return isSetCompleted(s, item);
}

/**
 * Ширина хвостових слотів (кошик і RPE). На coarse-вказівнику страхувальне
 * правило `styles/mobile.css` піднімає кожну `<button>` і `role="button"` до
 * 44 px завширшки, тож кошик `w-9` ставав 44 px, а порожня заглушка в
 * інших рядках лишалась 36 px — поля рядка з кошиком були вужчі й зсунуті
 * (зйомка 2026-11-18). Заглушка й колонки заголовка беруть ту саму
 * coarse-ширину, і сітка не пливе.
 */
const TRAILING_SLOT_W = "w-9 pointer-coarse:w-11";

// `px-2`, не `px-3`: поле секунд чи метрів мусить вміщати плейсхолдер
// діапазону плану («20–40») і чотиризначне число; з `px-3` у двопольному
// рядку на 390 px він різався до «20–4(» (зйомка 2026-11-18).
const INPUT_CLASS =
  "bg-bg px-2 font-semibold tabular-nums placeholder:font-normal read-only:opacity-70 read-only:cursor-not-allowed";

type FieldKey = "weight" | "reps" | "distance" | "time";

/** Поля рядка в порядку колонок: кг, повт, м, с. */
export function rowFields(measure: ExerciseMeasure): FieldKey[] {
  const f = measureFields(measure);
  return (["weight", "reps", "distance", "time"] as const).filter((k) => f[k]);
}

/** Ціле значення поля секунд чи метрів і чи вписане число було понад стелю. */
function parseIntField(
  raw: string,
  max: number,
): { value: number; over: boolean } {
  const parsed = clampNumericInput(raw, Number.MAX_SAFE_INTEGER);
  return {
    value: Math.floor(Math.min(parsed, max)),
    over: parsed > max,
  };
}

function ghostText(ghost: WorkoutSet, fields: FieldKey[]): string {
  return fields
    .map((k) =>
      k === "weight"
        ? fmtLoose(ghost.weightKg ?? 0)
        : k === "reps"
          ? String(ghost.reps ?? 0)
          : k === "time"
            ? String(ghost.durationSec ?? 0)
            : String(ghost.distanceM ?? 0),
    )
    .join("×");
}

/**
 * One editable set row inside the exercise card: `№ · поле · поле · ✓`
 * (+ кошик лише на останньому рядку). Поля — за типом виміру вправи:
 * кг і повт, лише повт, кг і с, с, кг і м, м і с (`rowFields`).
 *
 * Редизайн 2026-09 (спека `fizruk-active-session.md`, рішення 5) — чотири
 * колонки замість шести. «Було» з минулого разу більше не окрема колонка
 * на 48 px, а плейсхолдер у самих полях: сіре «80» у полі ваги і «8» у
 * полі повторень. Тап по ✓ на такому порожньому рядку = «повторив, як
 * минулого разу»: підставляє значення й одразу стартує відпочинок.
 * ✓ ніколи не виглядає вимкненим — до заповнення це контур в акценті
 * модуля, а тап без лічильної величини і без підказки ставить фокус у
 * поле, щоб людина бачила, чого бракує.
 */
export function WorkoutSetRow({
  index,
  set,
  ghost,
  isReadOnly,
  isCurrent,
  isLast,
  onChangeWeight,
  onChangeReps,
  measure = "weight_reps",
  item,
  onChangeDuration,
  onChangeDistance,
  timePlaceholder,
  rpe,
  onChangeRpe,
  onApplyGhost,
  onCheckTap,
  onDelete,
}: WorkoutSetRowProps) {
  const sr = messages.fizruk.setRow;
  const ss = messages.fizruk.session;
  const mr = messages.fizruk.measureRow;
  const done = isSetDone(set, item ?? { measure });
  const setNumber = index + 1;
  const ghostSet = ghost && !done && !isReadOnly ? ghost : null;
  const countRef = useRef<HTMLInputElement>(null);
  const [overflow, setOverflow] = useState<"time" | "distance" | null>(null);
  const fields = rowFields(measure);
  const countBy = measureCountsBy(measure);
  // Вага — єдине десяткове поле рядка (повторення цілі), тож кома потрібна
  // саме тут: «82,5» під `type="number"` доїжджало сюди порожнім рядком і
  // клемп мовчки писав 0. Порожнє поле лишається нулем — 0 кг це валідна
  // вправа з власною вагою, а не «не вказано» (див. `isSetDone`).
  const weightDraft = useDecimalDraft(
    set.weightKg || "",
    MAX_WEIGHT_KG,
    (value) => onChangeWeight(value ?? 0),
  );

  const ghostLabel = ghostSet ? ghostText(ghostSet, fields) : null;
  const fillAria =
    countBy === "time"
      ? mr.fillSecAria
      : countBy === "distance"
        ? mr.fillMetersAria
        : ss.fillRepsAria;
  const checkAria = done
    ? `${sr.numberAriaPrefix} ${setNumber}: ${sr.doneAriaLabel}`
    : ghostLabel
      ? `${sr.numberAriaPrefix} ${setNumber}: ${ss.repeatGhostAria} ${ghostLabel} ${ss.repeatGhostAriaSuffix}`
      : `${sr.numberAriaPrefix} ${setNumber}: ${sr.notDoneAriaLabel}, ${fillAria}`;

  const handleCheck = () => {
    if (isReadOnly) return;
    if (done) {
      onCheckTap();
      return;
    }
    if (ghostSet) {
      onApplyGhost();
      onCheckTap();
      return;
    }
    countRef.current?.focus();
  };

  const intInput = (key: "reps" | "time" | "distance") => {
    const isCount =
      (key === "reps" && countBy === "reps") ||
      (key === "time" && countBy === "time") ||
      (key === "distance" && countBy === "distance");
    const value =
      key === "reps"
        ? set.reps
        : key === "time"
          ? set.durationSec
          : set.distanceM;
    const ghostValue =
      key === "reps"
        ? ghostSet?.reps
        : key === "time"
          ? ghostSet?.durationSec
          : ghostSet?.distanceM;
    const placeholder =
      ghostSet && ghostValue != null
        ? String(ghostValue)
        : key === "time" && timePlaceholder && !isReadOnly
          ? timePlaceholder
          : "";
    const max =
      key === "reps"
        ? MAX_REPS
        : key === "time"
          ? MAX_DURATION_SEC
          : MAX_DISTANCE_M;
    const aria =
      key === "reps"
        ? sr.repsAriaLabel
        : key === "time"
          ? mr.secAriaLabel
          : mr.metersAriaLabel;
    const errorId =
      key !== "reps" && overflow === key
        ? `set-${setNumber}-${key}-error`
        : undefined;
    return (
      <div key={key} className="min-w-0 flex-1">
        <Input
          ref={isCount ? countRef : undefined}
          size="sm"
          className={INPUT_CLASS}
          type="number"
          inputMode="numeric"
          placeholder={placeholder}
          min={0}
          max={max}
          step={1}
          aria-label={aria}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          value={Number(value) || ""}
          readOnly={isReadOnly}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            if (key === "reps") {
              onChangeReps(clampNumericInput(e.target.value, MAX_REPS));
              return;
            }
            const { value: n, over } = parseIntField(e.target.value, max);
            setOverflow(over ? key : null);
            if (key === "time") onChangeDuration?.(n);
            else onChangeDistance?.(n);
          }}
        />
      </div>
    );
  };

  const overflowText =
    overflow === "time"
      ? mr.tooManySec.replace("{max}", String(MAX_DURATION_SEC))
      : overflow === "distance"
        ? mr.tooManyMeters.replace("{max}", String(MAX_DISTANCE_M))
        : null;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-1 py-1 -mx-1 transition-colors",
          isCurrent && !isReadOnly && "bg-panelHi",
        )}
        data-current={isCurrent && !isReadOnly ? "true" : undefined}
        data-set-row
      >
        <span
          className={cn(
            "w-6 shrink-0 text-center text-style-label tabular-nums",
            isCurrent && !isReadOnly ? "font-bold text-text" : "text-subtle",
          )}
          aria-hidden
        >
          {setNumber}
        </span>
        {fields.map((k) =>
          k === "weight" ? (
            <div key={k} className="min-w-0 flex-1">
              <Input
                size="sm"
                className={INPUT_CLASS}
                type="text"
                inputMode="decimal"
                // Плейсхолдер несе ТІЛЬКИ значення з минулого разу. Підпис
                // колонки вже стоїть рядком вище (`WorkoutSetColumnHeader`).
                placeholder={ghostSet ? fmtLoose(ghostSet.weightKg ?? 0) : ""}
                aria-label={sr.weightAriaLabel}
                value={weightDraft.value}
                readOnly={isReadOnly}
                onFocus={(e) => e.target.select()}
                onChange={weightDraft.onChange}
              />
            </div>
          ) : (
            intInput(k)
          ),
        )}
        {onChangeRpe && (
          <WorkoutSetRpeMenu
            setNumber={setNumber}
            value={rpe}
            disabled={isReadOnly}
            onChange={onChangeRpe}
          />
        )}
        <button
          type="button"
          disabled={isReadOnly}
          aria-label={checkAria}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            "disabled:cursor-not-allowed",
            done
              ? "border-line bg-panelHi text-text hover:bg-panelHi"
              : ghostSet
                ? "border-line bg-panel text-text hover:bg-panelHi"
                : "border-line bg-panel text-text opacity-70 hover:opacity-100",
          )}
          onClick={handleCheck}
        >
          <Icon name="check" size={18} aria-hidden />
        </button>
        {isLast && !isReadOnly ? (
          <button
            type="button"
            data-set-slot="trash"
            className={cn(
              "flex h-11 shrink-0 items-center justify-center rounded-lg pointer-coarse:min-h-[44px] text-subtle hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              TRAILING_SLOT_W,
            )}
            onClick={onDelete}
            aria-label={`${sr.deleteAriaPrefix} ${setNumber}`}
          >
            <Icon name="trash" size={15} aria-hidden />
          </button>
        ) : (
          <span
            data-set-slot="trash"
            className={cn("shrink-0", TRAILING_SLOT_W)}
            aria-hidden
          />
        )}
      </div>
      {overflowText && (
        <p
          id={`set-${setNumber}-${overflow}-error`}
          role="alert"
          className="pl-8 pt-0.5 text-style-caption text-danger"
        >
          {overflowText}
        </p>
      )}
    </div>
  );
}

/** Column captions rendered once above the first row of a set list. */
export function WorkoutSetColumnHeader({
  measure = "weight_reps",
}: {
  measure?: ExerciseMeasure | undefined;
}) {
  const ss = messages.fizruk.session;
  const mr = messages.fizruk.measureRow;
  const fields = rowFields(measure);
  const caption = (k: FieldKey) =>
    k === "weight"
      ? ss.columnKg
      : k === "reps"
        ? ss.columnReps
        : k === "time"
          ? mr.columnSec
          : mr.columnMeters;
  return (
    <div
      className="flex items-center gap-2 px-1 -mx-1"
      aria-hidden
      data-set-header
    >
      <span className="w-6 shrink-0" />
      {fields.map((k) => (
        <span key={k} className="flex-1 px-3 text-style-caption text-subtle">
          {caption(k)}
        </span>
      ))}
      {/* RPE column — icon-only trigger in the row below, no caption here
          (mirrors the check/trash slots, which also caption nothing). */}
      <span data-set-slot="rpe" className={cn("shrink-0", TRAILING_SLOT_W)} />
      <span className="w-11 shrink-0" />
      <span data-set-slot="trash" className={cn("shrink-0", TRAILING_SLOT_W)} />
    </div>
  );
}
