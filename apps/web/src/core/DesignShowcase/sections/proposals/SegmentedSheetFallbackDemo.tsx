import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { PhoneFrame, ProposalCard } from "./_PhoneFrame";

/**
 * R2-UI-9 — Segmented → bottom-sheet fallback.
 *
 * A segmented control works for ≤4 options on a narrow screen. Beyond that
 * the segments get cramped and labels truncate. The proposal: when options
 * exceed the fit threshold, collapse the control into a single "selector"
 * row that opens a bottom sheet of full-width, comfortably tappable choices.
 *
 * Mock only — tap the selector to open the sheet, pick a category.
 */

const CATEGORIES = [
  "Їжа", "Транспорт", "Житло", "Здоровʼя", "Розваги", "Одяг", "Підписки", "Інше",
];

export function SegmentedSheetFallbackDemo() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(CATEGORIES[0]!);

  return (
    <ProposalCard
      id="R2-UI-9"
      title="Segmented → шторка, коли опцій > 4"
      intent="Коли варіантів забагато для рядка, контрол згортається в селектор, що відкриває шторку з великими цілями. Тапни селектор."
    >
      <PhoneFrame>
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div className="px-4 pt-2 space-y-3">
            <p className="text-style-caption text-muted">Категорія витрати</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full h-12 rounded-2xl border border-line bg-panel px-4 flex items-center justify-between"
            >
              <span className="text-style-body text-text">{value}</span>
              <Icon name="chevron-down" size={18} className="text-muted" />
            </button>
            <p className="text-2xs text-muted">
              8 категорій не вміщаються в segmented — тому селектор + шторка.
            </p>
          </div>

          {/* scrim */}
          <div
            className={cn(
              "absolute inset-0 z-10 bg-black/30 transition-opacity",
              open ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            onClick={() => setOpen(false)}
          />
          {/* bottom sheet */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-panelHi border-t border-line p-4",
              "transition-transform duration-300",
              open ? "translate-y-0" : "translate-y-full",
            )}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-line mb-3" />
            <p className="text-style-label text-text mb-2">Оберіть категорію</p>
            <div className="space-y-1">
              {CATEGORIES.map((c) => {
                const sel = c === value;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setValue(c); setOpen(false); }}
                    className={cn(
                      "w-full h-12 rounded-2xl px-4 flex items-center justify-between border",
                      sel ? "bg-accent/10 border-accent/40 text-accent" : "bg-panel border-line text-text",
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
      </PhoneFrame>
    </ProposalCard>
  );
}
