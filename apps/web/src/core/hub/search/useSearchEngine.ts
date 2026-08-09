import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import {
  announceSettingsHashChange,
  openHubModuleWithAction,
} from "@shared/lib/modules/hubNav";
import {
  clearRecentQueries,
  getRecentQueries,
  pushRecentQuery,
} from "../hubSearchEngine";
import { performSearch } from "./searchSources";
import type { Hit } from "./searchTypes";
import { type UseInlineAiRailResult, useInlineAiRail } from "./useInlineAiRail";

export interface UseSearchEngineOptions {
  onClose: () => void;
  onOpenModule: (moduleId: string) => void;
}

export interface UseSearchEngineResult {
  query: string;
  setQuery: (q: string) => void;
  results: Hit[];
  flat: Hit[];
  activeIdx: number;
  setActiveIdx: (idx: number | ((i: number) => number)) => void;
  recents: string[];
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  listRef: React.MutableRefObject<HTMLDivElement | null>;
  commitQuery: (q: string) => void;
  openHit: (hit: Hit) => void;
  pickRecent: (q: string) => void;
  clearRecents: () => void;
  /**
   * Single-shot AI rail state. `ai-handoff` hits resolve here instead
   * of dispatching the fullscreen chat overlay; the rail renders the
   * answer directly under SearchResults.
   */
  inlineAi: UseInlineAiRailResult;
  /**
   * Escalate the current rail prompt to the fullscreen chat surface
   * (e.g. user wants multi-turn / tool-call execution).
   */
  escalateToChat: (prompt: string) => void;
}

/**
 * State + side-effects for HubSearch:
 *   - query state with debounced (`startTransition`-wrapped) search
 *   - flat list ordered for keyboard navigation
 *   - recents persistence
 *   - keyboard navigation (↑/↓/Enter/Escape)
 *   - hit dispatch (module / settings / assistant capability)
 *
 * Kept as a hook so the shell stays focused on layout and the search
 * pipeline stays testable in isolation.
 */
export function useSearchEngine({
  onClose,
  onOpenModule,
}: UseSearchEngineOptions): UseSearchEngineResult {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => getRecentQueries());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const inlineAi = useInlineAiRail();
  const inlineAsk = inlineAi.ask;
  const inlineReset = inlineAi.reset;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = query.trim();
  const syncResults = useMemo(
    () => (trimmed.length < 2 ? performSearch("") : null),
    [trimmed],
  );
  const [asyncResults, setAsyncResults] = useState<Hit[]>(() =>
    performSearch(""),
  );
  const results = syncResults ?? asyncResults;

  const [prevTrimmed, setPrevTrimmed] = useState(trimmed);
  if (trimmed !== prevTrimmed) {
    setPrevTrimmed(trimmed);
    setActiveIdx(0);
  }

  useEffect(() => {
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      const next = performSearch(query);
      startTransition(() => {
        setAsyncResults(next);
        setActiveIdx(0);
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, trimmed]);

  // Готуємо плоский список для keyboard-nav (↑/↓/Enter працюють по
  // порядку рендеру, а не по groups-first). Actions go first so the
  // command bar feels Spotlight-y; settings + assistant + AI handoff
  // pseudo-groups render last so the hot-path module hits stay at the
  // top.
  const flat = useMemo(() => {
    const order = [
      "actions",
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
      "settings",
      "assistant",
      "ai",
    ];
    return order.map((m) => results.filter((r) => r.module === m)).flat();
  }, [results]);

  const commitQuery = useCallback((q: string) => {
    if (!q.trim()) return;
    const next = pushRecentQuery(q);
    setRecents(next);
  }, []);

  const escalateToChat = useCallback(
    (prompt: string) => {
      inlineReset();
      onClose();
      // Sergeant v2 Phase 7 D5 — open the chat overlay with the prompt
      // prefilled. `autoSend=false` keeps the user in control: chat
      // opens with the prompt ready to edit before sending. Matches
      // `AssistantCataloguePage`'s "Try in chat" CTA shape; the bus
      // handler in `useAppEffects` routes to the bottom-sheet overlay,
      // and the full-screen `/chat?q=…` URL stays a valid deep-link via
      // `HubChatPage`.
      emitHubBus("openChat", { message: prompt, autoSend: false });
    },
    [inlineReset, onClose],
  );

  const openHit = useCallback(
    (hit: Hit) => {
      hapticTap();
      commitQuery(query);
      // AI handoff is a hot-path command — keep the launcher mounted and
      // resolve the question inline rather than swapping the whole screen
      // for the fullscreen chat overlay. Multi-turn / tool-call execution
      // still escalates to the chat surface via the rail's own CTA.
      if (hit.target.kind === "ai-handoff") {
        void inlineAsk(hit.target.query);
        return;
      }
      onClose();
      // `target` carries the navigation intent so we don't have to re-derive
      // it from `hit.module` (which is the visual grouping, not the route):
      //   - module hits  → existing onOpenModule plumbing
      //   - settings hit → the hub's own Settings tab (`?tab=settings`,
      //                    `useHubUIState.readViewFromSearch`). L-1
      //                    (profile/settings deep audit, 2026-08-08):
      //                    `/settings` used to be a dedicated standalone
      //                    route that always mounted `HubSettingsPage`
      //                    on its own, chrome-less page — it is now a
      //                    pure redirect BACK into this same hub tab
      //                    (`core/settings/route.tsx`), so navigating
      //                    straight to the tab here skips a pointless
      //                    extra hop. L-13 (2026-08-08): `target.sectionId`
      //                    used to be computed by `searchSettings.ts` and
      //                    then silently dropped here — every settings hit
      //                    landed on whichever inner tab happened to be
      //                    open, not the one the user searched for.
      //                    `#settings-<id>` mirrors the deep-link shape
      //                    `HubSettingsPage` already reads on mount
      //                    (`readSettingsSectionHash`) — same channel the
      //                    inactive-Bento-card handoff uses
      //                    (`openHubSettingsSection` in hubNav.ts), so a
      //                    fresh navigation into Settings auto-selects the
      //                    right group and scrolls/expands the section.
      //   - assistant hit→ if the hit carries a capability, open the chat
      //                    with its first example prefilled (the chat input
      //                    receives focus so the user can edit before
      //                    sending). Without a capability we fall back to
      //                    the full /assistant catalogue route.
      switch (hit.target.kind) {
        case "module":
          onOpenModule(hit.target.moduleId);
          break;
        case "settings": {
          const sectionId = hit.target.sectionId;
          // Audit finding #2b (2026-08-08): the previous version reused the
          // CURRENT `window.location.pathname`. On any module route
          // (`/finyk`, `/nutrition/menu`, …) that landed on e.g.
          // `/finyk?tab=settings#settings-plan` — `/finyk` renders the
          // Finyk module, nobody there reads `?tab=settings`, so the click
          // silently no-op'd. The target must stay ABSOLUTE (`/`, the hub
          // root) regardless of where ⌘K was opened from — same canonical
          // target `capabilityRegistry.ts` already uses for its own
          // settings deep-links.
          navigate({
            pathname: "/",
            search: "?tab=settings",
            hash: sectionId ? `#settings-${sectionId}` : "",
          });
          // If Settings is already open (`HubSettingsPage`/`SettingsGroup`
          // already mounted — e.g. a second ⌘K settings hit without
          // leaving the page), react-router's `navigate()` above moves
          // `window.location.hash` via `history.pushState`, which never
          // fires a native `hashchange` event on its own. `SettingsGroup`'s
          // anchor auto-open only listens for that native event, so
          // without this it silently no-ops on every hit after the first.
          announceSettingsHashChange();
          break;
        }
        case "assistant": {
          const cap = hit.target.capability;
          const example = cap?.examples?.[0];
          if (example) {
            // Phase 7 D5 — open overlay with the example prefilled.
            // Mirrors `AssistantCataloguePage`'s "Try in chat" CTA which
            // also routes through the hub bus.
            emitHubBus("openChat", { message: example, autoSend: false });
          } else {
            navigate("/assistant");
          }
          break;
        }
        case "action": {
          // Cross-module quick-add launcher — dispatches the same PWA-intent
          // the bento NextCard / FAB use. The destination module reads the
          // intent on mount via `useHubModuleAction` and opens its own
          // create-modal.
          openHubModuleWithAction(hit.target.moduleId, hit.target.action);
          break;
        }
        // Note: `ai-handoff` hits never reach this switch — they're
        // intercepted above (before `onClose`) and resolved inline by
        // the rail. Adding a case here would be unreachable code.
      }
    },
    [commitQuery, inlineAsk, navigate, onClose, onOpenModule, query],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        const hit = flat[activeIdx];
        if (hit) {
          e.preventDefault();
          openHit(hit);
        } else if (query.trim()) {
          commitQuery(query);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIdx, commitQuery, flat, onClose, openHit, query]);

  const pickRecent = (q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  };

  const clearRecents = () => {
    clearRecentQueries();
    setRecents([]);
  };

  return {
    query,
    setQuery,
    results,
    flat,
    activeIdx,
    setActiveIdx,
    recents,
    inputRef,
    listRef,
    commitQuery,
    openHit,
    pickRecent,
    clearRecents,
    inlineAi,
    escalateToChat,
  };
}
