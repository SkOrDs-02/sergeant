/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULE_COLORS, SearchResultItem } from "./SearchResultItem";
import type { Hit } from "./searchTypes";

function makeHit(overrides: Partial<Hit> = {}): Hit {
  return {
    id: overrides.id ?? "coffee",
    module: overrides.module ?? "finyk",
    moduleLabel: overrides.moduleLabel ?? "Фінанси",
    title: overrides.title ?? "Кава",
    subtitle: overrides.subtitle ?? "−120 ₴",
    icon: overrides.icon ?? "₴",
    target: overrides.target ?? { kind: "module", moduleId: "finyk" },
    _score: overrides._score ?? 1,
  };
}

describe("SearchResultItem", () => {
  afterEach(() => cleanup());

  it("renders an active option with stable listbox metadata", () => {
    render(
      <SearchResultItem
        hit={makeHit()}
        index={2}
        active
        onActivate={vi.fn()}
        onHover={vi.fn()}
      />,
    );

    const option = screen.getByRole("option", { name: /Кава/ });
    expect(option).toHaveAttribute("id", "hub-hit-coffee");
    expect(option).toHaveAttribute("data-hit-idx", "2");
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("activates the hit on click and tracks hover by flat-list index", () => {
    const hit = makeHit({ id: "gym", title: "Жим", module: "fizruk" });
    const onActivate = vi.fn();
    const onHover = vi.fn();

    render(
      <SearchResultItem
        hit={hit}
        index={4}
        active={false}
        onActivate={onActivate}
        onHover={onHover}
      />,
    );

    const option = screen.getByRole("option", { name: /Жим/ });
    fireEvent.mouseEnter(option);
    fireEvent.click(option);

    expect(onHover).toHaveBeenCalledWith(4);
    expect(onActivate).toHaveBeenCalledWith(hit);
    expect(option).toHaveAttribute("aria-selected", "false");
  });

  it("keeps system pseudo-modules on the neutral swatch", () => {
    expect(MODULE_COLORS["settings"]).toBe("bg-panelHi text-muted");

    render(
      <SearchResultItem
        hit={makeHit({
          id: "settings",
          module: "settings",
          moduleLabel: "Налаштування",
          title: "Налаштування Hub",
          subtitle: "Дашборд",
          icon: "⚙",
          target: { kind: "settings" },
        })}
        index={0}
        active={false}
        onActivate={vi.fn()}
        onHover={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("option", { name: /Налаштування Hub/ }),
    ).toBeInTheDocument();
  });
});
