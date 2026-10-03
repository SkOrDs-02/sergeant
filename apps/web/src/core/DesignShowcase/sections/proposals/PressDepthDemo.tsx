import { ComparePair, CompareTile } from "./_Compare";
import { Icon } from "@shared/components/ui";

/**
 * V-11 — Tactile press depth.
 *
 * Today cards use a flat `active:scale-[0.98]` (see `.press-effect` /
 * `panel-interactive`). The proposal adds a subtle *depth* on press — a slight
 * inset shadow + reduced elevation — so the card feels physically pushed in,
 * not just shrunk. Stays inside the elevation scale (no new shadows invented).
 *
 * Mock only — press-and-hold the right-hand card to feel the difference.
 */

export function PressDepthDemo() {
  return (
    <ComparePair
      before={
        <CompareTile dim>
          <button
            type="button"
            className="w-40 rounded-2xl bg-panel border border-line shadow-card p-4 flex items-center gap-3 transition-transform active:scale-[0.98]"
          >
            <span className="h-9 w-9 rounded-xl bg-finyk-soft text-finyk flex items-center justify-center">
              <Icon name="wallet" size={18} />
            </span>
            <span className="text-style-label text-text">Фінік</span>
          </button>
          <p className="text-style-caption text-muted">
            Лише scale, «пласке» натискання
          </p>
        </CompareTile>
      }
      after={
        <CompareTile>
          <button
            type="button"
            className="press-depth w-40 rounded-2xl bg-panel border border-line shadow-card p-4 flex items-center gap-3"
          >
            <span className="h-9 w-9 rounded-xl bg-finyk-soft text-finyk flex items-center justify-center">
              <Icon name="wallet" size={18} />
            </span>
            <span className="text-style-label text-text">Фінік</span>
          </button>
          <p className="text-style-caption text-muted">
            Scale + inset-тінь, картку «вдавлює»
          </p>
          <style>{`
            .press-depth {
              transition: transform 120ms ease, box-shadow 120ms ease;
            }
            .press-depth:active {
              transform: scale(0.97);
              box-shadow: inset 0 2px 6px rgb(0 0 0 / 0.18);
            }
            @media (prefers-reduced-motion: reduce) {
              .press-depth { transition: none; }
            }
          `}</style>
        </CompareTile>
      }
    />
  );
}
