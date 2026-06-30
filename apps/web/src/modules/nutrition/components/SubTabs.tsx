/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";

interface SubTab {
  id: string;
  label: string;
}

interface SubTabsProps {
  value: string;
  onChange: (id: string) => void;
  tabs: SubTab[];
  className?: string;
  ariaLabel?: string;
}

/**
 * Inline segmented control for splitting a merged bottom-nav page into
 * sub-sections (e.g. `Склад` / `Покупки` inside pantry).
 */
export function SubTabs({
  value,
  onChange,
  tabs,
  className,
  ariaLabel,
}: SubTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1 p-1 rounded-2xl bg-panelHi border border-line",
        className,
      )}
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "text-style-label flex-1 min-h-[40px] px-3 py-2 rounded-xl transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              active
                ? "bg-panel text-text shadow-sm"
                : "text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
