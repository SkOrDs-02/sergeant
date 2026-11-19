/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  afterEach(() => cleanup());

  it("wires combobox accessibility metadata to the result list", () => {
    render(
      <SearchInput
        query="кава"
        onQueryChange={vi.fn()}
        onClose={vi.fn()}
        listId="hub-search-results"
        expanded
        activeId="hub-hit-finyk-1"
      />,
    );

    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("кава");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", "hub-search-results");
    expect(input).toHaveAttribute("aria-activedescendant", "hub-hit-finyk-1");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
  });

  it("emits query changes from the controlled search field", () => {
    const onQueryChange = vi.fn();
    render(
      <SearchInput
        query=""
        onQueryChange={onQueryChange}
        onClose={vi.fn()}
        listId="hub-search-results"
        expanded={false}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "зал" },
    });

    expect(onQueryChange).toHaveBeenCalledWith("зал");
  });

  it("calls onClose from the cancel affordance and forwards the input ref", () => {
    const onClose = vi.fn();
    const inputRef = vi.fn();
    render(
      <SearchInput
        ref={inputRef}
        query=""
        onQueryChange={vi.fn()}
        onClose={onClose}
        listId="hub-search-results"
        expanded={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(inputRef).toHaveBeenCalledWith(screen.getByRole("combobox"));
  });

  it("очищує запит власною кнопкою і повертає фокус у поле", () => {
    const onQueryChange = vi.fn();
    render(
      <SearchInput
        query="кава"
        onQueryChange={onQueryChange}
        onClose={vi.fn()}
        listId="hub-search-results"
        expanded
      />,
    );

    const input = screen.getByRole("combobox");
    // Нативний хрестик `type=search` сховано: його замінює кнопка нижче.
    expect(input.className).toContain("-webkit-search-cancel-button");
    fireEvent.click(screen.getByRole("button", { name: "Очистити пошук" }));

    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(document.activeElement).toBe(input);
    // «Скасувати» (закрити пошук) лишається окремою дією.
    expect(screen.getByRole("button", { name: "Скасувати" })).toBeTruthy();
  });

  it("не показує кнопку очищення при порожньому запиті", () => {
    render(
      <SearchInput
        query="   "
        onQueryChange={vi.fn()}
        onClose={vi.fn()}
        listId="hub-search-results"
        expanded={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Очистити пошук" })).toBeNull();
  });
});
