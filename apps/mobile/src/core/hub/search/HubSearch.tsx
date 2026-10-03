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
  const {
    inputRef,
    query,
    setQuery,
    results,
    flat,
    activeIdx,
    recents,
    openHit,
    pickRecent,
    clearRecents,
    commitQuery,
    inlineAi,
    escalateToChat,
  } = useSearchEngine({ onClose, onOpenModule });

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      className="flex-1 bg-bg"
      testID="hub-search-screen"
    >
      <View className="flex-1">
        <SearchInput
          ref={inputRef}
          query={query}
          onQueryChange={setQuery}
          onClose={onClose}
        />

        <InlineAiRail
          state={inlineAi.state}
          onRetry={(q) => void inlineAi.ask(q)}
          onCancel={inlineAi.cancel}
          onOpenInChat={escalateToChat}
          onDismiss={inlineAi.reset}
        />

        <SearchResults
          query={query}
          results={results}
          flat={flat}
          activeIdx={activeIdx}
          recents={recents}
          onActivate={openHit}
          onPickRecent={pickRecent}
          onClearRecents={clearRecents}
          onCommitQuery={commitQuery}
          onOpenModule={(moduleId) => {
            if (onOpenModule) onOpenModule(moduleId);
          }}
          onClose={onClose}
        />
      </View>
    </SafeAreaView>
  );
}
