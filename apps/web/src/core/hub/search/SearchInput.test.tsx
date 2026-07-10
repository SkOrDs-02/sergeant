/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchInput } from "./SearchInput";

vi.mock("@shared/components/ui/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

describe("SearchInput", () => {
  afterEach(() => cleanup());

  it("wires combobox a11y attributes and reflects the controlled query", () => {
    const onQueryChange = vi.fn();
    render(
      <SearchInput
        query="кава"
        onQueryChange={onQueryChange}
        onClose={vi.fn()}
        listId="hub-search-list"
        expanded
        activeId="hub-hit-1"
      />,
    );

    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("кава");
    expect(input).toHaveAttribute("aria-controls", "hub-search-list");
    expect(input).toHaveAttribute("aria-activedescendant", "hub-hit-1");
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("forwards query edits and cancel clicks", () => {
    const onQueryChange = vi.fn();
    const onClose = vi.fn();
    render(
      <SearchInput
        query=""
        onQueryChange={onQueryChange}
        onClose={onClose}
        listId="list"
        expanded={false}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "бюджет" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("бюджет");

    fireEvent.click(screen.getByRole("button", { name: /скасувати/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
