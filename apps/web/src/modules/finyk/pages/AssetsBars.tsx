import { Icon, type IconName } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";

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
  return (
    <div className="mt-4">
      <div
        className="relative flex h-2 w-full overflow-hidden rounded-full bg-finyk/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
        role="img"
        aria-label={`Активи ${assetsPct}% · Пасиви ${liabilitiesPct}%`}
      >
        <div
          className="bg-gradient-to-r from-finyk to-finyk-strong"
          style={{ width: `${assetsPct}%` }}
        />
        <div
          className="bg-gradient-to-r from-danger to-danger-strong"
          style={{ width: `${liabilitiesPct}%` }}
        />
      </div>
      <div className="flex justify-between text-meta text-muted mt-2 tabular-nums">
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
    </div>
  );
}

export type QuickActionTone = "finyk" | "success" | "danger";

const QUICK_TONE_BORDER: Record<QuickActionTone, string> = {
  finyk: "hover:border-finyk/40",
  success: "hover:border-success/40",
  danger: "hover:border-danger/40",
};

/**
 * CTA used in the 3-button quick-action row above the sections. Each
 * button collapses the "expand → scroll → tap +" flow into a single tap
 * that opens the relevant section *and* reveals its inline form.
 */
export function QuickActionButton({
  iconName,
  label,
  onClick,
  tone = "finyk",
}: {
  iconName: IconName;
  label: string;
  onClick: () => void;
  tone?: QuickActionTone;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center gap-1.5 py-3 px-2 text-xs bg-panelHi border border-line rounded-2xl shadow-soft transition-[transform,box-shadow,border-color] hover:shadow-card hover:-translate-y-px active:translate-y-0",
        QUICK_TONE_BORDER[tone],
      )}
    >
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
          TONE_BG[tone],
          TONE_TEXT[tone],
        )}
        aria-hidden
      >
        <Icon name={iconName} size={16} />
      </span>
      <span className="font-medium text-text">+ {label}</span>
    </button>
  );
}

export type SectionBarProps = {
  title: string;
  iconName: IconName;
  iconTone?: "success" | "danger" | "muted" | "finyk";
  summary?: string | null;
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
          <div className="text-sm font-bold text-text truncate">{title}</div>
          {summary && (
            <div className="text-xs text-muted mt-0.5 truncate tabular-nums">
              {summary}
            </div>
          )}
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-muted shrink-0 ml-2 group-hover:text-text transition-colors">
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
