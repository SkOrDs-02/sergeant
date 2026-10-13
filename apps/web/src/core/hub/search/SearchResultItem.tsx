import { cn } from "@shared/lib/ui/cn";
import type { Hit } from "./searchTypes";

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
        "w-full min-h-14 border-b border-line flex items-center px-3 py-2.5 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        active ? "bg-panelHi" : "hover:bg-panelHi active:bg-panelHi",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-style-body text-text truncate">{hit.title}</p>
        <p className="text-style-caption text-muted truncate">{hit.subtitle}</p>
      </div>
    </button>
  );
}
