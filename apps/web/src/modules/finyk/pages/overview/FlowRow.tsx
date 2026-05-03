import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { THEME_HEX } from "@shared/lib/ui/themeHex";

export interface FlowItem {
  title: string;
  hint?: string;
  color?: string;
  amount: number | null;
  sign: string;
  currency: string;
}

interface FlowRowProps {
  flow: FlowItem;
  showAmount?: boolean;
}

/**
 * Рядок запланованого грошового потоку. Пропси вже готові до рендеру —
 * memo знімає перерахунок і diff на кожному ре-рендері Overview.
 */
export const FlowRow = memo(function FlowRow({
  flow,
  showAmount = true,
}: FlowRowProps) {
  const isGreen = flow.color === THEME_HEX.success;
  return (
    <div className="flex justify-between items-center py-3 border-b border-line last:border-0">
      <div className="min-w-0 mr-3">
        <div className="text-base font-medium leading-snug truncate">
          {flow.title}
        </div>
        <div className="text-xs text-subtle mt-0.5">{flow.hint}</div>
      </div>
      <div
        className={cn(
          "text-base font-bold tabular-nums shrink-0",
          isGreen ? "text-success" : "text-danger",
        )}
      >
        {showAmount
          ? (flow.amount === null
              ? `${flow.sign}?`
              : `${flow.sign}${flow.amount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}`) +
            ` ${flow.currency}`
          : "••••"}
      </div>
    </div>
  );
});
