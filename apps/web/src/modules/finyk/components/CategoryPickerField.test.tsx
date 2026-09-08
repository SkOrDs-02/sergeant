// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { CategoryPickerField } from "./CategoryPickerField";

afterEach(cleanup);

describe("CategoryPickerField", () => {
  it("тримає 80 категорій за одним полем і фільтрує їх пошуком", () => {
    const categories = Array.from({ length: 80 }, (_, index) => ({
      id: `custom-${index}`,
      label: `Категорія ${index + 1}`,
    }));
    const onSelect = vi.fn();

    render(
      <CategoryPickerField
        categories={categories}
        selectedId="custom-0"
        onSelect={onSelect}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Категорія 1/ }));
    const dialog = screen.getByRole("dialog", { name: "Категорія" });
    fireEvent.change(within(dialog).getByLabelText("Знайти категорію"), {
      target: { value: "Категорія 73" },
    });
    expect(
      within(dialog).getByRole("button", { name: "Категорія 73" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Категорія 72" }),
    ).toBeNull();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Категорія 73" }),
    );
    expect(onSelect).toHaveBeenCalledWith("custom-72");
  });
});
