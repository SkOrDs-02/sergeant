// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryPieChart } from "./CategoryPieChart";

function slice(id: string, spent: number, color = "#123456") {
  return { categoryId: id, label: id.toUpperCase(), spent, color };
}

describe("CategoryPieChart", () => {
  it("renders nothing for empty data", () => {
    const { container } = render(<CategoryPieChart data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when total spend is zero", () => {
    const { container } = render(
      <CategoryPieChart data={[slice("a", 0), slice("b", 0)]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a donut with the authoritative total label", () => {
    render(
      <CategoryPieChart
        data={[slice("food", 6000), slice("fun", 4000)]}
        total={10000}
      />,
    );
    const img = screen.getByRole("img", { name: "Кругова діаграма категорій" });
    expect(img).toHaveAttribute(
      "aria-describedby",
      "finyk-category-pie-summary",
    );
    expect(document.getElementById("finyk-category-pie-summary")).toBeTruthy();
    // Total appears in the SVG centre and in the sr-only data summary.
    expect(screen.getAllByText(/10\D?000\s*₴/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByText("FOOD")).toBeInTheDocument();
    expect(screen.getByText("FUN")).toBeInTheDocument();
  });

  it("renders a valid full-ring sector for a single category", () => {
    render(<CategoryPieChart data={[slice("food", 5000)]} />);

    const path = document.querySelector("path");
    expect(path).toBeTruthy();
    const d = path?.getAttribute("d") ?? "";
    expect(d).toContain("A 79 79");
    expect(d).toContain("A 48.98 48.98");
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1);
  });

  it("collapses to top-5 + Інше and toggles to expanded", () => {
    const data = Array.from({ length: 8 }, (_, i) =>
      slice(`c${i}`, 1000 - i * 50),
    );
    render(<CategoryPieChart data={data} />);

    // Overflow toggle present.
    const toggle = screen.getByTestId("finyk-analytics-donut-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.className).toMatch(/min-h-\[44px\]/);
    // Collapsed view buckets the rest into "Інше".
    expect(screen.getByText("Інше")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("does not show a toggle when within the top-N cap", () => {
    render(<CategoryPieChart data={[slice("a", 100), slice("b", 200)]} />);
    expect(
      screen.queryByTestId("finyk-analytics-donut-toggle"),
    ).not.toBeInTheDocument();
  });

  /*
   * Дрил-даун у список операцій. Легенда стає інтерактивною ЛИШЕ коли є
   * куди вести: кнопка без дії брехала б скрінрідеру про те, що тут щось
   * станеться.
   */
  describe("drill-down into transactions", () => {
    it("keeps the legend static without a handler", () => {
      render(<CategoryPieChart data={[slice("food", 600)]} />);
      expect(screen.queryByRole("button", { name: /FOOD/ })).toBeNull();
    });

    it("passes the category id up on click", () => {
      const onSelect = vi.fn();
      render(
        <CategoryPieChart
          data={[slice("food", 600), slice("fun", 400)]}
          onSelectCategory={onSelect}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /FOOD/ }));
      expect(onSelect).toHaveBeenCalledWith("food");
    });

    it("leaves the «Інше» bucket non-interactive", () => {
      // Агрегат кількох категорій — фільтрувати по ньому нічого, тож він
      // лишається `<div>` навіть коли решта рядків уже кнопки.
      const data = Array.from({ length: 8 }, (_, i) =>
        slice(`c${i}`, 1000 - i * 50),
      );
      render(<CategoryPieChart data={data} onSelectCategory={vi.fn()} />);
      expect(screen.getByRole("button", { name: /C0/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Інше/ })).toBeNull();
    });
  });
});
