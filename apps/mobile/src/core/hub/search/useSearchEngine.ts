/**
 * State + side-effects for the mobile HubSearch screen.
 *
 * Mirror of `apps/web/src/core/hub/search/useSearchEngine.ts` minus the
 * web-only bits:
 *   - keyboard navigation lives on web (`document.addEventListener('keydown')`).
 *     Mobile users tap; we keep `flat` + `activeIdx` so the future
 *     external-keyboard / Bluetooth-keyboard story can wire up to it
 *     without reshaping the hook.
 *   - Routing is via Expo Router (`useRouter().push`) + `hrefForHit` instead
 *     of `react-router-dom`'s `useNavigate`.
 *   - Inline AI handoff calls `apiClient.chat.send` directly (see
 *     `useInlineAiRail.ts`), same single-shot semantics as web.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextInput as RNTextInput } from "react-native";
import { type Href, useRouter } from "expo-router";

import { hapticTap } from "@sergeant/shared";

import { hrefForHit } from "./hubSearchNav";
import {
  clearRecentQueries,
  getRecentQueries,
  pushRecentQuery,
} from "./hubSearchRecents";
import { performSearch } from "./searchSources";
import type { Hit } from "./searchTypes";
import { type UseInlineAiRailResult, useInlineAiRail } from "./useInlineAiRail";

export interface UseSearchEngineOptions {
  /** Close the search surface (e.g. pop the modal route). */
  onClose: () => void;
  /** Optional intercept for module hits — host can override the default route push. */
  onOpenModule?: (moduleId: string) => void;
  /** Auto-focus the input on mount. Defaults to true. */
  autoFocus?: boolean;
}

export interface UseSearchEngineResult {
  query: string;
  setQuery: (q: string) => void;
  results: Hit[];
  flat: Hit[];
  activeIdx: number;
  setActiveIdx: (idx: number | ((i: number) => number)) => void;
  recents: string[];
  inputRef: React.MutableRefObject<RNTextInput | null>;
  commitQuery: (q: string) => void;
  openHit: (hit: Hit) => void;
  pickRecent: (q: string) => void;
  clearRecents: () => void;
  inlineAi: UseInlineAiRailResult;
  /**
   * Escalate the rail prompt to the dedicated chat surface (mobile
   * does not yet ship `/chat` — the helper closes the launcher and is
   * a no-op until HubChat lands). Tracked in
   * `docs/mobile/react-native-migration.md` § Phase 2 Hub-core.
   */
  escalateToChat: (prompt: string) => void;
}

export function useSearchEngine({
  onClose,
  onOpenModule,
  autoFocus = true,
}: UseSearchEngineOptions): UseSearchEngineResult {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>(() => performSearch(""));
  const [activeIdx, setActiveIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => getRecentQueries());
  const inputRef = useRef<RNTextInput | null>(null);
  const router = useRouter();
  const inlineAi = useInlineAiRail();

  useEffect(() => {
    if (!autoFocus) return;
    // Defer the focus to the next tick so `<TextInput autoFocus>` and
    // this imperative `focus()` don't race when the screen mounts.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [autoFocus]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(performSearch(""));
      setActiveIdx(0);
      return;
    }
    const timer = setTimeout(() => {
      setResults(performSearch(query));
      setActiveIdx(0);
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  const flat = useMemo(() => {
    const order: Array<Hit["module"]> = [
      "actions",
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
      "settings",
      "assistant",
      "ai",
    ];
    return order.flatMap((m) => results.filter((r) => r.module === m));
  }, [results]);

  const commitQuery = useCallback((q: string) => {
    if (!q.trim()) return;
    const next = pushRecentQuery(q);
    setRecents(next);
  }, []);

  const escalateToChat = useCallback(
    (_prompt: string) => {
      // Mobile HubChat ships in a follow-up Phase-2 PR — drop the rail
      // and close the launcher so the user lands back on the dashboard.
      inlineAi.reset();
      onClose();
    },
    [inlineAi, onClose],
  );

  const openHit = useCallback(
    (hit: Hit) => {
      hapticTap();
      commitQuery(query);

      // Inline AI rail intercepts `ai-handoff` so the launcher stays
      // mounted; everything else navigates and closes.
      if (hit.target.kind === "ai-handoff") {
        void inlineAi.ask(hit.target.query);
        return;
      }

      if (hit.target.kind === "module" && onOpenModule) {
        onOpenModule(hit.target.moduleId);
        onClose();
        return;
      }

      const href = hrefForHit(hit);
      onClose();
      if (href) router.push(href as Href);
    },
    [commitQuery, inlineAi, onClose, onOpenModule, query, router],
  );

  const pickRecent = useCallback((q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  }, []);

  const clearRecents = useCallback(() => {
    clearRecentQueries();
    setRecents([]);
  }, []);

  return {
    query,
    setQuery,
    results,
    flat,
    activeIdx,
    setActiveIdx,
    recents,
    inputRef,
    commitQuery,
    openHit,
    pickRecent,
    clearRecents,
    inlineAi,
    escalateToChat,
  };
}
