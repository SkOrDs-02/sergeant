/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Compact "тап, не друк" RPE (Borg 1..10) picker for one set row
 * (`WorkoutSetRow.tsx`). RPE is strictly optional — the trigger shows a
 * dash until a value is picked, and picking "Прибрати" clears it back to
 * `null` rather than `0` (0 would read as a real, very-low effort score).
 *
 * AI-CONTEXT: this control only feeds the persisted `WorkoutSet.rpe`
 * field and its own display — `recoveryCompute.ts` does not read RPE
 * (canon `fizruk.md` §4 "Що НЕ зроблено": folding RPE into the fatigue
 * formula is a founder calibration call, not an engineering default).
 * Do not wire this value into recovery/fatigue math.
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Popover } from "@shared/components/ui/Popover";
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

/** One exercise-focus-screen set row's RPE trigger + tap-to-pick panel. */
export function WorkoutSetRpeMenu({
  setNumber,
  value,
  disabled = false,
  onChange,
  testID = "fizruk-set-rpe",
}: WorkoutSetRpeMenuProps) {
  const sr = messages.fizruk.setRow;
  const [open, setOpen] = useState(false);
  const rpe = typeof value === "number" ? value : null;

  const triggerAria =
    rpe != null
      ? `${sr.numberAriaPrefix} ${setNumber}: ${sr.rpeAriaLabel} ${rpe}`
      : `${sr.numberAriaPrefix} ${setNumber}: ${sr.rpeAriaLabel}, ${sr.rpeNotSetAriaLabel}`;

  const pick = (n: number | null) => {
    onChange(n);
    setOpen(false);
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
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-panelHi text-style-caption tabular-nums text-subtle"
      >
        {rpe ?? "–"}
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      header={sr.rpeMenuHeading}
      placement="top-end"
      trigger={
        // Popover already wraps `trigger` in its own `role="button"` host
        // (see the component's JSDoc — it explicitly asks for non-interactive
        // content like `<span>`), so this stays a `<span>` rather than a
        // nested `<button>` — the same convention `WorkoutItemRecoveryChip`
        // uses for its Popover trigger.
        <span
          aria-label={triggerAria}
          title={sr.rpeTriggerTitle}
          data-testid={testID}
          className={cn(
            "flex h-11 w-9 shrink-0 cursor-pointer select-none items-center justify-center rounded-xl border text-style-caption font-semibold tabular-nums transition-colors",
            "pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]",
            rpe != null
              ? "border-fizruk-edge bg-fizruk-surface text-fizruk-strong dark:text-fizruk"
              : "border-line bg-panelHi text-subtle hover:text-text",
          )}
        >
          {rpe ?? "–"}
        </span>
      }
    >
      <div className="w-56 px-3 pb-3 pt-1">
        <p className="mb-2 text-style-caption text-subtle">{sr.rpeMenuHint}</p>
        <div className="grid grid-cols-5 gap-1.5">
          {RPE_VALUES.map((n) => {
            // `variant` мусить лишатись ЛІТЕРАЛОМ у кожному тегу:
            // `Button.toneRenders.test.ts` читає його регексом і на
            // `variant={expr}` падає у фолбек `"primary"` — а це
            // legacy-варіант, у якому `tone` відкидається не читаючи.
            // Тобто динамічний тернарник тут зробив би `tone="fizruk"`
            // невидимим для гейта, хоч рантайм і правильний.
            const common = {
              type: "button" as const,
              size: "sm" as const,
              iconOnly: true,
              "aria-pressed": rpe === n,
              "aria-label": `RPE ${n}`,
              onClick: () => pick(n),
              "data-testid": `${testID}-option-${n}`,
            };
            return rpe === n ? (
              <Button key={n} {...common} variant="solid" tone="fizruk">
                {n}
              </Button>
            ) : (
              <Button key={n} {...common} variant="soft" tone="fizruk">
                {n}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 w-full"
          disabled={rpe == null}
          onClick={() => pick(null)}
          data-testid={`${testID}-clear`}
        >
          {sr.rpeClear}
        </Button>
      </div>
    </Popover>
  );
}
