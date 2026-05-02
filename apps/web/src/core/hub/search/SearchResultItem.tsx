import { cn } from "@shared/lib/cn";
import type { Hit } from "./searchTypes";

// Search-result chip wash + label per module. Each value uses the
// module's own theme-aware tokens (`bg-{m}-soft` is the
// `--c-{m}-soft` CSS var trio that flips per-theme; `text-{m}-strong`
// is the WCAG-AA companion at body sizes; `dark:text-{m}` falls back
// to the saturated DEFAULT step on dark panels). Equivalent to the
// Wave 1b token-swap recipe in `docs/design/DARK-MODE-AUDIT.md`.
//
// Settings + Assistant pseudo-modules share the neutral panel-tinted
// swatch so they read as "system" surfaces rather than competing for
// attention with module-coloured data. Actions + AI inherit the brand
// swatch (they are the launcher commands, not stored data).
export const MODULE_COLORS: Record<string, string> = {
  finyk: "bg-finyk-soft text-finyk-strong dark:text-finyk",
  fizruk: "bg-fizruk-soft text-fizruk-strong dark:text-fizruk",
  routine: "bg-routine-soft text-routine-strong dark:text-routine",
  nutrition: "bg-nutrition-soft text-nutrition-strong dark:text-nutrition",
  settings: "bg-panelHi text-muted",
  assistant: "bg-brand-500/10 text-brand-strong dark:text-brand",
  actions: "bg-brand-500/10 text-brand-strong dark:text-brand",
  ai: "bg-brand-500/10 text-brand-strong dark:text-brand",
};

export interface SearchResultItemProps {
  hit: Hit;
  /** Flat-list index (for keyboard navigation + auto-scroll). */
  index: number;
  active: boolean;
  onActivate: (hit: Hit) => void;
  onHover: (index: number) => void;
}

/**
 * Single search-hit row. The flat `index` is wired to both the active
 * highlight class and the `data-hit-idx` attribute so the parent shell
 * can call `scrollIntoView` after ↑/↓ navigation without rehydrating
 * the DOM lookup map.
 */
export function SearchResultItem({
  hit,
  index,
  active,
  onActivate,
  onHover,
}: SearchResultItemProps) {
  return (
    <button
      key={hit.id}
      id={`hub-hit-${hit.id}`}
      data-hit-idx={index}
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onActivate(hit)}
      onMouseEnter={() => onHover(index)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
        active
          ? "bg-panelHi ring-1 ring-brand-500/25"
          : "hover:bg-panelHi active:bg-panelHi",
      )}
    >
      <span
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0",
          MODULE_COLORS[hit.module],
        )}
        aria-hidden
      >
        {hit.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text truncate">{hit.title}</p>
        <p className="text-xs text-muted truncate">{hit.subtitle}</p>
      </div>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted/40 shrink-0"
        aria-hidden
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
