// @vitest-environment jsdom
/**
 * Branch coverage for CategorySelector — placeholder, value coercion, onChange.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CategorySelector } from "./CategorySelector";

afterEach(() => cleanup());

describe("CategorySelector (branches)", () => {
  it("renders default placeholder option", () => {
    render(<CategorySelector value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveDisplayValue("Обери категорію");
  });

  it("renders custom placeholder when provided", () => {
    render(
      <CategorySelector
        value={null}
        onChange={vi.fn()}
        placeholder="Категорія витрати"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveDisplayValue(
      "Категорія витрати",
    );
  });

  it("coerces null/undefined value to empty string", () => {
    render(<CategorySelector value={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("shows selected category label", () => {
    render(
      <CategorySelector
        value="food"
        onChange={vi.fn()}
        categories={[
          { id: "food", label: "Продукти" },
          { id: "transport", label: "Транспорт" },
        ]}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveDisplayValue("Продукти");
  });

  it("fires onChange with the chosen category id", () => {
    const onChange = vi.fn();
    render(
      <CategorySelector
        value=""
        onChange={onChange}
        categories={[{ id: "food", label: "Продукти" }]}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "food" },
    });
    expect(onChange).toHaveBeenCalledWith("food");
  });
});
