import { useState } from "react";
import { moduleAccentRgb } from "@sergeant/design-tokens/tokens";
import { PhoneFrame } from "./_PhoneFrame";

const MODULES = [
  { key: "finyk", label: "Фінік", rgb: moduleAccentRgb.finyk.default },
  { key: "nutrition", label: "Харчування", rgb: moduleAccentRgb.nutrition.default },
  { key: "fizruk", label: "Фізрук", rgb: moduleAccentRgb.fizruk.default },
];

/**
 * R2-V-9 — Акцент-aware skeleton.
 * Наявний shimmer монохромний. Тут плейсхолдери підбирають hue активного
 * модуля, тож завантаження вже «на бренді» секції.
 */
export function AccentSkeletonDemo() {
  const [active, setActive] = useState(0);
  const current = MODULES[active] ?? MODULES[0]!;
  const rgb = current.rgb;

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label={`Skeleton · ${current.label}`}>
        <div className="flex h-full flex-col gap-3 p-4" style={{ ["--sk" as string]: `rgb(${rgb})` }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="h-10 w-10 shrink-0 rounded-full"
                style={{ background: `rgb(${rgb}/0.18)` }}
              />
              <div className="flex-1 space-y-2">
                <div
                  className="h-3 w-2/3 overflow-hidden rounded-full"
                  style={{ background: `rgb(${rgb}/0.14)` }}
                >
                  <div className="h-full w-1/3 animate-[r2-shimmer_1.4s_infinite]" style={{ background: `rgb(${rgb}/0.35)` }} />
                </div>
                <div className="h-3 w-1/3 rounded-full" style={{ background: `rgb(${rgb}/0.1)` }} />
              </div>
            </div>
          ))}
        </div>
      </PhoneFrame>

      <div className="flex gap-1 rounded-full bg-elevated p-1">
        {MODULES.map((m, i) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActive(i)}
            className={`h-8 flex-1 rounded-full text-xs font-medium transition-colors ${
              i === active ? "text-on-accent" : "text-muted"
            }`}
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
