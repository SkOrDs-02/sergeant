// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FinykTagsSection } from "./FinykTagsSection";

const tags = [
  { key: "відпустка", label: "відпустка", count: 2 },
  { key: "ремонт", label: "ремонт", count: 1 },
];

function open() {
  const renameTag = vi.fn();
  const removeTag = vi.fn();
  render(
    <FinykTagsSection
      tags={tags}
      renameTag={renameTag}
      removeTag={removeTag}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Керувати: Теги" }));
  return { renameTag, removeTag };
}

describe("FinykTagsSection (Р6.6)", () => {
  it("показує кількість тегів і операцій", () => {
    open();
    expect(screen.getByText("Операцій: 2")).toBeInTheDocument();
  });

  it("перейменовує тег за ключем", () => {
    const { renameTag } = open();
    fireEvent.click(
      screen.getByRole("button", { name: "Перейменувати тег «ремонт»" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Нова назва тегу «ремонт»",
    });
    fireEvent.change(input, { target: { value: "Ремонт кухні" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(renameTag).toHaveBeenCalledWith("ремонт", "Ремонт кухні");
  });

  it("видаляє тег після підтвердження", () => {
    const { removeTag } = open();
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити тег «відпустка»" }),
    );
    expect(
      screen.getByText(/зникне з усіх операцій \(2\)/),
    ).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Видалити" }).at(-1)!;
    fireEvent.click(confirm);
    expect(removeTag).toHaveBeenCalledWith("відпустка");
  });
});
