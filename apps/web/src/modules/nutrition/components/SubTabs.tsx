/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { useTablistArrowKeys } from "@shared/hooks/useTablistArrowKeys";

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
  // Роль `tablist` обіцяє стрілки; без хука обіцянка була порожня.
  const onTabKeyDown = useTablistArrowKeys();
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
            tabIndex={active ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => onChange(t.id)}
            className={cn(
              "text-style-label flex-1 min-h-[40px] px-3 py-2 rounded-xl transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              // Вибраний піл — `border-control`: біла заливка на `panelHi` дає
              // лише 1.09:1, а стан вибору мусить читатись ≥3:1 (аудит
              // 2026-10-01, A4). Невибраний має прозору межу, щоб висота не стрибала.
              "border",
              active
                ? "border-control bg-panel text-text shadow-sm"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
