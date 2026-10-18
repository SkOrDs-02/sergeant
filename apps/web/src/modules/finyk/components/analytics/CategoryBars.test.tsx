/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { CategoryBars } from "./CategoryBars";

afterEach(cleanup);

const DATA = [
  { categoryId: "cafe", label: "Кафе", spent: 300, color: "#111111" },
  { categoryId: "food", label: "Продукти", spent: 700, color: "#222222" },
];

describe("CategoryBars (мова H)", () => {
  it("бари від більшої категорії до меншої, частка текстом, без donut", () => {
    const { container } = render(<CategoryBars data={DATA} />);
    const labels = screen
      .getAllByText(/Кафе|Продукти/)
      .map((n) => n.textContent);
    expect(labels).toEqual(["Продукти", "Кафе"]);
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("минулий місяць - привид під баром", () => {
    render(
      <CategoryBars
        data={DATA}
        previous={[{ categoryId: "cafe", prevMinor: 50000 }]}
      />,
    );
    expect(screen.getAllByTestId("category-bar-ghost")).toHaveLength(1);
  });

  it("тап по рядку веде в операції категорії", () => {
    const onSelect = vi.fn();
    render(<CategoryBars data={DATA} onSelectCategory={onSelect} />);
    fireEvent.click(screen.getByText("Кафе"));
    expect(onSelect).toHaveBeenCalledWith("cafe");
  });
});
