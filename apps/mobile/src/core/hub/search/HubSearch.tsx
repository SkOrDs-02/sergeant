/**
 * Sergeant Hub — global search (mobile).
 *
 * Mobile mirror of `apps/web/src/core/hub/search/HubSearch.tsx`.
 *
 * Composes:
 *   - {@link useSearchEngine} for query/results state
 *   - {@link SearchInput} for the top input bar
 *   - {@link InlineAiRail} for the single-shot AI answer rail
 *   - {@link SearchResults} for the grouped result list + empty/recents
 *
 * The shell owns nothing beyond the layout and wiring; the heavy work
 * lives in `searchSources` (per-module MMKV parsers + scoring) and
 * `useSearchEngine` (query state + routing).
 */

import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InlineAiRail } from "./InlineAiRail";
import { SearchInput } from "./SearchInput";
import { SearchResults } from "./SearchResults";
import { useSearchEngine } from "./useSearchEngine";

export interface HubSearchProps {
  /** Pop the search screen / close the host modal. */
  onClose: () => void;
  /**
   * Override module hit routing — host can intercept (e.g. analytics)
   * before letting the engine push the module's root href. Defaults to
   * the engine's built-in `router.push` via `hrefForHit`.
   */
  onOpenModule?: (moduleId: string) => void;
}

export function HubSearch({ onClose, onOpenModule }: HubSearchProps) {
  const engine = useSearchEngine({ onClose, onOpenModule });

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      className="flex-1 bg-bg"
      testID="hub-search-screen"
    >
      <View className="flex-1">
        <SearchInput
          ref={engine.inputRef}
          query={engine.query}
          onQueryChange={engine.setQuery}
          onClose={onClose}
        />

        <InlineAiRail
          state={engine.inlineAi.state}
          onRetry={(q) => void engine.inlineAi.ask(q)}
          onCancel={engine.inlineAi.cancel}
          onOpenInChat={engine.escalateToChat}
          onDismiss={engine.inlineAi.reset}
        />

        <SearchResults
          query={engine.query}
          results={engine.results}
          flat={engine.flat}
          activeIdx={engine.activeIdx}
          recents={engine.recents}
          onActivate={engine.openHit}
          onPickRecent={engine.pickRecent}
          onClearRecents={engine.clearRecents}
          onCommitQuery={engine.commitQuery}
          onOpenModule={(moduleId) => {
            if (onOpenModule) onOpenModule(moduleId);
          }}
          onClose={onClose}
        />
      </View>
    </SafeAreaView>
  );
}
