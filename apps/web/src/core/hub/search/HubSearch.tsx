import { InlineAiRail } from "./InlineAiRail";
import { SearchInput } from "./SearchInput";
import { SearchResults } from "./SearchResults";
import { useSearchEngine } from "./useSearchEngine";

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
 */
export function HubSearch({ onClose, onOpenModule }: HubSearchProps) {
  const engine = useSearchEngine({ onClose, onOpenModule });

  const activeHit = engine.flat[engine.activeIdx];

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-bg safe-area-pt-pb page-enter"
      role="dialog"
      aria-modal="true"
      aria-label="Глобальний пошук"
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
