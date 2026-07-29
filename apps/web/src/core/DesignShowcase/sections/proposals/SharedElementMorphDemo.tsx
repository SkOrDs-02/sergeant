import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { useReducedMotion } from "@shared/hooks";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-V-2 — Shared-element morph of the module icon.
 *
 * Before: the module tile icon and the module header icon are separate
 * elements — entering the module just swaps screens. After: the tile icon
 * animates (position + scale) into the module header, so it reads as one
 * continuous object. Pairs with R2-V-1 (view transitions).
 *
 * Mock only — tap "Увійти" / "Назад" to watch the icon travel.
 */

export function SharedElementMorphDemo() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const color = "rgb(var(--c-chart-nutrition))";

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="flex-1 min-h-0 px-3 pt-2">
            <p className="text-style-caption text-muted mb-2">Хаб → Їжа</p>
            <div className="h-16 rounded-xl bg-panel border border-line flex items-center gap-2 px-3">
              <span
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                  color,
                }}
              >
                <Icon name="pie-chart" size={16} />
              </span>
              <span className="text-style-caption text-text">Їжа</span>
            </div>
            <p className="text-2xs text-muted mt-3">
              Іконка просто зникає й зʼявляється зверху.
            </p>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="relative flex-1 min-h-0 px-3 pt-2 overflow-hidden">
            <p className="text-style-caption text-muted mb-2">
              {open ? "Їжа" : "Хаб → Їжа"}
            </p>
            {/* tile (hidden when open) */}
            <div
              className={cn(
                "h-16 rounded-xl bg-panel border border-line flex items-center gap-2 px-3 transition-opacity",
                open && "opacity-0",
              )}
            >
              <span className="h-8 w-8" />
              <span className="text-style-caption text-text">Їжа</span>
            </div>
            {/* the traveling icon */}
            <span
              className={cn(
                "absolute flex items-center justify-center rounded-lg",
                !reduced && "transition-all duration-500 ease-out",
              )}
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                color,
                top: open ? 8 : 44,
                left: open ? 12 : 20,
                height: open ? 40 : 32,
                width: open ? 40 : 32,
              }}
            >
              <Icon name="pie-chart" size={open ? 22 : 16} />
            </span>
            {open ? (
              <div className="mt-14 space-y-2">
                <div className="h-14 rounded-xl bg-panel border border-line" />
                <div className="h-10 rounded-xl bg-panel border border-line" />
              </div>
            ) : null}
            <div className="absolute inset-x-3 bottom-2">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="w-full h-9 rounded-xl bg-accent text-bg text-2xs font-medium"
              >
                {open ? "Назад" : "Увійти"}
              </button>
            </div>
          </div>
        </MiniPhone>
      }
    />
  );
}
