/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";
import { MAX_REPS, MAX_WEIGHT_KG } from "../../lib/numericBounds";
import { fmtLoose } from "../../lib/numberFmt";

export interface WorkoutSetRowProps {
  /** 0-based position inside `it.sets`. */
  index: number;
  set: WorkoutSet;
  /** Same-position set from the previous session for this exercise
   * (already filtered to non-empty by the caller), or `null` when
   * there is nothing to suggest at this row. */
  ghost: WorkoutSet | null;
  isReadOnly: boolean;
  onChangeWeight: (weightKg: number) => void;
  onChangeReps: (reps: number) => void;
  /** Fill both fields from `ghost` — no-op if `ghost` is null. */
  onApplyGhost: () => void;
  /** Tap on the ✓ control. Only reachable while the row is "done"
   * (see {@link isSetDone}); the caller decides whether this also
   * starts the rest timer (grouped / ended-workout guards live in
   * `WorkoutItemCard`, not here). */
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

/**
 * One editable set row inside the active-workout card:
 * `№ · було(ghost) · кг · повт · ✓ · 🗑`.
 *
 * Replaces the old `grid-cols-3` (кг | повт | "Видалити") row — the set
 * row is now the dominant element of the card (redesign 2026-08,
 * variant A): every set carries its own ordinal, a tap-to-fill hint
 * from the previous session, and an explicit "done" control that
 * starts the rest timer instead of the old `onChange`-driven
 * auto-start heuristic.
 */
export function WorkoutSetRow({
  index,
  set,
  ghost,
  isReadOnly,
  onChangeWeight,
  onChangeReps,
  onApplyGhost,
  onCheckTap,
  onDelete,
}: WorkoutSetRowProps) {
  const sr = messages.fizruk.setRow;
  const done = isSetDone(set);
  const setNumber = index + 1;
  const ghostSet = ghost && !done && !isReadOnly ? ghost : null;
  // Вага — єдине десяткове поле рядка (повторення цілі), тож кома потрібна
  // саме тут: «82,5» під `type="number"` доїжджало сюди порожнім рядком і
  // клемп мовчки писав 0. Порожнє поле лишається нулем — 0 кг це валідна
  // вправа з власною вагою, а не «не вказано» (див. `isSetDone`).
  const weightDraft = useDecimalDraft(
    set.weightKg || "",
    MAX_WEIGHT_KG,
    (value) => onChangeWeight(value ?? 0),
  );

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-5 shrink-0 text-center text-style-caption text-subtle tabular-nums"
        aria-hidden
      >
        {setNumber}
      </span>
      {ghostSet ? (
        <button
          type="button"
          className="h-10 w-12 shrink-0 rounded-lg border border-dashed border-line/70 pointer-coarse:min-h-[44px] text-style-caption text-subtle tabular-nums hover:border-fizruk/50 hover:text-fizruk-strong dark:hover:text-fizruk transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          onClick={onApplyGhost}
          aria-label={`${sr.ghostAriaPrefix} ${fmtLoose(ghostSet.weightKg ?? 0)}×${ghostSet.reps ?? 0} ${sr.ghostAriaSuffix}`}
        >
          {fmtLoose(ghostSet.weightKg ?? 0)}×{ghostSet.reps ?? 0}
        </button>
      ) : (
        <span className="w-12 shrink-0" aria-hidden />
      )}
      <input
        className="input-focus-fizruk h-10 min-w-0 flex-1 rounded-xl border border-line bg-panelHi px-2 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
        type="text"
        inputMode="decimal"
        placeholder={sr.weightPlaceholder}
        aria-label={sr.weightAriaLabel}
        value={weightDraft.value}
        readOnly={isReadOnly}
        onFocus={(e) => e.target.select()}
        onChange={weightDraft.onChange}
      />
      <input
        className="input-focus-fizruk h-10 min-w-0 flex-1 rounded-xl border border-line bg-panelHi px-2 text-sm text-text read-only:opacity-70 read-only:cursor-not-allowed"
        type="number"
        inputMode="numeric"
        placeholder={sr.repsPlaceholder}
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
        disabled={isReadOnly || !done}
        aria-label={`${sr.numberAriaPrefix} ${setNumber}: ${done ? sr.doneAriaLabel : sr.notDoneAriaLabel}`}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:cursor-not-allowed",
          done
            ? "border-success bg-success/15 text-success-strong dark:text-success hover:bg-success/25"
            : "border-line bg-panel text-subtle/40",
        )}
        onClick={onCheckTap}
      >
        <Icon name="check" size={16} aria-hidden />
      </button>
      <button
        type="button"
        disabled={isReadOnly}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] text-subtle/70 hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-subtle/70"
        onClick={onDelete}
        aria-label={`${sr.deleteAriaPrefix} ${setNumber}`}
      >
        <Icon name="trash" size={13} aria-hidden />
      </button>
    </div>
  );
}
