import type { ReactNode } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { formatNumberUk } from "@sergeant/shared";

const TONE_TEXT: Record<"success" | "danger" | "muted" | "finyk", string> = {
  success: "text-success",
  danger: "text-danger",
  muted: "text-muted",
  finyk: "text-finyk-strong dark:text-finyk",
};

const TONE_BG: Record<"success" | "danger" | "muted" | "finyk", string> = {
  success: "bg-success/10",
  danger: "bg-danger/10",
  muted: "bg-panelHi",
  finyk: "bg-finyk/10",
};

/**
 * Single-row stacked bar that visualises the assets vs. liabilities split
 * inside the Networth header. Only rendered when the user has at least
 * one of each bucket — a lone bar would be misleading.
 */
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
        className="relative flex h-2 w-full overflow-hidden rounded-full bg-finyk/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
        role="img"
        aria-label={`Активи ${assetsPct}% · Пасиви ${liabilitiesPct}%`}
        aria-describedby={summaryId}
      >
        <div
          className="bg-linear-to-r from-finyk to-finyk-strong"
          style={{ width: `${assetsPct}%` }}
        />
        <div
          className="bg-linear-to-r from-danger to-danger-strong"
          style={{ width: `${liabilitiesPct}%` }}
        />
      </div>
      <div className="flex justify-between text-style-caption text-muted mt-2 tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-finyk-strong"
            aria-hidden
          />
          Активи {assetsPct}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-danger"
            aria-hidden
          />
          Пасиви {liabilitiesPct}%
        </span>
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

export type QuickActionTone = "finyk" | "success" | "danger";

/**
 * CTA used in the 3-button quick-action row above the sections. Each
 * button collapses the "expand → scroll → tap +" flow into a single tap
 * that opens the relevant section *and* reveals its inline form.
 *
 * Це звичайний `Button variant="soft"`, а не картка з іконкою в тонованому
 * квадраті: тайл за формою збігався з картками вмісту поруч, і око не
 * розрізняло «натисни» та «прочитай» (анти-слоп, атрактор icon-in-tinted-
 * square). Іконки немає навмисно: у трьох колонках підпис і є значенням.
 */
export function QuickActionButton({
  label,
  onClick,
  tone = "finyk",
}: {
  label: string;
  onClick: () => void;
  tone?: QuickActionTone;
}) {
  return (
    <Button
      variant="soft"
      tone={tone}
      size="md"
      onClick={onClick}
      className="w-full min-w-0 px-1"
    >
      <span className="truncate">+ {label}</span>
    </Button>
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
 * blocks. The trailing label switches between "Розкласти ↓" / "Згорнути ↑"
 * to make the affordance unambiguous on mobile.
 */
export function SectionBar({
  title,
  iconName,
  iconTone = "muted",
  summary,
  open,
  onToggle,
}: SectionBarProps) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="group w-full flex items-center justify-between gap-3 px-4 py-3 bg-panelHi border border-line rounded-2xl mb-2 text-left shadow-soft transition-[transform,box-shadow,border-color] hover:border-muted/40 hover:shadow-card hover:-translate-y-px active:translate-y-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
            TONE_BG[iconTone],
            TONE_TEXT[iconTone],
          )}
          aria-hidden
        >
          <Icon name={iconName} size={18} />
        </span>
        <div className="min-w-0">
          <div className="text-style-label text-text truncate">{title}</div>
          {summary && (
            <div className="text-style-caption text-muted mt-0.5 truncate tabular-nums">
              {summary}
            </div>
          )}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-style-caption text-muted shrink-0 ml-2 group-hover:text-text transition-colors">
        <span>{open ? "Згорнути" : "Розкласти"}</span>
        <Icon
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          aria-hidden
        />
      </span>
    </button>
  );
}
