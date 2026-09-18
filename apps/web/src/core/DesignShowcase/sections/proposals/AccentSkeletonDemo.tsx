import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { moduleAccentRgb } from "@sergeant/design-tokens/tokens";
import { ComparePair, MiniPhone } from "./_Compare";

const MODULES = [
  { key: "finyk", label: "Фінік", rgb: moduleAccentRgb.finyk.default },
  {
    key: "nutrition",
    label: "Харчування",
    rgb: moduleAccentRgb.nutrition.default,
  },
  { key: "fizruk", label: "Фізрук", rgb: moduleAccentRgb.fizruk.default },
] as const;

/**
 * R2-V-9 — Акцент-aware skeleton.
 *
 * Зараз: shimmer монохромний — завантаження виглядає однаково скрізь.
 * Може бути: плейсхолдери підбирають hue активного модуля, тож стан
 * завантаження вже «на бренді» секції.
 *
 * Перемкни модуль — ліва панель лишається сірою, права тінтується.
 */
function SkeletonRows({ rgb }: { rgb: string | null }) {
  const bg = (a: number) =>
    rgb ? `rgb(${rgb}/${a})` : `rgb(var(--c-muted)/${a})`;
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-full"
            style={{ background: bg(0.18) }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 w-2/3 overflow-hidden rounded-full"
              style={{ background: bg(0.14) }}
            >
              <div
                className="h-full w-1/3 animate-[r2-shimmer_1.4s_infinite]"
                style={{ background: bg(0.35) }}
              />
            </div>
            <div
              className="h-3 w-1/3 rounded-full"
              style={{ background: bg(0.1) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccentSkeletonDemo() {
  const [active, setActive] = useState(0);
  const current = MODULES[active] ?? MODULES[0];

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <MiniPhone dim>
            <SkeletonRows rgb={null} />
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <SkeletonRows rgb={current.rgb} />
          </MiniPhone>
        }
      />
      <div className="flex gap-1 rounded-full bg-surface-muted p-1">
        {MODULES.map((m, i) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-medium transition-colors",
              i === active ? "text-bg" : "text-muted",
            )}
            style={i === active ? { background: `rgb(${m.rgb})` } : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>
      <style>{`@keyframes r2-shimmer { from { transform: translateX(-100%); } to { transform: translateX(400%); } }`}</style>
    </div>
  );
}
