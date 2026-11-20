import { forwardRef, useImperativeHandle, useRef } from "react";
import { fieldFocus } from "@shared/components/ui/Input";
import { Icon } from "@shared/components/ui/Icon";
import {
  HIDE_NATIVE_SEARCH_CANCEL,
  SearchClearButton,
} from "@shared/components/ui/SearchClearButton";
import { messages } from "@shared/i18n/uk";
import { coreMessages } from "@shared/i18n/uk.core";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";

export interface SearchInputProps {
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  /** id of the listbox so the input can `aria-controls` it. */
  listId: string;
  expanded: boolean;
  /** id of the focused option (for `aria-activedescendant`). */
  activeId?: string | undefined;
}

/**
 * Top input bar of HubSearch — search field with leading icon and
 * "Скасувати" affordance. Owns no state itself; the parent shell drives
 * the value and forwards keyboard navigation via document-level
 * listeners (so ↑/↓ work even when focus stays in the input).
 *
 * Очищення запиту — власна кнопка «Очистити пошук» (2026-11-18, спека
 * `hub-newcomer-card-and-insights.md`): нативний синій хрестик
 * `type=search` випадав зі стилю, тож його сховано. «Скасувати» лишається
 * окремою дією: воно закриває пошук, а не очищує поле.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    { query, onQueryChange, onClose, listId, expanded, activeId },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
    const hasQuery = query.trim() !== "";

    return (
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 border-b border-line">
        <div className="flex-1 relative">
          <Icon
            name="search"
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            ref={inputRef}
            type="search"
            // Keeps Chrome's password manager off the box — see
            // `searchFieldProps.ts`. Doubly important here: this input already
            // owns a combobox listbox, so a browser-drawn credential dropdown
            // renders on top of our own suggestions.
            {...searchFieldProps("hub-search")}
            placeholder={messages.nav.searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            className={`w-full h-12 pl-10 ${hasQuery ? "pr-12" : "pr-4"} rounded-lg bg-panelHi border border-control text-text placeholder:text-muted text-style-body outline-none ${HIDE_NATIVE_SEARCH_CANCEL} ${fieldFocus(false)}`}
          />
          {hasQuery ? (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 text-muted">
              <SearchClearButton
                label={coreMessages.hub.searchClear}
                onClear={() => {
                  onQueryChange("");
                  // Кнопка зникає разом із запитом; без цього фокус падав би
                  // на body і друкувати знову можна було б лише після тапу.
                  inputRef.current?.focus();
                }}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-style-label text-muted hover:text-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 rounded-lg px-2 py-1"
        >
          {messages.actions.cancel}
        </button>
      </div>
    );
  },
);
