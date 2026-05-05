import { forwardRef } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

export interface SearchInputProps {
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  /** id of the listbox so the input can `aria-controls` it. */
  listId: string;
  expanded: boolean;
  /** id of the focused option (for `aria-activedescendant`). */
  activeId?: string;
}

/**
 * Top input bar of HubSearch — search field with leading icon and
 * "Скасувати" affordance. Owns no state itself; the parent shell drives
 * the value and forwards keyboard navigation via document-level
 * listeners (so ↑/↓ work even when focus stays in the input).
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    { query, onQueryChange, onClose, listId, expanded, activeId },
    ref,
  ) {
    return (
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 border-b border-line">
        <div className="flex-1 relative">
          <Icon
            name="search"
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            ref={ref}
            type="search"
            placeholder={messages.nav.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            className="w-full h-11 pl-10 pr-4 rounded-2xl bg-panelHi border border-line text-text placeholder:text-muted text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded-xl px-2 py-1"
        >
          {messages.actions.cancel}
        </button>
      </div>
    );
  },
);
