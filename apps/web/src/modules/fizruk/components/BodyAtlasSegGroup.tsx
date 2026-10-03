/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Segmented toggle-button group used by `BodyAtlas` for the mode/side
 * pickers. Split out of `BodyAtlas.tsx` to keep it under the module-size
 * cap (Hard Rule #18) after the fizruk audit wave 2 a11y fixes.
 */
import { cn } from "@shared/lib/ui/cn";

interface SegOption<T extends string> {
  id: T;
  label: string;
}

/**
 * Fixed 2026-08-08 (fizruk audit wave 2, defect #3): this used to wear
 * `role="tablist"`/`role="tab"` without any of the machinery that role
 * pair requires — `aria-controls`, an actual `tabpanel`, roving tabindex,
 * arrow-key navigation. A screen reader announces "tab 1 of 3" and then
 * every affordance it implies (arrow keys switch tabs) silently does
 * nothing. Selecting a mode/side isn't a tab panel switch anyway — it's a
 * settings toggle — so this is now a plain `role="group"` of toggle
 * buttons (`aria-pressed`), which is what it always behaved like.
 */
export function BodyAtlasSegGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex gap-0.5 rounded-full bg-bg p-0.5"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-h-[44px] rounded-full px-3 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50",
              on
                ? "bg-surface font-medium text-text"
                : "text-subtle hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
