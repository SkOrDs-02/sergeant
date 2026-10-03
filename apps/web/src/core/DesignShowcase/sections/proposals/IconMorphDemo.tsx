import { useState } from "react";
import { ComparePair, CompareTile } from "./_Compare";
import { Icon } from "@shared/components/ui";
import { cn } from "@shared/lib/ui/cn";

/**
 * V-19 — Action-icon state morph (add → check).
 *
 * `AnimatedCheckbox` already animates a checkbox toggle, but action *buttons*
 * (e.g. "add entry") swap their icon abruptly on success. The proposal
 * cross-fades / scales the `plus` icon into a `check` on success, so the
 * button confirms the action with a small state morph instead of a hard swap.
 *
 * Mock only — tap each button to compare the hard swap vs the morph.
 */

export function IconMorphDemo() {
  const [beforeDone, setBeforeDone] = useState(false);
  const [afterDone, setAfterDone] = useState(false);

  const fire = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 1400);
  };

  return (
    <ComparePair
      before={
        <CompareTile dim>
          <button
            type="button"
            onClick={() => fire(setBeforeDone)}
            className="h-12 w-12 rounded-full bg-finyk text-bg flex items-center justify-center"
          >
            <Icon name={beforeDone ? "check" : "plus"} size={22} />
          </button>
          <p className="text-style-caption text-muted">
            Іконка міняється стрибком
          </p>
        </CompareTile>
      }
      after={
        <CompareTile>
          <button
            type="button"
            onClick={() => fire(setAfterDone)}
            className="relative h-12 w-12 rounded-full bg-finyk text-bg flex items-center justify-center overflow-hidden"
          >
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-slow",
                afterDone
                  ? "opacity-0 scale-50 rotate-90"
                  : "opacity-100 scale-100 rotate-0",
              )}
            >
              <Icon name="plus" size={22} />
            </span>
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-slow",
                afterDone
                  ? "opacity-100 scale-100 rotate-0"
                  : "opacity-0 scale-50 -rotate-90",
              )}
            >
              <Icon name="check" size={22} />
            </span>
          </button>
          <p className="text-style-caption text-muted">
            Plus плавно морфить у check
          </p>
        </CompareTile>
      }
    />
  );
}
