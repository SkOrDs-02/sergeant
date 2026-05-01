import { Icon } from "@shared/components/ui/Icon";
import { hapticTap } from "@shared/lib/haptic";

export interface AnswerRailProps {
  /** Current launcher query — drives the CTA copy. */
  query: string;
  /** Open the chat page with `query` prefilled and close the search overlay. */
  onAskAssistant: (query: string) => void;
}

/**
 * @scaffolded
 * @addedIn 2026-05-01
 * @owner @Skords-01
 *
 * Inline rail under SearchResults inside HubSearch. For any non-empty
 * query the user gets a single low-friction escape-hatch into the
 * full chat: prefill the prompt, navigate to `/chat`. Replaces the
 * previous behaviour where the launcher emitted `openChat` and the
 * fullscreen modal slammed over the dashboard.
 *
 * Real inline streaming answers (1-2 cards rendered next to the rail)
 * is the next step — this scaffold gives us the surface and the
 * "open in chat" CTA without owning the streaming pipeline yet.
 */
export function AnswerRail({ query, onAskAssistant }: AnswerRailProps) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;

  const preview =
    trimmed.length > 80 ? `${trimmed.slice(0, 77).trimEnd()}…` : trimmed;

  return (
    <div className="shrink-0 px-4 pb-3 pt-1">
      <div className="rounded-2xl border border-line bg-panelHi/50 p-3 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0"
          aria-hidden
        >
          <Icon name="sparkle" size={18} className="text-brand-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-text leading-snug truncate">
            Запитати асистента
          </div>
          <div className="text-2xs text-muted mt-0.5 truncate">«{preview}»</div>
        </div>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            onAskAssistant(trimmed);
          }}
          className="shrink-0 inline-flex items-center gap-1.5 h-11 [@media(pointer:coarse)]:min-h-[44px] px-3.5 rounded-xl bg-brand-strong text-white text-xs font-semibold hover:bg-brand-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          aria-label={`Відкрити в чаті: ${preview}`}
        >
          Відкрити в чаті
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
    </div>
  );
}
