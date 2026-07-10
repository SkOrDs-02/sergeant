/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Hit } from "./searchTypes";
import { SearchResultItem } from "./SearchResultItem";

const hit: Hit = {
  id: "finyk_tx_1",
  module: "finyk",
  moduleLabel: "Фінік",
  title: "Кава",
  subtitle: "450 ₴",
  icon: "💳",
  target: { kind: "module", moduleId: "finyk" },
  _score: 10,
};

describe("SearchResultItem", () => {
  afterEach(() => cleanup());

  it("marks the active option and exposes the flat index for keyboard nav", () => {
    render(
      <SearchResultItem
        hit={hit}
        index={2}
        active
        onActivate={vi.fn()}
        onHover={vi.fn()}
      />,
    );

    const option = screen.getByRole("option", { name: /кава/i });
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(option).toHaveAttribute("data-hit-idx", "2");
    expect(option).toHaveAttribute("id", "hub-hit-finyk_tx_1");
  });

  it("activates on click and reports hover index", () => {
    const onActivate = vi.fn();
    const onHover = vi.fn();
    render(
      <SearchResultItem
        hit={hit}
        index={0}
        active={false}
        onActivate={onActivate}
        onHover={onHover}
      />,
    );

    const option = screen.getByRole("option", { name: /кава/i });
    fireEvent.mouseEnter(option);
    expect(onHover).toHaveBeenCalledWith(0);

    fireEvent.click(option);
    expect(onActivate).toHaveBeenCalledWith(hit);
  });
});
