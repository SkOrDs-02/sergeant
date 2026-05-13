import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";
import {
  ONBOARDING_MODULE_DESCRIPTIONS,
  ONBOARDING_VIBE_ICONS,
  ONBOARDING_VIBE_TEASERS,
} from "@sergeant/shared";
import { ALL_MODULES } from "./vibePicks";

// ---------------------------------------------------------------------------
// Module-row data
// ---------------------------------------------------------------------------

const MODULE_ACTIVE_CLASSES: Record<
  string,
  { border: string; bg: string; icon: string; check: string }
> = {
  finyk: {
    border: "border-finyk/60",
    bg: "bg-finyk/8",
    icon: "bg-finyk/15 text-finyk",
    check: "bg-finyk-strong",
  },
  fizruk: {
    border: "border-fizruk/60",
    bg: "bg-fizruk/8",
    icon: "bg-fizruk/15 text-fizruk",
    check: "bg-fizruk-strong",
  },
  routine: {
    border: "border-routine/60",
    bg: "bg-routine/8",
    icon: "bg-routine/15 text-routine",
    check: "bg-routine-strong",
  },
  nutrition: {
    border: "border-nutrition/60",
    bg: "bg-nutrition/8",
    icon: "bg-nutrition/15 text-nutrition",
    check: "bg-nutrition-strong",
  },
};

export const MODULE_CARDS = ALL_MODULES.map((id) => ({
  id,
  icon: ONBOARDING_VIBE_ICONS[id],
  label: MODULE_LABELS[id],
  teaser: ONBOARDING_VIBE_TEASERS[id],
  description: ONBOARDING_MODULE_DESCRIPTIONS[id],
}));

export type ModuleCard = (typeof MODULE_CARDS)[number];

export function ModuleRow({
  card,
  active,
  expanded,
  onToggle,
}: {
  card: ModuleCard;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const activeClasses = MODULE_ACTIVE_CLASSES[card.id] ?? {
    border: "border-brand-500/60",
    bg: "bg-brand-500/8",
    icon: "bg-brand-500/15 text-brand-strong dark:text-brand",
    check: "bg-brand-strong",
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "relative w-full text-left rounded-2xl border transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
        expanded ? "p-3.5" : "p-3",
        active
          ? `${activeClasses.border} ${activeClasses.bg} shadow-card`
          : "border-line bg-panel hover:border-brand-500/30",
      )}
    >
      <span
        className={cn(
          "absolute top-2.5 right-2.5 w-5 h-5 rounded-full text-white flex items-center justify-center transition-opacity",
          active ? activeClasses.check : "bg-panelHi/0",
          active ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      >
        <Icon name="check" size={12} strokeWidth={3} />
      </span>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "shrink-0 rounded-xl flex items-center justify-center",
            expanded ? "w-10 h-10" : "w-9 h-9",
            active ? activeClasses.icon : "bg-panelHi text-muted",
          )}
          aria-hidden
        >
          <Icon name={card.icon} size={expanded ? 20 : 18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1 pr-7">
          <span className="block text-sm font-bold text-text leading-tight">
            {card.label}
          </span>
          {expanded ? (
            <>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                {card.description}
              </span>
              <span className="block text-meta text-subtle mt-1 leading-tight">
                {card.teaser}
              </span>
            </>
          ) : (
            <span className="block text-meta text-subtle mt-0.5 leading-tight">
              {card.teaser}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
