import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { THEME_HEX } from "@shared/lib/ui/themeHex";
import { Money } from "@shared/components/ui/Money";
import { MINUS_SIGN, NARROW_NBSP } from "@sergeant/shared";

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
  /*
    AI-CONTEXT: знак приходить рядком від `useOverviewData`, і там він
    ДЕФІС (`"-"`), а не мінус. Тут він нормалізується у напрямок, а сам
    символ малює `Money` — U+2212, однакової ширини з цифрою. Доти
    стовпчик потоків «з'їжджав» на кожному від'ємному рядку, і фікстура
    тесту навіть підсовувала U+2212, якого прод ніколи не рендерив.
  */
  const negative = flow.sign !== "+";
  return (
    <div className="flex justify-between items-center py-3 border-b border-line last:border-0">
      <div className="min-w-0 mr-3">
        <div className="text-style-body leading-snug truncate">
          {flow.title}
        </div>
        <div className="text-xs text-subtle mt-0.5">{flow.hint}</div>
      </div>
      <div
        className={cn(
          "text-style-title tabular-nums shrink-0",
          isGreen
            ? "text-success-strong dark:text-success"
            : "text-danger-strong dark:text-danger",
        )}
      >
        {!showAmount ? (
          "••••"
        ) : flow.amount === null ? (
          // Невідома сума — не число, тож і тирів у неї немає. Знак і
          // валюта лишаються, бо вони відомі: невідомо СКІЛЬКИ, а не що.
          `${negative ? MINUS_SIGN : "+"}?${NARROW_NBSP}${flow.currency}`
        ) : (
          <Money
            amount={negative ? -flow.amount : flow.amount}
            signed
            symbol={flow.currency}
            tone="inherit"
          />
        )}
      </div>
    </div>
  );
});
