/** @vitest-environment jsdom */
/**
 * Shell smoke for `HubSearch` — dialog landmark + child wiring. Search
 * scoring and keyboard behaviour live under `core/hub/search/*` suites.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const engine = {
  inputRef: { current: null },
  listRef: { current: null },
  query: "біг",
  setQuery: vi.fn(),
  results: [],
  flat: [{ id: "hit-1", moduleId: "routine", title: "Біг" }],
  activeIdx: 0,
  setActiveIdx: vi.fn(),
  recents: [],
  openHit: vi.fn(),
  pickRecent: vi.fn(),
  clearRecents: vi.fn(),
  commitQuery: vi.fn(),
  escalateToChat: vi.fn(),
  inlineAi: {
    state: { status: "idle" as const },
    ask: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
  },
};

vi.mock("./useSearchEngine", () => ({
  useSearchEngine: () => engine,
}));
vi.mock("./SearchInput", () => ({
  SearchInput: ({
    query,
    onQueryChange,
    onClose,
    expanded,
    activeId,
  }: {
    query: string;
    onQueryChange: (value: string) => void;
    onClose: () => void;
    expanded: boolean;
    activeId?: string;
  }) => (
    <div>
      <input
        aria-label="Пошук"
        value={query}
        readOnly
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        data-testid="search-input"
        data-expanded={String(expanded)}
        data-active-id={activeId}
      />
      <button type="button" onClick={onClose}>
        close-search
      </button>
    </div>
  ),
}));
vi.mock("./SearchResults", () => ({
  SearchResults: ({
    flat,
    onActivate,
    onHover,
    onPickRecent,
    onClearRecents,
    onCommitQuery,
    onOpenModule,
    onClose,
  }: {
    flat: Array<{ id: string }>;
    onActivate: (hit: { id: string }) => void;
    onHover: (idx: number) => void;
    onPickRecent: (query: string) => void;
    onClearRecents: () => void;
    onCommitQuery: (query: string) => void;
    onOpenModule: (moduleId: string) => void;
    onClose: () => void;
  }) => (
    <div data-testid="search-results">
      <button
        type="button"
        onMouseEnter={() => onHover(0)}
        onClick={() => {
          const firstHit = flat[0];
          if (firstHit) onActivate(firstHit);
        }}
      >
        activate-hit
      </button>
      <button type="button" onClick={() => onPickRecent("кава")}>
        pick-recent
      </button>
      <button type="button" onClick={onClearRecents}>
        clear-recents
      </button>
      <button type="button" onClick={() => onCommitQuery("звіт")}>
        commit-query
      </button>
      <button type="button" onClick={() => onOpenModule("routine")}>
        open-module
      </button>
      <button type="button" onClick={onClose}>
        close-results
      </button>
    </div>
  ),
}));
vi.mock("./InlineAiRail", () => ({
  InlineAiRail: ({
    onRetry,
    onCancel,
    onOpenInChat,
    onDismiss,
  }: {
    onRetry: (query: string) => void;
    onCancel: () => void;
    onOpenInChat: () => void;
    onDismiss: () => void;
  }) => (
    <div data-testid="inline-ai-rail">
      <button type="button" onClick={() => onRetry("аналіз")}>
        ai-retry
      </button>
      <button type="button" onClick={onCancel}>
        ai-cancel
      </button>
      <button type="button" onClick={onOpenInChat}>
        ai-open-chat
      </button>
      <button type="button" onClick={onDismiss}>
        ai-dismiss
      </button>
    </div>
  ),
}));
vi.mock("@shared/hooks/useDialogFocusTrap", () => ({
  useDialogFocusTrap: vi.fn(),
}));

import { HubSearch } from "./HubSearch";

describe("HubSearch — shell smoke", () => {
  afterEach(() => cleanup());

  it("renders the modal dialog landmark and child rails", () => {
    render(<HubSearch onClose={vi.fn()} onOpenModule={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByTestId("search-input")).toHaveValue("біг");
    expect(screen.getByTestId("search-results")).toBeInTheDocument();
    expect(screen.getByTestId("inline-ai-rail")).toBeInTheDocument();
    expect(screen.getByTestId("search-input")).toHaveAttribute(
      "data-active-id",
      "hub-hit-hit-1",
    );
  });

  it("wires child component callbacks back to the search engine and shell props", () => {
    const onClose = vi.fn();
    const onOpenModule = vi.fn();
    render(<HubSearch onClose={onClose} onOpenModule={onOpenModule} />);

    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "нова" },
    });
    fireEvent.mouseEnter(screen.getByRole("button", { name: "activate-hit" }));
    fireEvent.click(screen.getByRole("button", { name: "activate-hit" }));
    fireEvent.click(screen.getByRole("button", { name: "pick-recent" }));
    fireEvent.click(screen.getByRole("button", { name: "clear-recents" }));
    fireEvent.click(screen.getByRole("button", { name: "commit-query" }));
    fireEvent.click(screen.getByRole("button", { name: "open-module" }));
    fireEvent.click(screen.getByRole("button", { name: "ai-retry" }));
    fireEvent.click(screen.getByRole("button", { name: "ai-cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "ai-open-chat" }));
    fireEvent.click(screen.getByRole("button", { name: "ai-dismiss" }));
    fireEvent.click(screen.getByRole("button", { name: "close-search" }));
    fireEvent.click(screen.getByRole("button", { name: "close-results" }));

    expect(engine.setQuery).toHaveBeenCalledWith("нова");
    expect(engine.setActiveIdx).toHaveBeenCalledWith(0);
    expect(engine.openHit).toHaveBeenCalledWith(engine.flat[0]);
    expect(engine.pickRecent).toHaveBeenCalledWith("кава");
    expect(engine.clearRecents).toHaveBeenCalledTimes(1);
    expect(engine.commitQuery).toHaveBeenCalledWith("звіт");
    expect(onOpenModule).toHaveBeenCalledWith("routine");
    expect(engine.inlineAi.ask).toHaveBeenCalledWith("аналіз");
    expect(engine.inlineAi.cancel).toHaveBeenCalledTimes(1);
    expect(engine.escalateToChat).toHaveBeenCalledTimes(1);
    expect(engine.inlineAi.reset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
