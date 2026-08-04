import { useState } from "react";
import { ComparePair, MiniPhone } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * UX-17 — Clipboard-paste → suggested action.
 *
 * Зараз: opening quick-add always lands on an empty form; if you copied an
 * amount elsewhere you retype it by hand. (The one existing use of
 * clipboard.readText is the Mono-token paste on the Finyk login — there is
 * no general "paste → create record" flow.)
 *
 * Може бути: when the clipboard holds a number or a link, the sheet surfaces
 * a one-tap suggestion chip ("Вставити 250 як витрату?"). Tap it on the
 * right to see the amount fill in.
 */

export function ClipboardActionDemo() {
  const [filled, setFilled] = useState(false);

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-2">
            <div className="text-style-label text-text mb-2">Нова витрата</div>
            <div className="rounded-xl border border-line bg-panel px-3 py-2.5 text-style-title text-muted tabular-nums">
              0 ₴
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-line px-3 py-6 text-center">
              <span className="text-style-caption text-muted">
                Порожня форма — вводь вручну
              </span>
            </div>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-2">
            <div className="text-style-label text-text mb-2">Нова витрата</div>

            {/* paste suggestion chip */}
            {!filled && (
              <button
                type="button"
                onClick={() => setFilled(true)}
                className="mb-2 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-left active:scale-[0.99] transition-transform"
              >
                <span className="shrink-0 h-7 w-7 rounded-full bg-accent/15 flex items-center justify-center">
                  <Icon name="clipboard" size={14} className="text-accent" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-style-caption text-text">
                    У буфері: <span className="tabular-nums">250</span>
                  </span>
                  <span className="block text-style-caption text-accent">
                    Вставити як витрату?
                  </span>
                </span>
                <Icon name="plus" size={16} className="text-accent shrink-0" />
              </button>
            )}

            <div
              className={
                "rounded-xl border px-3 py-2.5 text-style-title tabular-nums transition-colors " +
                (filled
                  ? "border-accent/50 bg-accent/5 text-text"
                  : "border-line bg-panel text-muted")
              }
            >
              {filled ? "250 ₴" : "0 ₴"}
            </div>

            {filled && (
              <div className="mt-2 flex items-center gap-1.5 text-success">
                <Icon name="check-circle" size={13} />
                <span className="text-style-caption">Заповнено з буфера</span>
              </div>
            )}
          </div>
        </MiniPhone>
      }
    />
  );
}
