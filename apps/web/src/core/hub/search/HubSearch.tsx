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
  const {
    inputRef,
    listRef,
    query,
    setQuery,
    results,
    flat,
    activeIdx,
    setActiveIdx,
    recents,
    openHit,
    pickRecent,
    clearRecents,
    commitQuery,
    inlineAi,
    escalateToChat,
  } = useSearchEngine({ onClose, onOpenModule });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(true, panelRef, { inertBackground: true });

  const activeHit = flat[activeIdx];

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-200 flex flex-col bg-bg safe-area-pt-pb page-enter"
      role="dialog"
      aria-modal="true"
      aria-label={messages.nav.globalSearch}
    >
      <SearchInput
        ref={inputRef}
        query={query}
        onQueryChange={setQuery}
        onClose={onClose}
        listId="hub-search-results"
        expanded={flat.length > 0}
        activeId={activeHit ? `hub-hit-${activeHit.id}` : undefined}
      />

      <InlineAiRail
        state={inlineAi.state}
        onRetry={(q) => void inlineAi.ask(q)}
        onCancel={inlineAi.cancel}
        onOpenInChat={escalateToChat}
        onDismiss={inlineAi.reset}
      />

      <SearchResults
        ref={listRef}
        query={query}
        results={results}
        flat={flat}
        activeIdx={activeIdx}
        recents={recents}
        onActivate={openHit}
        onHover={(idx) => setActiveIdx(idx)}
        onPickRecent={pickRecent}
        onClearRecents={clearRecents}
        onCommitQuery={commitQuery}
        onOpenModule={onOpenModule}
        onClose={onClose}
      />
    </div>
  );
}
