import { useState } from "react";
import { ComparePair, MiniPhone } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * UX-15 — Batch quick-entry ("keep open" toggle).
 *
 * Зараз: the quick-add sheet closes after every save, so logging three
 * expenses in a row means reopening the sheet three times.
 *
 * Може бути: a "Залишити відкритим" toggle keeps the sheet up after save,
 * clears the field, shows a running "Додано N" count and lets you fire
 * entries one after another. Interactive on the right — press "Додати".
 */

function Keypad() {
  return (
    <div className="grid grid-cols-3 gap-1.5 px-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
        <div
          key={k}
          className="h-9 rounded-xl bg-panel border border-line flex items-center justify-center text-style-body text-text"
        >
          {k}
        </div>
      ))}
    </div>
  );
}

function SheetShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* dimmed backdrop hint */}
      <div className="flex-1 min-h-0" />
      <div className="rounded-t-2xl border-t border-line bg-panelHi pt-2 pb-3">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
        {children}
      </div>
    </>
  );
}

export function BatchEntryDemo() {
  const [count, setCount] = useState(0);
  const [amount, setAmount] = useState("120");

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <SheetShell>
            <div className="px-3 mb-2">
              <div className="text-style-label text-text mb-1">
                Нова витрата
              </div>
              <div className="rounded-xl border border-line bg-panel px-3 py-2 text-style-title text-text tabular-nums">
                120 ₴
              </div>
            </div>
            <Keypad />
            <div className="px-3 mt-2">
              <div className="h-10 rounded-xl bg-accent text-bg flex items-center justify-center text-style-label font-semibold">
                Зберегти
              </div>
            </div>
            <p className="text-2xs text-muted text-center px-4 pt-2">
              Шторка закриється — відкривай знову для наступної
            </p>
          </SheetShell>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <SheetShell>
            <div className="px-3 mb-2 flex items-center justify-between">
              <div className="text-style-label text-text">Нова витрата</div>
              {count > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-2xs font-medium">
                  <Icon name="check-circle" size={11} />
                  Додано {count}
                </span>
              )}
            </div>
            <div className="px-3 mb-2">
              <div className="rounded-xl border border-line bg-panel px-3 py-2 text-style-title text-text tabular-nums">
                {amount} ₴
              </div>
            </div>
            <Keypad />
            {/* keep-open toggle */}
            <div className="px-3 mt-2 flex items-center justify-between">
              <span className="text-style-caption text-muted">
                Залишити відкритим
              </span>
              <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-accent">
                <span className="absolute right-0.5 h-4 w-4 rounded-full bg-bg" />
              </span>
            </div>
            <div className="px-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setCount((c) => c + 1);
                  setAmount(String(60 + Math.floor(Math.random() * 400)));
                }}
                className="w-full h-10 rounded-xl bg-accent text-bg flex items-center justify-center gap-1.5 text-style-label font-semibold active:scale-[0.98] transition-transform"
              >
                <Icon name="plus" size={16} />
                Додати ще
              </button>
            </div>
          </SheetShell>
        </MiniPhone>
      }
    />
  );
}
