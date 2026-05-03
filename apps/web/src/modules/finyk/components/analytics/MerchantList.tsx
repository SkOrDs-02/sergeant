import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";

interface MerchantStat {
  name: string;
  total: number;
  count: number;
}

interface MerchantListProps {
  merchants?: MerchantStat[];
  className?: string;
}

// Презентаційний список топ-мерчантів. `memo` уникає перерендеру,
// поки масив `merchants` не змінився.
function MerchantListComponent({
  merchants = [],
  className,
}: MerchantListProps) {
  if (!merchants || merchants.length === 0) return null;

  const maxTotal = merchants[0]?.total || 1;

  return (
    <div className={cn("space-y-2", className)}>
      {merchants.map((m, i) => {
        const barPct = Math.round((m.total / maxTotal) * 100);
        return (
          <div key={m.name} className="flex items-center gap-3">
            <span className="text-xs text-subtle w-4 shrink-0 text-right tabular-nums">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-sm text-text truncate pr-2">
                  {m.name}
                </span>
                <span className="text-style-label tabular-nums text-text shrink-0">
                  {m.total.toLocaleString("uk-UA")} ₴
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className="text-2xs text-subtle shrink-0">
                  {m.count} разів
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const MerchantList = memo(MerchantListComponent);
