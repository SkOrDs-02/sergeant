import { useState } from "react";
import { ComparePair, MiniPhone } from "./_Compare";
import { Icon } from "@shared/components/ui";
import { cn } from "@shared/lib/ui/cn";

/**
 * V-3 — Dynamic theme-color.
 *
 * Today the PWA manifest ships a single static `theme_color` (#fdf9f3), so the
 * OS status-bar / title-bar stays the same cream regardless of context. The
 * proposal drives `<meta name="theme-color">` at runtime so the system chrome
 * adopts the active module's accent (with a smooth crossfade).
 *
 * Mock only: the coloured bar here stands in for the OS status bar; nothing
 * touches the real manifest or document meta.
 */

const MODULES = [
  { id: "finyk", label: "Фінік", icon: "wallet", bar: "#0d9488" },
  { id: "fizruk", label: "Фізрук", icon: "dumbbell", bar: "#0369a1" },
  { id: "nutrition", label: "Харчування", icon: "utensils", bar: "#b45309" },
] as const;

export function DynamicThemeColorDemo() {
  const [active, setActive] = useState(0);
  const mod = MODULES[active]!;

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div
            className="h-9 shrink-0 flex items-center justify-between px-4"
            style={{ backgroundColor: "#fdf9f3" }}
          >
            <span
              className="text-2xs font-semibold"
              style={{ color: "#1c1917" }}
            >
              9:41
            </span>
            <span className="text-2xs" style={{ color: "#1c1917" }}>
              PWA
            </span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
            <span className="text-style-caption text-muted">
              Статус-бар завжди кремовий
            </span>
            <span className="text-2xs text-subtle">theme_color: #fdf9f3</span>
          </div>
        </MiniPhone>
      }
      after={
        <div className="flex flex-col items-center gap-3">
          <MiniPhone>
            <div
              className="h-9 shrink-0 flex items-center justify-between px-4 transition-colors duration-500"
              style={{ backgroundColor: mod.bar }}
            >
              <span className="text-2xs font-semibold text-white">9:41</span>
              <span className="text-2xs text-white/90">{mod.label}</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
              <span
                className="h-11 w-11 rounded-2xl flex items-center justify-center transition-colors duration-500"
                style={{ backgroundColor: `${mod.bar}22`, color: mod.bar }}
              >
                <Icon name={mod.icon} size={22} />
              </span>
              <span className="text-style-caption text-text">{mod.label}</span>
              <span className="text-2xs text-subtle">
                theme-color = акцент модуля
              </span>
            </div>
          </MiniPhone>
          <div className="flex items-center gap-1.5">
            {MODULES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-2xs border transition-colors",
                  i === active
                    ? "text-white border-transparent"
                    : "bg-surface-muted text-muted border-line",
                )}
                style={i === active ? { backgroundColor: m.bar } : undefined}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
