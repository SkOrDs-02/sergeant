import { useState } from "react";
import { WheelPicker } from "@shared/components/ui/WheelPicker";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-18 — Inline value-picker wheel (iOS-style).
 *
 * Зараз: quantities are typed into a numeric field that pops the OS numpad,
 * covering half the screen for a value that's usually one of a few presets.
 * Може бути: a scroll-snap wheel keeps everything on-screen — the centre row
 * is the selected value, neighbours dim with distance, snap points settle it.
 *
 * SHIPPED: `WheelPicker` (@shared/components/ui/WheelPicker) — the «after»
 * column renders the real component, not a mock. Mock only lives in the
 * «before» column (fake OS numpad).
 *
 * Mock only — scroll the wheel on the right; the centred value is selected.
 */

const VALUES = Array.from({ length: 21 }, (_, i) => i * 25); // 0..500 g

export function WheelPickerDemo() {
  const [value, setValue] = useState(150);

  return (
    <ProposalCard
      id="R2-UI-18"
      title="Колесо вибору значення (iOS-style)"
      intent="Зараз ввід порції відкриває системний numpad на пів екрана; у пропозиції колесо просто на місці. Крути колесо праворуч."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-start pt-6 gap-4">
                <p className="text-style-caption text-muted">Порція</p>
                <div className="w-40 h-12 rounded-xl border border-accent/50 bg-panel flex items-center px-3">
                  <span className="text-xl tabular-nums text-text">150</span>
                  <span className="ml-1 text-muted text-style-caption">г</span>
                  <span className="ml-auto h-5 w-px bg-accent animate-pulse" />
                </div>
              </div>
              {/* fake OS numpad covering lower half */}
              <div className="mt-auto grid grid-cols-3 gap-px bg-line border-t border-line">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  ".",
                  "0",
                  "⌫",
                ].map((k) => (
                  <div
                    key={k}
                    className="h-9 bg-panelHi flex items-center justify-center text-style-caption text-text"
                  >
                    {k}
                  </div>
                ))}
              </div>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
              <p className="text-style-caption text-muted">Порція</p>
              <div className="w-40">
                <WheelPicker
                  values={VALUES}
                  value={value}
                  onChange={setValue}
                  aria-label="Порція, грам"
                  unit="г"
                />
              </div>
              <p className="text-style-caption text-muted">
                Обрано: {value} г · без numpad
              </p>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
