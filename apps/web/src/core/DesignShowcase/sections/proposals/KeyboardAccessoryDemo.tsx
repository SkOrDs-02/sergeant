import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * UI-15 — Keyboard accessory bar above the numeric keypad.
 *
 * When entering an amount, a thin bar sits above the keyboard with quick
 * increments (+10 / +100 / +500), a «.00» helper and «Готово». Critical for
 * fast money entry on mobile. Here the keypad is mocked so the accessory row
 * is visible without a real OS keyboard.
 */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

export function KeyboardAccessoryDemo() {
  const [value, setValue] = useState("120");

  function press(k: string) {
    setValue((v) => {
      if (k === "⌫") return v.slice(0, -1);
      if (k === "." && v.includes(".")) return v;
      return v + k;
    });
  }
  function add(n: number) {
    setValue((v) => String((parseFloat(v || "0") + n).toFixed(0)));
  }

  return (
    <ProposalCard
      id="UI-15"
      title="Accessory-bar над цифровою клавіатурою"
      intent="Швидкі +10 / +100 / +500, «.00» та «Готово» просто над клавіатурою під час вводу суми."
    >
      <PhoneFrame>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pt-2 flex-1 flex flex-col items-center justify-center">
            <span className="text-2xs uppercase tracking-wide text-subtle">
              Сума витрати
            </span>
            <div className="mt-1 text-style-display text-text tabular-nums">
              {value || "0"}
              <span className="text-muted"> ₴</span>
            </div>
          </div>

          {/* accessory bar */}
          <div className="flex items-center gap-1.5 px-2 py-2 bg-panelHi border-t border-line overflow-x-auto no-scrollbar">
            {[10, 100, 500].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => add(n)}
                className="shrink-0 h-9 px-3 rounded-xl bg-panel border border-line text-style-caption text-text tabular-nums"
              >
                +{n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setValue((v) => (v.includes(".") ? v : v + ".00"))}
              className="shrink-0 h-9 px-3 rounded-xl bg-panel border border-line text-style-caption text-text"
            >
              .00
            </button>
            <button
              type="button"
              className="shrink-0 h-9 px-4 ml-auto rounded-xl bg-accent text-bg text-style-caption font-semibold"
            >
              Готово
            </button>
          </div>

          {/* mock keypad */}
          <div className="grid grid-cols-3 gap-px bg-line">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className={cn(
                  "h-11 bg-bg text-style-title text-text",
                  "active:bg-panelHi",
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </PhoneFrame>
    </ProposalCard>
  );
}
