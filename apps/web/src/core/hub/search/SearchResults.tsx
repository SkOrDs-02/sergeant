import { forwardRef, useEffect, useRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { useShortcutGlyph } from "@shared/hooks";
import { SearchResultItem } from "./SearchResultItem";
import type { Hit } from "./searchTypes";

export interface SearchResultsProps {
  query: string;
  results: Hit[];
  /** Flat list aligned with `results` order — drives ↑/↓ navigation. */
  flat: Hit[];
  activeIdx: number;
  recents: string[];
  onActivate: (hit: Hit) => void;
  onHover: (index: number) => void;
  onPickRecent: (q: string) => void;
  onClearRecents: () => void;
  onCommitQuery: (q: string) => void;
  onOpenModule: (moduleId: string) => void;
  onClose: () => void;
}

/**
 * Results pane: empty / no-results / recents states + grouped result
 * list with the saturation footer ("показано 10 — відкрити <module>")
 * for real modules. Stateless beyond the auto-scroll-to-active effect.
 */
export const SearchResults = forwardRef<HTMLDivElement, SearchResultsProps>(
  function SearchResults(
    {
      query,
      results,
      flat,
      activeIdx,
      recents,
      onActivate,
      onHover,
      onPickRecent,
      onClearRecents,
      onCommitQuery,
      onOpenModule,
      onClose,
    },
    ref,
  ) {
    const { modK } = useShortcutGlyph();
    const localRef = useRef<HTMLDivElement | null>(null);
    // Forward the parent ref while keeping our own for the scroll effect.
    const setRef = (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    };

    // Автоскрол до активного рядка при навігації клавіатурою.
    useEffect(() => {
      const root = localRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(
        `[data-hit-idx="${activeIdx}"]`,
      );
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeIdx]);

    const grouped = results.reduce<
      Record<string, { label: string; items: Hit[] }>
    >((acc, r) => {
      if (!acc[r.module]) acc[r.module] = { label: r.moduleLabel, items: [] };
      acc[r.module]!.items.push(r);
      return acc;
    }, {});

    const showRecents = query.trim().length < 2 && recents.length > 0;

    let runningIdx = -1;

    return (
      <div
        ref={setRef}
        id="hub-search-results"
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
        role="listbox"
      >
        {query.trim().length >= 2 && results.length === 0 && (
          <EmptyState
            icon={<Icon name="search" size={22} strokeWidth={1.6} />}
            title="Нічого не знайдено"
            description={`За запитом «${query}» нічого не знайшлося. Спробуй іншу фразу.`}
          />
        )}

        {showRecents && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <SectionHeading as="p" size="sm" variant="muted">
                Недавні запити
              </SectionHeading>
              <button
                type="button"
                onClick={onClearRecents}
                // eslint-disable-next-line sergeant-design/no-rounded-lg -- pre-existing tech debt; semantic fix tracked in docs/tech-debt/frontend.md
                className="text-xs text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-lg px-1.5 py-0.5"
              >
                Очистити
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onPickRecent(r)}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-panelHi border border-line text-sm text-text hover:bg-line/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {!showRecents && query.trim().length < 2 && results.length === 0 && (
          <EmptyState
            icon={<Icon name="search" size={22} strokeWidth={1.6} />}
            title="Глобальний пошук"
            description={`Транзакції, тренування, звички, їжа — все в одному місці. ${modK}, щоб відкрити звідусіль.`}
          />
        )}

        {Object.entries(grouped).map(([moduleId, group]) => (
          <div key={moduleId}>
            <SectionHeading as="p" size="sm" variant="muted" className="mb-1.5">
              {group.label}
            </SectionHeading>
            <div className="space-y-1">
              {group.items.map((item) => {
                runningIdx += 1;
                const idx = flat.indexOf(item);
                const isActive = idx === activeIdx;
                return (
                  <SearchResultItem
                    key={item.id}
                    hit={item}
                    index={idx >= 0 ? idx : runningIdx}
                    active={isActive}
                    onActivate={onActivate}
                    onHover={onHover}
                  />
                );
              })}
            </div>
            {/* When a module returns exactly 10 hits the list is saturated —
                there may be more results. Show a link to open the module so
                the user can browse/filter there instead of refining here.
                Settings + Assistant pseudo-modules cap at 5 hits and don't
                expose a "browse all" entry point from this list, so we
                only render the saturation footer for real modules. */}
            {group.items.length >= 10 &&
              moduleId !== "settings" &&
              moduleId !== "assistant" && (
                <button
                  type="button"
                  onClick={() => {
                    hapticTap();
                    onCommitQuery(query);
                    onOpenModule(moduleId);
                    onClose();
                  }}
                  className="text-style-caption mt-1.5 w-full flex items-center justify-between px-3 py-2 rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
                >
                  <span>
                    Показано {group.items.length} — відкрити {group.label}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )}
          </div>
        ))}
      </div>
    );
  },
);
