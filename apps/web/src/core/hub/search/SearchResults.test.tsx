/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchResults } from "./SearchResults";
import type { Hit } from "./searchTypes";

const hapticTap = vi.fn();
vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: () => hapticTap(),
}));

function makeHit(over: Partial<Hit> = {}): Hit {
  return {
    id: over.id ?? "h1",
    module: over.module ?? "finyk",
    moduleLabel: over.moduleLabel ?? "Фінанси",
    title: over.title ?? "Кава",
    subtitle: over.subtitle ?? "−120 ₴",
    icon: over.icon ?? "💸",
    target: over.target ?? { kind: "module", moduleId: "finyk" },
    _score: over._score ?? 1,
  };
}

interface HandlerSet {
  onActivate: ReturnType<typeof vi.fn<(hit: Hit) => void>>;
  onHover: ReturnType<typeof vi.fn<(index: number) => void>>;
  onPickRecent: ReturnType<typeof vi.fn<(q: string) => void>>;
  onClearRecents: ReturnType<typeof vi.fn<() => void>>;
  onCommitQuery: ReturnType<typeof vi.fn<(q: string) => void>>;
  onOpenModule: ReturnType<typeof vi.fn<(moduleId: string) => void>>;
  onClose: ReturnType<typeof vi.fn<() => void>>;
}

function handlers(): HandlerSet {
  return {
    onActivate: vi.fn(),
    onHover: vi.fn(),
    onPickRecent: vi.fn(),
    onClearRecents: vi.fn(),
    onCommitQuery: vi.fn(),
    onOpenModule: vi.fn(),
    onClose: vi.fn(),
  };
}

function renderResults(
  props: Partial<React.ComponentProps<typeof SearchResults>> & {
    handlers?: HandlerSet;
  } = {},
) {
  const h = props.handlers ?? handlers();
  const results = props.results ?? [];
  const view = render(
    <SearchResults
      query={props.query ?? ""}
      results={results}
      flat={props.flat ?? results}
      activeIdx={props.activeIdx ?? -1}
      recents={props.recents ?? []}
      onActivate={h.onActivate}
      onHover={h.onHover}
      onPickRecent={h.onPickRecent}
      onClearRecents={h.onClearRecents}
      onCommitQuery={h.onCommitQuery}
      onOpenModule={h.onOpenModule}
      onClose={h.onClose}
    />,
  );
  return { ...view, handlers: h };
}

describe("SearchResults", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the global-search prompt empty state for a short query with no recents", () => {
    renderResults({ query: "", results: [], recents: [] });
    expect(screen.getByText("Глобальний пошук")).toBeInTheDocument();
  });

  it("renders the no-results empty state for a long query with no hits", () => {
    renderResults({ query: "невідомо", results: [], recents: [] });
    expect(screen.getByText("Нічого не знайдено")).toBeInTheDocument();
    expect(screen.getByText(/невідомо/)).toBeInTheDocument();
    // The prompt empty state must NOT be shown when query is long.
    expect(screen.queryByText("Глобальний пошук")).not.toBeInTheDocument();
  });

  it("shows recents and hides the prompt when the query is short and recents exist", () => {
    renderResults({ query: "", results: [], recents: ["кава", "зал"] });
    expect(screen.getByText("Недавні запити")).toBeInTheDocument();
    expect(screen.getByText("кава")).toBeInTheDocument();
    expect(screen.getByText("зал")).toBeInTheDocument();
    expect(screen.queryByText("Глобальний пошук")).not.toBeInTheDocument();
  });

  it("fires onPickRecent and onClearRecents", () => {
    const { handlers: h } = renderResults({
      query: " ",
      recents: ["кава"],
    });
    fireEvent.click(screen.getByText("кава"));
    expect(h.onPickRecent).toHaveBeenCalledWith("кава");
    fireEvent.click(screen.getByText("Очистити"));
    expect(h.onClearRecents).toHaveBeenCalledTimes(1);
  });

  it("groups hits by module and renders group labels", () => {
    const results: Hit[] = [
      makeHit({ id: "a", module: "finyk", moduleLabel: "Фінанси" }),
      makeHit({
        id: "b",
        module: "fizruk",
        moduleLabel: "Фітнес",
        title: "Жим",
      }),
    ];
    renderResults({ query: "ка", results, flat: results });
    expect(screen.getByText("Фінанси")).toBeInTheDocument();
    expect(screen.getByText("Фітнес")).toBeInTheDocument();
    expect(screen.getByText("Кава")).toBeInTheDocument();
    expect(screen.getByText("Жим")).toBeInTheDocument();
  });

  it("renders the saturation footer for a real module with 10 hits and wires onCommitQuery/onOpenModule/onClose", () => {
    const results: Hit[] = Array.from({ length: 10 }, (_, i) =>
      makeHit({ id: `f${i}`, module: "finyk", moduleLabel: "Фінанси" }),
    );
    const { handlers: h } = renderResults({
      query: "кава",
      results,
      flat: results,
    });
    const footer = screen.getByRole("button", {
      name: /Показано 10 — відкрити Фінанси/,
    });
    fireEvent.click(footer);
    expect(hapticTap).toHaveBeenCalledTimes(1);
    expect(h.onCommitQuery).toHaveBeenCalledWith("кава");
    expect(h.onOpenModule).toHaveBeenCalledWith("finyk");
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT render the saturation footer for the settings pseudo-module even with 10 hits", () => {
    const results: Hit[] = Array.from({ length: 10 }, (_, i) =>
      makeHit({
        id: `s${i}`,
        module: "settings",
        moduleLabel: "Налаштування",
        target: { kind: "settings" },
      }),
    );
    renderResults({ query: "налашт", results, flat: results });
    expect(
      screen.queryByRole("button", { name: /Показано/ }),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the footer for a real module below the 10-hit threshold", () => {
    const results: Hit[] = Array.from({ length: 9 }, (_, i) =>
      makeHit({ id: `f${i}`, module: "finyk", moduleLabel: "Фінанси" }),
    );
    renderResults({ query: "кава", results, flat: results });
    expect(
      screen.queryByRole("button", { name: /Показано/ }),
    ).not.toBeInTheDocument();
  });

  it("scrolls the active hit into view on mount/activeIdx change", () => {
    const results: Hit[] = [
      makeHit({ id: "a" }),
      makeHit({ id: "b", title: "Друге" }),
    ];
    renderResults({ query: "ка", results, flat: results, activeIdx: 1 });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("fires onActivate when a result row is clicked", () => {
    const results: Hit[] = [makeHit({ id: "a", title: "Кава" })];
    const { handlers: h } = renderResults({
      query: "ка",
      results,
      flat: results,
    });
    fireEvent.click(screen.getByText("Кава"));
    expect(h.onActivate).toHaveBeenCalledWith(results[0]);
  });
});
