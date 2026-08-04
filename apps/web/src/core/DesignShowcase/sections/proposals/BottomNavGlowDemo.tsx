import { useState } from "react";
import { ComparePair, CompareTile } from "./_Compare";
import { Icon } from "@shared/components/ui";
import { cn } from "@shared/lib/ui/cn";

/**
 * V-16 — Active-tab accent glow (dark).
 *
 * The bottom nav shell uses a flat `shadow-lg` and a solid highlight for the
 * active pill. In the Ink (dark) theme depth is built with *light*, so the
 * proposal adds a soft accent glow beneath the active tab — reinforcing which
 * tab is live and matching the design language ("glow-border, not drop-shadow"
 * in dark).
 *
 * This demo is always previewed in the `.dark` scope (the effect only applies
 * to the Ink theme), so it uses semantic tokens under a forced-dark wrapper
 * rather than raw hex — the surrounding cards still follow the header toggle.
 *
 * Mock only — tap a tab to move the highlight.
 */

const TABS = [
  { id: "home", icon: "home", label: "Головна" },
  { id: "reports", icon: "trending-up", label: "Звіти" },
  { id: "profile", icon: "target", label: "Профіль" },
] as const;

export function BottomNavGlowDemo() {
  const [active, setActive] = useState(0);

  return (
    <ComparePair
      before={
        <CompareTile dim className="dark justify-end bg-bg">
          <MockNav active={active} onSelect={setActive} glow={false} />
          <p className="text-style-caption text-muted">
            Пласка тінь — активний таб рівний
          </p>
        </CompareTile>
      }
      after={
        <CompareTile className="dark justify-end bg-bg">
          <MockNav active={active} onSelect={setActive} glow />
          <p className="text-style-caption text-muted">
            Акцент-glow під активним табом
          </p>
        </CompareTile>
      }
    />
  );
}

function MockNav({
  active,
  onSelect,
  glow,
}: {
  active: number;
  onSelect: (i: number) => void;
  glow: boolean;
}) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-line bg-panel p-1.5 shadow-lg">
      {TABS.map((t, i) => {
        const on = i === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              "relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors",
              on ? "text-accent" : "text-muted",
            )}
          >
            {on && glow && (
              <span
                aria-hidden
                className="absolute -inset-x-1 -bottom-1 top-0 rounded-xl blur-md bg-accent/35"
              />
            )}
            <Icon name={t.icon} size={18} className="relative" />
            <span className="relative text-style-caption">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
