import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ProposalCard } from "./_PhoneFrame";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UI-9 — Segmented → bottom-sheet fallback.
 *
 * Зараз: a segmented control tries to fit all 8 categories in one row —
 * segments get cramped and labels truncate on a narrow screen.
 * Може бути: past the fit threshold the control collapses into a single
 * "selector" row that opens a bottom sheet of full-width, comfortably
 * tappable choices.
 *
 * Mock only — tap the selector on the right to open the sheet.
 */

const CATEGORIES = [
  "Їжа",
  "Транспорт",
  "Житло",
  "Здоровʼя",
  "Розваги",
  "Одяг",
  "Підписки",
  "Інше",
];

export function SegmentedSheetFallbackDemo() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(CATEGORIES[0]!);

  return (
    <ProposalCard
      id="R2-UI-9"
      title="Segmented → шторка, коли опцій > 4"
      intent="Зараз 8 категорій тиснуться в один рядок і обрізаються; у пропозиції — селектор + шторка з великими цілями. Тапни селектор праворуч."
    >
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 px-3 pt-2">
              <p className="text-style-caption text-muted mb-2">
                Категорія витрати
              </p>
              <div className="flex gap-0.5 rounded-xl border border-line bg-panel p-0.5 overflow-hidden">
                {CATEGORIES.slice(0, 5).map((c, i) => (
                  <span
                    key={c}
                    className={cn(
                      "flex-1 min-w-0 h-8 rounded-lg flex items-center justify-center px-0.5",
                      i === 0 ? "bg-accent/15 text-accent" : "text-muted",
                    )}
                  >
                    <span className="text-[9px] truncate">{c}</span>
                  </span>
                ))}
                <span className="h-8 px-1 flex items-center text-2xs text-muted">
                  …
                </span>
              </div>
              <p className="text-2xs text-muted mt-3">
                Мітки обрізані, дрібні цілі, ще 3 не влізли.
              </p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div className="px-3 pt-2 space-y-3">
                <p className="text-style-caption text-muted">
                  Категорія витрати
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="w-full h-12 rounded-2xl border border-line bg-panel px-4 flex items-center justify-between"
                >
                  <span className="text-style-body text-text">{value}</span>
                  <Icon name="chevron-down" size={18} className="text-muted" />
                </button>
                <p className="text-2xs text-muted">
                  Один селектор → шторка з усіма 8.
                </p>
              </div>

              <button
                type="button"
                aria-label="Закрити вибір категорії"
                className={cn(
                  "absolute inset-0 z-10 bg-black/30 transition-opacity",
                  open ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
                onClick={() => setOpen(false)}
              />
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-panelHi border-t border-line p-4",
                  "transition-transform duration-300 max-h-[85%] overflow-y-auto no-scrollbar",
                  open ? "translate-y-0" : "translate-y-full",
                )}
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-line mb-3" />
                <p className="text-style-label text-text mb-2">
                  Оберіть категорію
                </p>
                <div className="space-y-1">
                  {CATEGORIES.map((c) => {
                    const sel = c === value;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setValue(c);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full h-12 rounded-2xl px-4 flex items-center justify-between border",
                          sel
                            ? "bg-accent/10 border-accent/40 text-accent"
                            : "bg-panel border-line text-text",
                        )}
                      >
                        <span className="text-style-body">{c}</span>
                        {sel ? <Icon name="check-circle" size={18} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </MiniPhone>
        }
      />
    </ProposalCard>
  );
}
