import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { emitHubBus } from "@shared/lib/hubBus";
import { hapticTap } from "@shared/lib/haptic";
import {
  clearRecentQueries,
  getRecentQueries,
  pushRecentQuery,
} from "../hubSearchEngine";
import { performSearch } from "./searchSources";
import type { Hit } from "./searchTypes";

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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
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
  // порядку рендеру, а не по groups-first). Settings + Assistant pseudo-
  // groups render last so the hot-path module hits stay at the top.
  const flat = useMemo(() => {
    const order = [
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
      "settings",
      "assistant",
    ];
    return order.map((m) => results.filter((r) => r.module === m)).flat();
  }, [results]);

  const commitQuery = (q: string) => {
    if (!q.trim()) return;
    const next = pushRecentQuery(q);
    setRecents(next);
  };

  const openHit = (hit: Hit) => {
    hapticTap();
    commitQuery(query);
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
          emitHubBus("openChat", { message: example, autoSend: false });
        } else {
          navigate("/assistant");
        }
        break;
      }
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
  };
}
