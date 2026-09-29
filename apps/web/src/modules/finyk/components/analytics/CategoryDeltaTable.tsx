/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { memo } from "react";
import { Money, Delta } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import type { CategoryDeltaRow } from "@sergeant/finyk-domain/domain/trends";

const copy = messages.finyk.categoryDeltas;

interface CategoryDeltaTableProps {
  rows: readonly CategoryDeltaRow[];
  showBalance?: boolean;
}

/**
 * «Категорія · минулий · цей · зміна» (Р12). Відсоток лише там, де
 * попередній місяць є базою, інакше абсолютна дельта в гривнях (Р4).
 */
function CategoryDeltaTableComponent({
  rows,
  showBalance = true,
}: CategoryDeltaTableProps) {
  if (rows.length === 0) return null;
  return (
    <table className="w-full text-style-body">
      <thead>
        <tr className="text-style-caption text-subtle">
          <th scope="col" className="text-left font-normal pb-2">
            {copy.category}
          </th>
          <th scope="col" className="text-right font-normal pb-2">
            {copy.previous}
          </th>
          <th scope="col" className="text-right font-normal pb-2">
            {copy.current}
          </th>
          <th scope="col" className="text-right font-normal pb-2">
            <span className="sr-only">{copy.change}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const diff = Math.round(r.delta.diffMinor / 100);
          const pct = r.delta.pct;
          return (
            <tr key={r.categoryId} className="border-t border-line">
              <th scope="row" className="text-left font-normal py-1.5 pr-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: r.color }}
                    aria-hidden
                  />
                  <span className="truncate text-text">{r.label}</span>
                </span>
              </th>
              <td className="text-right text-muted tabular-nums py-1.5 pl-2">
                {showBalance ? <Money amount={r.prevMinor / 100} /> : "••••"}
              </td>
              <td className="text-right text-text tabular-nums py-1.5 pl-2">
                {showBalance ? <Money amount={r.currentMinor / 100} /> : "••••"}
              </td>
              <td className="text-right py-1.5 pl-2 whitespace-nowrap">
                {showBalance && (pct !== null || diff !== 0) && (
                  <Delta
                    value={pct === null ? diff : Math.round(pct)}
                    symbol={pct === null ? "₴" : "%"}
                    polarity="negative"
                    className="text-style-caption font-normal"
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const CategoryDeltaTable = memo(CategoryDeltaTableComponent);
