/**
 * Last validated: 2026-11-19
 * Status: Active
 */
import { useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";
import { MAX_REPS, MAX_WEIGHT_KG } from "../../lib/numericBounds";
import { fmtLoose } from "../../lib/numberFmt";
import { RPE_CELL_CLASS, WorkoutSetRpeMenu } from "./WorkoutSetRpeMenu";

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
   * Borg 1..10 effort rating for this set — `null` means "not filled
   * in" (never `0`, see `WorkoutSetRpeMenu`). Optional prop so callers
   * that don't wire RPE yet (tests, older call-sites) keep compiling.
   */
  rpe?: number | null | undefined;
  onChangeRpe?: ((rpe: number | null) => void) | undefined;
  /**
   * Чи показувати ✓. Запис тренування заднім числом (ретро-сесія з
   * відкладеним кінцем) ✓ не має: там нема чого «завершувати» й нема
   * відпочинку, а тап по ✓ запускав таймер посеред вечора, коли людина
   * вже давно не в залі (фідбек власника 2026-11-19). Підхід із повторами
   * і так зарахований (`isSetDone`), а наступний додає «+ Підхід».
   */
  showCheck?: boolean | undefined;
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
  "bg-bg px-3 font-semibold tabular-nums placeholder:font-normal read-only:opacity-70 read-only:cursor-not-allowed";

/**
 * Слот кошика і його порожній двійник в інших рядках.
 *
 * AI-DANGER: ширина мусить збігатись у кнопки й заглушки на ОБОХ типах
 * вказівника. Глобальна сітка безпеки (`styles/mobile.css`) на тачі розтягує
 * будь-який `<button>` до 44 px, а `<span>`-заглушку не чіпає, тож при `w-9`
 * в обох рядок із кошиком був на 8 px вужчим за решту і поля «кг»/«повт»
 * їхали сходинкою (скріншот власника 2026-11-19).
 */
const TRASH_SLOT_CLASS = "w-9 shrink-0 pointer-coarse:w-11";

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
  rpe,
  onChangeRpe,
  showCheck = true,
  onApplyGhost,
  onCheckTap,
  onDelete,
}: WorkoutSetRowProps) {
  const sr = messages.fizruk.setRow;
  const ss = messages.fizruk.session;
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
    // `flex-wrap`: панель RPE (`WorkoutSetRpeMenu`) — `basis-full order-last`
    // дитина цього ж контейнера і переноситься на власну лінію під полями.
    // Поля мають `flex-1` (базис 0), тож самі по собі рядок не переносять.
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg px-1 py-1 -mx-1 transition-colors",
        isCurrent && !isReadOnly && "bg-panelHi",
      )}
      data-current={isCurrent && !isReadOnly ? "true" : undefined}
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
      <div className="min-w-0 flex-1">
        <Input
          size="sm"
          className={INPUT_CLASS}
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
      </div>
      <div className="min-w-0 flex-1">
        <Input
          ref={repsRef}
          size="sm"
          className={INPUT_CLASS}
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
      </div>
      {onChangeRpe && (
        <WorkoutSetRpeMenu
          setNumber={setNumber}
          value={rpe}
          disabled={isReadOnly}
          onChange={onChangeRpe}
        />
      )}
      {showCheck ? (
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
      ) : null}
      {isLast && !isReadOnly ? (
        <button
          type="button"
          className={cn(
            TRASH_SLOT_CLASS,
            "flex h-11 items-center justify-center rounded-lg pointer-coarse:min-h-[44px] text-subtle hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
          onClick={onDelete}
          aria-label={`${sr.deleteAriaPrefix} ${setNumber}`}
        >
          <Icon name="trash" size={15} aria-hidden />
        </button>
      ) : (
        <span className={TRASH_SLOT_CLASS} aria-hidden />
      )}
    </div>
  );
}

/**
 * Column captions rendered once above the first row of a strength card.
 * Слоти праворуч мусять дзеркалити рядок (`WorkoutSetRow`) класами, а не
 * числами: інакше підписи «кг»/«повт» роз'їжджаються з полями під ними.
 */
export function WorkoutSetColumnHeader({
  showRpe = true,
  showCheck = true,
}: {
  showRpe?: boolean | undefined;
  showCheck?: boolean | undefined;
} = {}) {
  const ss = messages.fizruk.session;
  return (
    <div className="flex items-center gap-2 px-1 -mx-1" aria-hidden>
      <span className="w-6 shrink-0" />
      <span className="flex-1 px-3 text-style-caption text-subtle">
        {ss.columnKg}
      </span>
      <span className="flex-1 px-3 text-style-caption text-subtle">
        {ss.columnReps}
      </span>
      {/* RPE несе підпис у самій порожній клітинці, тож тут без тексту. */}
      {showRpe ? <span className={RPE_CELL_CLASS} /> : null}
      {showCheck ? <span className="w-11 shrink-0" /> : null}
      <span className={TRASH_SLOT_CLASS} />
    </div>
  );
}
