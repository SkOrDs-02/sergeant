import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Money } from "@shared/components/ui/Money";
import { MINUS_SIGN, NARROW_NBSP } from "@sergeant/shared";

export interface FlowItem {
  title: string;
  hint?: string;
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
  /*
    AI-CONTEXT (2026-08-07): тут стояло `const isGreen = flow.color ===
    THEME_HEX.success` — тобто семантика ВІДНОВЛЮВАЛАСЯ ЗІ ЗНАЧЕННЯ
    КОЛЬОРУ. Хекс приходив із `useOverviewData` лише щоб тут його
    порівняли й викинули: у розмітку він не потрапляв ніколи, колір
    малювали класи нижче.

    Поле прибрано, а не замінено на семантичне: усі три виробники потоків
    ставили `sign: "-"` рівно там, де ставили `danger`, і `"+"` там, де
    `success`. Тобто `isGreen` завжди дорівнював `!negative` — носій
    дублював `sign` повністю.

    Небезпека була не в дублі, а в мовчазності: підняли б `statusHex.
    success` на інший тир — і порівняння перестало б збігатися, всі рядки
    стали б червоними, а жоден тип не заперечив би.
  */
  /*
    AI-CONTEXT: знак приходить рядком від `useOverviewData`, і там він
    ДЕФІС (`"-"`), а не мінус. Тут він нормалізується у напрямок, а сам
    символ малює `Money` — U+2212, однакової ширини з цифрою. Доти
    стовпчик потоків «зʼїжджав» на кожному відʼємному рядку, і фікстура
    тесту навіть підсовувала U+2212, якого прод ніколи не рендерив.
  */
  const negative = flow.sign !== "+";
  return (
    <div className="flex justify-between items-center py-3 border-b border-line last:border-0">
      <div className="min-w-0 mr-3">
        <div className="text-style-body leading-snug truncate">
          {flow.title}
        </div>
        <div className="text-style-caption text-subtle mt-0.5">{flow.hint}</div>
      </div>
      <div
        className={cn(
          "text-style-title tabular-nums shrink-0",
          negative
            ? "text-danger-strong dark:text-danger"
            : "text-success-strong dark:text-success",
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
