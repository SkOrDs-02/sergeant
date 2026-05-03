import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
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
  const [results, setResults] = useState<Hit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>(() => getRecentQueries());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // HubSearch is rendered inside the BrowserRouter (via HubModals → AppInner),
  // so it can navigate to the URL-addressable Settings tab and the Assistant
  // catalogue without plumbing extra callbacks through the modal stack.
  const navigate = useNavigate();
  const inlineAi = useInlineAiRail();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Empty/short query — skip the timer + localStorage scan and surface
    // the launcher landing (just the four quick-add Actions) synchronously
    // so the palette feels instant when first opened.
    if (query.trim().length < 2) {
      setResults(performSearch(""));
      setActiveIdx(0);
      return;
    }
    const timer = setTimeout(() => {
      const next = performSearch(query);
      // Wrap state updates in startTransition so the heavy localStorage
      // parse + scoring work doesn't block the input from accepting the
      // next keystroke. React can interrupt this low-priority update if
      // new input arrives.
      startTransition(() => {
        setResults(next);
        setActiveIdx(0);
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

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

  const commitQuery = (q: string) => {
    if (!q.trim()) return;
    const next = pushRecentQuery(q);
    setRecents(next);
  };

  const escalateToChat = (prompt: string) => {
    inlineAi.reset();
    onClose();
    // Hand off to the dedicated `/chat` route. `autoSend=0` keeps the
    // user in control: the chat opens with the prompt prefilled, ready
    // to edit before sending. Matches `AssistantCataloguePage`'s
    // "Try in chat" CTA shape so deep-links share one URL surface.
    navigate(`/chat?q=${encodeURIComponent(prompt)}`);
  };

  const openHit = (hit: Hit) => {
    hapticTap();
    commitQuery(query);
    // AI handoff is a hot-path command — keep the launcher mounted and
    // resolve the question inline rather than swapping the whole screen
    // for the fullscreen chat overlay. Multi-turn / tool-call execution
    // still escalates to the chat surface via the rail's own CTA.
    if (hit.target.kind === "ai-handoff") {
      void inlineAi.ask(hit.target.query);
      return;
    }
    onClose();
    // `target` carries the navigation intent so we don't have to re-derive
    // it from `hit.module` (which is the visual grouping, not the route):
    //   - module hits  → existing onOpenModule plumbing
    //   - settings hit → URL-addressable settings tab (Settings page reads
    //                    `?tab=settings` via useHubUIState); section deep-
    //                    linking can be wired in a follow-up once the
    //                    settings page exposes a section anchor API
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
        const url = new URL(window.location.href);
        url.searchParams.set("tab", "settings");
        navigate({
          pathname: url.pathname || "/",
          search: url.search,
        });
        break;
      }
      case "assistant": {
        const cap = hit.target.capability;
        const example = cap?.examples?.[0];
        if (example) {
          // Match AssistantCataloguePage's "Try in chat" CTA: prefill
          // without auto-sending so the user keeps full control.
          navigate(`/chat?q=${encodeURIComponent(example)}`);
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
  };

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
    // `openHit`/`commitQuery` are stable callbacks; `setActiveIdx` is a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, activeIdx, onClose, query]);

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
