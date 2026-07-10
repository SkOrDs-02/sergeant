// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategorySelector } from "./CategorySelector";

describe("CategorySelector", () => {
  const categories = [
    { id: "food", label: "Їжа" },
    { id: "transport", label: "Транспорт" },
  ];

  it("renders placeholder and category options", () => {
    render(
      <CategorySelector
        value={null}
        onChange={vi.fn()}
        categories={categories}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Їжа" })).toBeInTheDocument();
  });

  it("fires onChange with selected category id", () => {
    const onChange = vi.fn();
    render(
      <CategorySelector
        value="food"
        onChange={onChange}
        categories={categories}
        placeholder="Категорія"
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "transport" },
    });
    expect(onChange).toHaveBeenCalledWith("transport");
  });

  it("supports custom placeholder", () => {
    render(
      <CategorySelector
        value={undefined}
        onChange={vi.fn()}
        categories={[]}
        placeholder="Обери тип"
      />,
    );
    expect(
      screen.getByRole("option", { name: "Обери тип" }),
    ).toBeInTheDocument();
  });
});
