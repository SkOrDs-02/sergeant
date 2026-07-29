import { useState } from "react";
import { ComparePair, CompareTile } from "./_Compare";
import { Icon } from "@shared/components/ui";
import { cn } from "@shared/lib/ui/cn";

/**
 * V-4 — Module-accent morph on navigation.
 *
 * The per-module accent *system* already exists (`[data-module-accent]` drives
 * border / ring / caret from `--module-accent-rgb`). What's missing is a
 * transition: today the accent swaps instantly when you move between modules.
 * The proposal crossfades the accent (emerald → cyan → coral …) so navigating
 * feels like one continuous surface re-tinting, not a hard cut.
 *
 * Mock only — tap the module chips to compare instant swap vs morph.
 */

const MODULES = [
  { id: "finyk", label: "Фінік", icon: "wallet", token: "--c-chart-finyk" },
  {
    id: "fizruk",
    label: "Фізрук",
    icon: "dumbbell",
    token: "--c-chart-fizruk",
  },
  {
    id: "routine",
    label: "Рутина",
    icon: "repeat",
    token: "--c-chart-routine",
  },
  {
    id: "nutrition",
    label: "Їжа",
    icon: "utensils",
    token: "--c-chart-nutrition",
  },
] as const;

export function AccentMorphDemo() {
  const [active, setActive] = useState(0);
  const mod = MODULES[active]!;
  const color = `rgb(var(${mod.token}))`;

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <CompareTile dim>
            <AccentCard mod={mod} color={color} morph={false} />
            <p className="text-2xs text-muted">Акцент міняється миттєво</p>
          </CompareTile>
        }
        after={
          <CompareTile>
            <AccentCard mod={mod} color={color} morph />
            <p className="text-2xs text-muted">Акцент плавно перетікає</p>
          </CompareTile>
        }
      />
      <div className="flex items-center gap-1.5">
        {MODULES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "px-2.5 py-1 rounded-full text-2xs border transition-colors",
              i === active
                ? "text-bg border-transparent"
                : "bg-surface-muted text-muted border-line",
            )}
            style={
              i === active
                ? { backgroundColor: `rgb(var(${m.token}))` }
                : undefined
            }
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AccentCard({
  mod,
  color,
  morph,
}: {
  mod: (typeof MODULES)[number];
  color: string;
  morph: boolean;
}) {
  return (
    <div
      className={cn(
        "w-40 rounded-2xl border-2 bg-panel p-4 flex flex-col items-center gap-2",
        morph &&
          "transition-[border-color,background-color,color] duration-500",
      )}
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      <span
        className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center",
          morph && "transition-colors duration-500",
        )}
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
        }}
      >
        <Icon name={mod.icon} size={20} />
      </span>
      <span
        className={cn(
          "text-style-label",
          morph && "transition-colors duration-500",
        )}
        style={{ color }}
      >
        {mod.label}
      </span>
    </div>
  );
}
