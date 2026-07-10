/** @vitest-environment jsdom */
/**
 * Shell smoke for `HubSearch` — dialog landmark + child wiring. Search
 * scoring and keyboard behaviour live under `core/hub/search/*` suites.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
    onClose: _onClose,
  }: {
    query: string;
    onClose: () => void;
  }) => (
    <input
      aria-label="Пошук"
      value={query}
      readOnly
      onChange={() => {}}
      data-testid="search-input"
    />
  ),
}));
vi.mock("./SearchResults", () => ({
  SearchResults: () => <div data-testid="search-results" />,
}));
vi.mock("./InlineAiRail", () => ({
  InlineAiRail: () => <div data-testid="inline-ai-rail" />,
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
  });
});
