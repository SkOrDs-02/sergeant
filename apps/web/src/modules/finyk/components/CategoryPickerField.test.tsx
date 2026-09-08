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

  it("не називає статичні категорії частими й не показує зайвий пошук для короткого списку", () => {
    render(
      <CategoryPickerField
        categories={[
          { id: "salary", label: "Зарплата" },
          { id: "gift", label: "Подарунок" },
        ]}
        selectedId="salary"
        onSelect={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Зарплата/ }));
    const dialog = screen.getByRole("dialog", { name: "Категорія" });
    expect(within(dialog).queryByText("Часті")).toBeNull();
    expect(within(dialog).queryByLabelText("Знайти категорію")).toBeNull();
    expect(within(dialog).getByText("Усі категорії")).toBeInTheDocument();
  });

  it("показує у «Частих» лише явно передані категорії", () => {
    const categories = Array.from({ length: 10 }, (_, index) => ({
      id: `category-${index}`,
      label: `Категорія ${index + 1}`,
    }));

    render(
      <CategoryPickerField
        categories={categories}
        selectedId="category-0"
        frequentIds={["category-7", "category-2"]}
        onSelect={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Категорія 1/ }));
    const dialog = screen.getByRole("dialog", { name: "Категорія" });
    const frequentSection = within(dialog)
      .getByText("Часті")
      .closest("section");
    expect(frequentSection).not.toBeNull();
    expect(within(frequentSection!).getAllByRole("button")).toHaveLength(2);
    expect(
      within(frequentSection!).getByText("Категорія 8"),
    ).toBeInTheDocument();
    expect(
      within(frequentSection!).getByText("Категорія 3"),
    ).toBeInTheDocument();
  });

  it("виконує контекстну дію скидання всередині шторки", () => {
    const onReset = vi.fn();
    render(
      <CategoryPickerField
        categories={[{ id: "food", label: "Продукти" }]}
        selectedId="food"
        onSelect={() => {}}
        onReset={onReset}
        resetLabel="Повернути автоматичну категорію"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Продукти/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Повернути автоматичну категорію",
      }),
    );
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Категорія" })).toBeNull();
  });
});
