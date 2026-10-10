/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Money, Delta } from "@shared/components/ui/Money";
import { pluralTimes } from "@sergeant/shared";
import type { AmountDelta } from "@sergeant/finyk-domain/domain/types";

interface MerchantStat {
  key?: string;
  name: string;
  total: number;
  /** Точна сума в копійках; коли є, показ береться з неї, а не з `total`. */
  totalMinor?: number;
  count: number;
  /** Дельта до минулого місяця за правилом Р4 (Р17). */
  delta?: AmountDelta | null;
}

interface MerchantListProps {
  merchants?: MerchantStat[];
  /** «Приховати суми» (PR-F3) — маскує суму кожного продавця. */
  showBalance?: boolean;
  className?: string;
}

/**
 * Чи треба показати копійки, щоб сума не збрехала нулем.
 *
 * `Money` за замовчуванням округлює до гривень — на списку топ-продавців це
 * правильно, копійки там шум. Але витрата на 0,01 ₴ малювалась як «0 ₴»,
 * тобто список стверджував, що витрати НЕ БУЛО, тоді як «Операції» поруч
 * чесно показували −0,01 ₴ (той самий `Money`, але з `kopecks`). Округлення,
 * яке зʼїдає весь факт, — це вже не спрощення.
 *
 * Тому копійки вмикаються рівно там, де ціла частина порожня: сотні гривень
 * лишаються без дробової «шуби», а субгривнева сума лишається видимою.
 */
export function needsKopecks(total: number): boolean {
  return total !== 0 && Math.round(total) === 0;
}

// Презентаційний список топ-мерчантів. `memo` уникає перерендеру,
// поки масив `merchants` не змінився.
function MerchantListComponent({
  merchants = [],
  showBalance = true,
  className,
}: MerchantListProps) {
  if (!merchants || merchants.length === 0) return null;

  const maxTotal = merchants[0]?.total || 1;

  return (
    <div className={cn("space-y-2", className)}>
      {merchants.map((m, i) => {
        const barPct = Math.round((m.total / maxTotal) * 100);
        const amount = m.totalMinor != null ? m.totalMinor / 100 : m.total;
        const diff = m.delta ? Math.round(m.delta.diffMinor / 100) : 0;
        const pct = m.delta?.pct ?? null;
        return (
          <div key={m.key ?? m.name} className="flex items-center gap-3">
            <span className="text-style-caption text-subtle w-4 shrink-0 text-right tabular-nums">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-style-label text-text truncate pr-2">
                  {m.name}
                </span>
                {showBalance ? (
                  <Money
                    amount={amount}
                    kopecks={needsKopecks(amount)}
                    className="text-style-label text-text shrink-0"
                  />
                ) : (
                  <span className="text-style-label text-text shrink-0">
                    ••••
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-chart-finyk/70 rounded-full"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className="text-style-caption text-subtle shrink-0">
                  {m.count} {pluralTimes(m.count)}
                </span>
                {showBalance && m.delta && (pct !== null || diff !== 0) && (
                  <Delta
                    value={pct === null ? diff : Math.round(pct)}
                    symbol={pct === null ? "₴" : "%"}
                    polarity="negative"
                    className="text-style-caption font-normal shrink-0"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const MerchantList = memo(MerchantListComponent);
