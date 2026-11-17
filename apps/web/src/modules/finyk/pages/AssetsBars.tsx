import { type ReactNode } from "react";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { formatNumberUk } from "@sergeant/shared";

export function AssetsLiabilitiesBar({
  assets,
  liabilities,
}: {
  assets: number;
  liabilities: number;
}) {
  const total = assets + liabilities;
  if (total <= 0) return null;
  const assetsPct = Math.round((assets / total) * 100);
  const liabilitiesPct = 100 - assetsPct;
  const summaryId = "finyk-assets-liabilities-summary";
  return (
    <div className="mt-4">
      <div
        className="relative flex h-2 w-full overflow-hidden rounded-sm bg-line"
        role="img"
        aria-label={`Активи ${assetsPct}% · Пасиви ${liabilitiesPct}%`}
        aria-describedby={summaryId}
      >
        <div className="bg-chart-finyk" style={{ width: `${assetsPct}%` }} />
        <div
          className="bg-danger-strong"
          style={{ width: `${liabilitiesPct}%` }}
        />
      </div>
      <div className="flex justify-between text-style-caption text-text mt-2 tabular-nums">
        <span>Активи {assetsPct}%</span>
        <span>Пасиви {liabilitiesPct}%</span>
      </div>
      <div id={summaryId} className="sr-only">
        <p>
          Співвідношення активів і пасивів. Активи:{" "}
          {formatNumberUk(assets, { maximumFractionDigits: 0 })} ₴ ({assetsPct}
          %). Пасиви:{" "}
          {formatNumberUk(liabilities, { maximumFractionDigits: 0 })} ₴ (
          {liabilitiesPct}%).
        </p>
      </div>
    </div>
  );
}

export type SectionBarProps = {
  title: string;
  iconName: IconName;
  iconTone?: "success" | "danger" | "muted" | "finyk";
  /**
   * Підсумок секції. `ReactNode`, а не рядок: сюди йде `Money`, а він —
   * вузли, не текст (анти-слоп П4). Маскований стан («••••») лишається
   * звичайним рядком і проходить тим самим пропом.
   */
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
};

/**
 * Collapsible section header used for Subscriptions / Assets / Liabilities
 * blocks. Стан несуть шеврон праворуч і `aria-expanded` (redesign v3.1).
 */
export function SectionBar({
  title,
  summary,
  open,
  onToggle,
}: SectionBarProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      // Нейтральна група: назва, сума й шеврон стану розгортання.
      className={cn(
        "touch-target group w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-line/40 focus-ring",
        open && "border-b border-line",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <div className="text-style-title text-text truncate">{title}</div>
          {summary && (
            <div className="text-style-caption text-muted mt-0.5 truncate tabular-nums">
              {summary}
            </div>
          )}
        </div>
      </div>
      <MorphChevron open={open} className="ml-2 text-subtle" />
    </button>
  );
}
