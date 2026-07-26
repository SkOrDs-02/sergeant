import type { MouseEvent } from "react";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { hapticTap } from "@shared/lib/adapters/haptic";

/**
 * NumericAccessoryBar (UI-15)
 * ───────────────────────────
 * A thin action strip that sits directly above the on-screen numeric
 * keyboard while an amount field is focused. It turns the most common
 * money-entry gestures — bumping by a round increment, appending `.00`, and
 * confirming — into one-tap targets, so the user never has to reach for the
 * small keyboard keys or hunt for the submit button below the fold.
 *
 * The host wires it to a focused input; this component is presentational and
 * value-driven. It never reads focus state itself so it composes cleanly
 * inside a Sheet footer that already tracks the keyboard inset.
 */

export interface NumericAccessoryBarProps {
  /** Current numeric value as a string (may be empty). */
  value: string;
  /** Called with the next value string after an increment / append. */
  onValueChange: (next: string) => void;
  /** Confirm action (usually blur + submit, or advance to next field). */
  onDone: () => void;
  /** Increment chips, in the field's currency/unit. Default: money. */
  increments?: number[];
  /** Label for the confirm button. */
  doneLabel?: string;
  className?: string;
}

function parse(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Trim a float to at most 2 decimals without trailing-zero noise. */
function format(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function NumericAccessoryBar({
  value,
  onValueChange,
  onDone,
  increments = [10, 100, 500],
  doneLabel = messages.actions.done,
  className,
}: NumericAccessoryBarProps) {
  const bump = (delta: number) => {
    hapticTap();
    onValueChange(format(parse(value) + delta));
  };

  const appendCents = () => {
    hapticTap();
    const n = parse(value);
    // Snap to whole-number .00 (the overwhelmingly common "no kopecks" case).
    onValueChange(format(Math.trunc(n)) + ".00");
  };

  // Keep taps from stealing focus / dismissing the keyboard between actions:
  // preventing the default mousedown on each control means the focused input
  // never blurs when a chip is pressed.
  const holdFocus = (e: MouseEvent) => e.preventDefault();

  const chip =
    "shrink-0 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-bg border border-line text-style-caption text-text tabular-nums hover:bg-panelHi transition-colors focus-ring";

  return (
    <div
      role="toolbar"
      aria-label={messages.form.quickFill}
      className={cn(
        "flex items-center gap-2 overflow-x-auto no-scrollbar",
        "border-t border-line bg-panel/95 backdrop-blur px-3 py-2",
        className,
      )}
    >
      {increments.map((inc) => (
        <button
          key={inc}
          type="button"
          onMouseDown={holdFocus}
          onClick={() => bump(inc)}
          className={chip}
        >
          {`+${inc}`}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={holdFocus}
        onClick={appendCents}
        className={chip}
      >
        .00
      </button>
      <button
        type="button"
        onMouseDown={holdFocus}
        onClick={onDone}
        className="shrink-0 min-h-[44px] px-4 ml-auto rounded-xl bg-accent text-bg text-style-caption font-semibold hover:opacity-90 transition-opacity focus-ring"
      >
        {doneLabel}
      </button>
    </div>
  );
}
