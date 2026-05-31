import { useRef } from "react";
import { InlineAiRail } from "./InlineAiRail";
import { SearchInput } from "./SearchInput";
import { SearchResults } from "./SearchResults";
import { useSearchEngine } from "./useSearchEngine";
import { messages } from "@shared/i18n/uk";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";

export interface HubSearchProps {
  onClose: () => void;
  onOpenModule: (moduleId: string) => void;
}

/**
 * Global ⌘K palette shell. Composes:
 *   - {@link useSearchEngine} for query/results/keyboard state
 *   - {@link SearchInput} for the top input bar
 *   - {@link InlineAiRail} for the single-shot AI answer rail that
 *     replaces the previous fullscreen `HubChat` handoff for
 *     `ai-handoff` hits
 *   - {@link SearchResults} for the grouped result list + empty/recents states
 *
 * The shell owns nothing beyond the dialog overlay and wiring; the
 * heavy work lives in `searchSources` (per-module localStorage parsers
 * and scoring).
 *
 * Focus is contained via `useDialogFocusTrap` so Tab/Shift-Tab cycle
 * within the palette (WCAG 2.4.3, audit 03 § F10). Escape closure stays
 * with `useSearchEngine`'s document-level handler — passing `onEscape`
 * here would call `onClose` twice on every Esc.
 */
export function HubSearch({ onClose, onOpenModule }: HubSearchProps) {
  const engine = useSearchEngine({ onClose, onOpenModule });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(true, panelRef);

  const activeHit = engine.flat[engine.activeIdx];

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-200 flex flex-col bg-bg safe-area-pt-pb page-enter"
      role="dialog"
      aria-modal="true"
      aria-label={messages.nav.globalSearch}
    >
      <SearchInput
        ref={engine.inputRef}
        query={engine.query}
        onQueryChange={engine.setQuery}
        onClose={onClose}
        listId="hub-search-results"
        expanded={engine.flat.length > 0}
        activeId={activeHit ? `hub-hit-${activeHit.id}` : undefined}
      />

      <InlineAiRail
        state={engine.inlineAi.state}
        onRetry={(q) => void engine.inlineAi.ask(q)}
        onCancel={engine.inlineAi.cancel}
        onOpenInChat={engine.escalateToChat}
        onDismiss={engine.inlineAi.reset}
      />

      <SearchResults
        ref={engine.listRef}
        query={engine.query}
        results={engine.results}
        flat={engine.flat}
        activeIdx={engine.activeIdx}
        recents={engine.recents}
        onActivate={engine.openHit}
        onHover={(idx) => engine.setActiveIdx(idx)}
        onPickRecent={engine.pickRecent}
        onClearRecents={engine.clearRecents}
        onCommitQuery={engine.commitQuery}
        onOpenModule={onOpenModule}
        onClose={onClose}
      />
    </div>
  );
}
