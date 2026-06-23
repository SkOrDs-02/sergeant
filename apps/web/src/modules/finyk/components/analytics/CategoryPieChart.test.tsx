// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
    expect(screen.getByRole("img")).toBeInTheDocument();
    // 10000 formatted in uk-UA + ₴
    expect(screen.getByText(/10\D?000\s*₴/)).toBeInTheDocument();
    expect(screen.getByText("FOOD")).toBeInTheDocument();
    expect(screen.getByText("FUN")).toBeInTheDocument();
  });

  it("collapses to top-5 + Інше and toggles to expanded", () => {
    const data = Array.from({ length: 8 }, (_, i) =>
      slice(`c${i}`, 1000 - i * 50),
    );
    render(<CategoryPieChart data={data} />);

    // Overflow toggle present.
    const toggle = screen.getByTestId("finyk-analytics-donut-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
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
});
