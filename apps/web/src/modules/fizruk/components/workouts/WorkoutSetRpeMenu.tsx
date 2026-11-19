/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Compact "тап, не друк" RPE (Borg 1..10) picker for one set row
 * (`WorkoutSetRow.tsx`). RPE is strictly optional — the trigger shows a
 * caption until a value is picked, and picking "Прибрати" clears it back
 * to `null` rather than `0` (0 would read as a real, very-low effort score).
 *
 * **Панель розгортається під рядком, а не спливає поверх нього (фідбек
 * власника 2026-11-19).** Попередній `Popover` на `top-end` накривав шапку
 * вправи й попередні підходи, тобто рівно те, з чим людина звіряє оцінку, а
 * порожній тригер із прочерком читався як вимкнена клітинка — поле ніхто не
 * знаходив. Тепер порожня клітинка підписана «RPE», а сітка 1–10 зі словами
 * на краях шкали стає наступним рядком того самого flex-контейнера
 * (`basis-full order-last`): рядок підходу має `flex-wrap`, тож панель
 * займає власну лінію під полями й посуває вміст, нічого не перекриваючи.
 *
 * AI-CONTEXT: this control only feeds the persisted `WorkoutSet.rpe`
 * field and its own display — `recoveryCompute.ts` does not read RPE
 * (canon `fizruk.md` §4 "Що НЕ зроблено": folding RPE into the fatigue
 * formula is a founder calibration call, not an engineering default).
 * Do not wire this value into recovery/fatigue math.
 */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import { RPE_MAX, RPE_MIN } from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";

export interface WorkoutSetRpeMenuProps {
  /** 1-based set position, used only to compose the aria-label. */
  setNumber: number;
  /** `null`/`undefined` — not filled in. Never `0`. */
  value: number | null | undefined;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  testID?: string;
}

const RPE_VALUES: readonly number[] = Array.from(
  { length: RPE_MAX - RPE_MIN + 1 },
  (_, i) => RPE_MIN + i,
);

/** Ширина клітинки: та сама, що в ✓ і заголовку колонок (`WorkoutSetColumnHeader`). */
export const RPE_CELL_CLASS = "w-11 shrink-0";

/**
 * One exercise-focus-screen set row's RPE trigger + inline tap-to-pick
 * panel. Renders a fragment: the trigger is a regular flex child of the
 * row, the panel wraps onto its own line below it.
 */
export function WorkoutSetRpeMenu({
  setNumber,
  value,
  disabled = false,
  onChange,
  testID = "fizruk-set-rpe",
}: WorkoutSetRpeMenuProps) {
  const sr = messages.fizruk.setRow;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rpe = typeof value === "number" ? value : null;

  const triggerAria =
    rpe != null
      ? `${sr.numberAriaPrefix} ${setNumber}: ${sr.rpeAriaLabel} ${rpe}`
      : `${sr.numberAriaPrefix} ${setNumber}: ${sr.rpeAriaLabel}, ${sr.rpeNotSetAriaLabel}`;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const pick = (n: number | null) => {
    onChange(n);
    close();
  };

  // Escape висить на кнопках панелі, а не на її контейнері: фокус усередині
  // панелі завжди на одній із них, а слухач на `role="group"` — це
  // неінтерактивний елемент із клавіатурним обробником (jsx-a11y).
  const onPanelKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  if (disabled) {
    // Read-only host (rare — `SessionView` only reaches this with
    // `isReadOnly` mid-finish-transition; ended workouts render
    // `WorkoutSummaryView` instead). Keep the column width stable
    // without offering a control nobody can use.
    return (
      <span
        aria-label={triggerAria}
        data-testid={testID}
        className={cn(
          RPE_CELL_CLASS,
          "flex h-11 items-center justify-center rounded-lg border border-line bg-panelHi text-style-caption tabular-nums text-subtle",
        )}
      >
        {rpe ?? "–"}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerAria}
        aria-expanded={open}
        aria-controls={panelId}
        title={sr.rpeTriggerTitle}
        data-testid={testID}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          RPE_CELL_CLASS,
          "flex h-11 select-none items-center justify-center rounded-lg border tabular-nums transition-colors focus-ring",
          rpe != null
            ? "border-line bg-panelHi text-style-label font-semibold text-text"
            : "border-dashed border-control bg-panelHi text-style-caption text-muted hover:text-text",
          open && "border-solid border-text",
        )}
      >
        {rpe ?? sr.rpeEmptyLabel}
      </button>
      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={`${sr.rpeMenuHeading}, ${sr.numberAriaPrefix.toLowerCase()} ${setNumber}`}
          className="order-last basis-full rounded-lg bg-panelHi px-3 pb-3 pt-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-style-label font-semibold text-text">
              {sr.rpeMenuHeading}
            </p>
            <Button
              type="button"
              size="sm"
              variant="text"
              disabled={rpe == null}
              onClick={() => pick(null)}
              onKeyDown={onPanelKeyDown}
              data-testid={`${testID}-clear`}
            >
              {sr.rpeClear}
            </Button>
          </div>
          <p className="mb-2 text-style-caption text-subtle">
            {sr.rpeMenuHint}
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {RPE_VALUES.map((n) => {
              // `variant` мусить лишатись ЛІТЕРАЛОМ у кожному тегу:
              // `Button.toneRenders.test.ts` читає його регексом і на
              // `variant={expr}` падає у фолбек `"primary"` — а це
              // legacy-варіант, у якому `tone` відкидається не читаючи.
              const common = {
                type: "button" as const,
                size: "sm" as const,
                "aria-pressed": rpe === n,
                "aria-label": `RPE ${n}`,
                onClick: () => pick(n),
                onKeyDown: onPanelKeyDown,
                "data-testid": `${testID}-option-${n}`,
                className: "w-full",
              };
              return rpe === n ? (
                <Button key={n} {...common} variant="solid" tone="neutral">
                  {n}
                </Button>
              ) : (
                <Button key={n} {...common} variant="outline" tone="neutral">
                  {n}
                </Button>
              );
            })}
          </div>
          <div
            className="mt-1.5 flex justify-between gap-2 text-style-caption text-subtle"
            aria-hidden
          >
            <span>{sr.rpeLowAnchor}</span>
            <span>{sr.rpeHighAnchor}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
