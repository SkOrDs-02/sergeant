import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button } from "@shared/components/ui/Button";
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

export type QuickActionTone = "neutral" | "finyk" | "success" | "danger";

export interface QuickActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  label: string;
  tone?: QuickActionTone;
}

/**
 * CTA used in the quick-action rows above the Assets/Liabilities and
 * Planning sections (row shape varies per page — Assets uses two buttons,
 * Planning uses one combined "Запланувати" trigger; the "3-button row"
 * this comment used to describe was removed 2026-09-03, § founder-UX
 * audit round 2, F2). Each button collapses the "expand → scroll → tap +"
 * flow into a single tap that opens the relevant section *and* reveals
 * its inline form.
 *
 * Це звичайний `Button variant="outline"`, а не картка з іконкою в тонованому
 * квадраті: тайл за формою збігався з картками вмісту поруч, і око не
 * розрізняло «натисни» та «прочитай» (анти-слоп, атрактор icon-in-tinted-
 * square). Іконки немає навмисно: у трьох колонках підпис і є значенням.
 *
 * `forwardRef` + spread решти пропів — щоб кнопка могла бути тригером
 * `DropdownMenu` («+ Актив» відкриває вибір «актив / мені винні»): меню
 * клонує тригер і вішає на нього ref, `aria-haspopup` і власний onClick.
 */
export const QuickActionButton = forwardRef<
  HTMLButtonElement,
  QuickActionButtonProps
>(function QuickActionButton({ label, tone: _tone, className, ...rest }, ref) {
  return (
    <Button
      ref={ref}
      variant="outline"
      size="md"
      className={cn("w-full min-w-0 px-1", className)}
      {...rest}
    >
      <span className="truncate">+ {label}</span>
    </Button>
  );
});

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
 * blocks. The trailing label switches between "Розкласти ↓" / "Згорнути ↑"
 * to make the affordance unambiguous on mobile.
 */
export function SectionBar({
  title,
  summary,
  open,
  onToggle,
}: SectionBarProps) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      // Нейтральна група: назва, сума й текстовий стан розгортання.
      className="group w-full flex items-center justify-between gap-3 px-4 py-3 bg-panel border border-line rounded-lg mb-2 text-left  transition-[transform,box-shadow,border-color] hover:border-muted/40"
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
      <span className="inline-flex items-center gap-1 text-style-caption text-muted shrink-0 ml-2 group-hover:text-text transition-colors">
        <span>{open ? "Згорнути" : "Розгорнути"}</span>
      </span>
    </button>
  );
}
