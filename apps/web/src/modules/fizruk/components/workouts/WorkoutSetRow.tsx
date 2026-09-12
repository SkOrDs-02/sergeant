/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import { MAX_REPS, MAX_WEIGHT_KG } from "../../lib/numericBounds";
import { fmtLoose } from "../../lib/numberFmt";
import { fizrukPageMessages as fizrukCopy } from "@shared/i18n/uk.fizruk";

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
export function isSetDone(s: WorkoutSet | null | undefined): boolean {
  if (!s) return false;
  return (s.reps ?? 0) > 0;
}

const INPUT_CLASS =
  "input-focus-fizruk h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-base font-semibold text-text tabular-nums placeholder:font-normal placeholder:text-subtle read-only:opacity-70 read-only:cursor-not-allowed";

/**
 * One editable set row inside the exercise card: `№ · кг · повт · ✓`
 * (+ кошик лише на останньому рядку).
 *
 * Редизайн 2026-09 (спека `fizruk-active-session.md`, рішення 5) — чотири
 * колонки замість шести. «Було» з минулого разу більше не окрема колонка
 * на 48 px, а плейсхолдер у самих полях: сіре «80» у полі ваги і «8» у
 * полі повторень. Тап по ✓ на такому порожньому рядку = «повторив, як
 * минулого разу»: підставляє обидва значення й одразу стартує відпочинок.
 * ✓ ніколи не виглядає вимкненим — до заповнення це контур в акценті
 * модуля, а тап без повторень і без підказки ставить фокус у поле, щоб
 * людина бачила, чого бракує.
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
  onApplyGhost,
  onCheckTap,
  onDelete,
}: WorkoutSetRowProps) {
  const sr = fizrukCopy.setRow;
  const ss = fizrukCopy.session;
  const done = isSetDone(set);
  const setNumber = index + 1;
  const ghostSet = ghost && !done && !isReadOnly ? ghost : null;
  const repsRef = useRef<HTMLInputElement>(null);
  // Вага — єдине десяткове поле рядка (повторення цілі), тож кома потрібна
  // саме тут: «82,5» під `type="number"` доїжджало сюди порожнім рядком і
  // клемп мовчки писав 0. Порожнє поле лишається нулем — 0 кг це валідна
  // вправа з власною вагою, а не «не вказано» (див. `isSetDone`).
  const weightDraft = useDecimalDraft(
    set.weightKg || "",
    MAX_WEIGHT_KG,
    (value) => onChangeWeight(value ?? 0),
  );

  const ghostLabel = ghostSet
    ? `${fmtLoose(ghostSet.weightKg ?? 0)}×${ghostSet.reps ?? 0}`
    : null;
  const checkAria = done
    ? `${sr.numberAriaPrefix} ${setNumber}: ${sr.doneAriaLabel}`
    : ghostLabel
      ? `${sr.numberAriaPrefix} ${setNumber}: ${ss.repeatGhostAria} ${ghostLabel} ${ss.repeatGhostAriaSuffix}`
      : `${sr.numberAriaPrefix} ${setNumber}: ${sr.notDoneAriaLabel}, ${ss.fillRepsAria}`;

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
    repsRef.current?.focus();
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-1 py-1 -mx-1 transition-colors",
        isCurrent && !isReadOnly && "bg-fizruk-surface",
      )}
      data-current={isCurrent && !isReadOnly ? "true" : undefined}
    >
      <span
        className={cn(
          "w-6 shrink-0 text-center text-style-label tabular-nums",
          isCurrent && !isReadOnly
            ? "font-bold text-fizruk-strong dark:text-fizruk"
            : "text-subtle",
        )}
        aria-hidden
      >
        {setNumber}
      </span>
      <input
        className={cn(INPUT_CLASS, isCurrent ? "bg-panel" : "bg-panelHi")}
        type="text"
        inputMode="decimal"
        // Плейсхолдер несе ТІЛЬКИ значення з минулого разу. Підпис колонки
        // вже стоїть рядком вище (`WorkoutSetColumnHeader`), тож «кг» у
        // порожньому полі дублював його (браузерний прохід 2026-09-11).
        placeholder={ghostSet ? fmtLoose(ghostSet.weightKg ?? 0) : ""}
        aria-label={sr.weightAriaLabel}
        value={weightDraft.value}
        readOnly={isReadOnly}
        onFocus={(e) => e.target.select()}
        onChange={weightDraft.onChange}
      />
      <input
        ref={repsRef}
        className={cn(INPUT_CLASS, isCurrent ? "bg-panel" : "bg-panelHi")}
        type="number"
        inputMode="numeric"
        placeholder={ghostSet ? String(ghostSet.reps ?? 0) : ""}
        min={0}
        max={MAX_REPS}
        aria-label={sr.repsAriaLabel}
        value={set.reps || ""}
        readOnly={isReadOnly}
        onFocus={(e) => e.target.select()}
        onChange={(e) =>
          onChangeReps(clampNumericInput(e.target.value, MAX_REPS))
        }
      />
      <button
        type="button"
        disabled={isReadOnly}
        aria-label={checkAria}
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:cursor-not-allowed",
          done
            ? "border-success bg-success/15 text-success-strong dark:text-success hover:bg-success/25"
            : ghostSet
              ? "border-fizruk-strong bg-panel text-fizruk-strong dark:border-fizruk dark:text-fizruk hover:bg-fizruk-surface"
              : "border-fizruk-ring bg-panel text-fizruk-strong dark:text-fizruk opacity-70 hover:opacity-100",
        )}
        onClick={handleCheck}
      >
        <Icon name="check" size={18} aria-hidden />
      </button>
      {isLast && !isReadOnly ? (
        <button
          type="button"
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl pointer-coarse:min-h-[44px] text-subtle hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          onClick={onDelete}
          aria-label={`${sr.deleteAriaPrefix} ${setNumber}`}
        >
          <Icon name="trash" size={15} aria-hidden />
        </button>
      ) : (
        <span className="w-9 shrink-0" aria-hidden />
      )}
    </div>
  );
}

/** Column captions rendered once above the first row of a strength card. */
export function WorkoutSetColumnHeader() {
  const ss = fizrukCopy.session;
  return (
    <div className="flex items-center gap-2 px-1 -mx-1" aria-hidden>
      <span className="w-6 shrink-0" />
      <span className="flex-1 px-3 text-style-caption text-subtle">
        {ss.columnKg}
      </span>
      <span className="flex-1 px-3 text-style-caption text-subtle">
        {ss.columnReps}
      </span>
      <span className="w-11 shrink-0" />
      <span className="w-9 shrink-0" />
    </div>
  );
}
