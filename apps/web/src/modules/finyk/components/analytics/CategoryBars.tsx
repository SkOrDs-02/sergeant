import { memo, useState, type ReactNode } from "react";
import { chartHex } from "@sergeant/design-tokens/tokens";
import { cn } from "@shared/lib/ui/cn";
import { Money } from "@shared/components/ui/Money";
import { stripLeadingEmoji } from "../txRowHelpers";

/**
 * Витрати по категоріях горизонтальними барами (мова H, redesign v3):
 * від більшої до меншої, сума й частка текстом у рядку, минулий місяць
 * привидом під баром. Заміна donut-а з легендою (каталог п. 13, рішення
 * власника 2026-10-09).
 */
interface CategorySlice {
  categoryId: string;
  label: string;
  spent: number;
  color: string;
}

interface CategoryBarsProps {
  data?: CategorySlice[];
  /** Рядки дельт місяця: `prevMinor` (копійки) малюється привидом під баром. */
  previous?: readonly { categoryId: string; prevMinor: number }[] | undefined;
  className?: string;
  /** Дрил-даун у список операцій, звужений категорією. */
  onSelectCategory?: (categoryId: string) => void;
  /** «Приховати суми» (PR-F3): суми маскуються, частки й бари лишаються. */
  showBalance?: boolean;
}

const TOP_N = 5;

function Row({
  onSelect,
  children,
}: {
  onSelect?: (() => void) | undefined;
  children: ReactNode;
}) {
  const shared = "block w-full py-2 text-left";
  if (!onSelect) return <div className={shared}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(shared, "rounded-lg focus-ring hover:bg-panel")}
    >
      {children}
    </button>
  );
}

function CategoryBarsComponent({
  data = [],
  previous,
  className,
  onSelectCategory,
  showBalance = true,
}: CategoryBarsProps) {
  const [showAll, setShowAll] = useState(false);
  // `spent` у гривнях, `prevMinor` у копійках.
  const prevBy = new Map(
    previous?.map((r) => [r.categoryId, r.prevMinor / 100]) ?? [],
  );
  const sorted = [...data].sort((a, b) => b.spent - a.spent);
  const total = sorted.reduce((s, d) => s + d.spent, 0);
  if (sorted.length === 0 || total === 0) return null;

  const hasOverflow = sorted.length > TOP_N;
  const otherSpent = sorted.slice(TOP_N).reduce((s, d) => s + d.spent, 0);
  const rows =
    showAll || !hasOverflow
      ? sorted
      : [
          ...sorted.slice(0, TOP_N),
          {
            categoryId: "_other",
            label: "Інше",
            spent: otherSpent,
            color: chartHex.neutral,
          },
        ];
  const max = Math.max(
    ...rows.map((r) => Math.max(r.spent, prevBy.get(r.categoryId) ?? 0)),
  );

  return (
    <div className={cn("w-full", className)}>
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const pct = Math.round((row.spent / total) * 100);
          const prev = prevBy.get(row.categoryId) ?? 0;
          return (
            <li key={row.categoryId}>
              <Row
                onSelect={
                  onSelectCategory && row.categoryId !== "_other"
                    ? () => onSelectCategory(row.categoryId)
                    : undefined
                }
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-style-body font-semibold text-text">
                    {stripLeadingEmoji(row.label)}
                  </span>
                  {showBalance ? (
                    <Money
                      amount={row.spent}
                      className="shrink-0 text-style-body font-medium text-text"
                    />
                  ) : (
                    <span className="shrink-0 text-style-body text-text">
                      ••••
                    </span>
                  )}
                  <span className="w-10 shrink-0 text-right text-style-label tnum text-subtle">
                    {pct < 1 ? "<1" : pct}%
                  </span>
                </span>
                <span
                  aria-hidden
                  className="relative mt-1.5 block h-[5px] rounded-sm bg-track"
                >
                  {prev > 0 && (
                    <span
                      data-testid="category-bar-ghost"
                      className="absolute inset-y-0 left-0 rounded-sm bg-line"
                      style={{ width: `${(prev / max) * 100}%` }}
                    />
                  )}
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${(row.spent / max) * 100}%`,
                      background: row.color,
                    }}
                  />
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          data-testid="finyk-analytics-donut-toggle"
          className="mt-1 min-h-[44px] text-style-label font-semibold text-text focus-ring rounded-lg"
        >
          {showAll ? "Згорнути" : `Показати всі (${sorted.length})`}
        </button>
      )}
    </div>
  );
}

export const CategoryBars = memo(CategoryBarsComponent);
