// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MonthlyTrendBars } from "./MonthlyTrendBars";
import { CategoryDeltaTable } from "./CategoryDeltaTable";

const points = [
  { month: "2026-08", spentMinor: 1_234_500, txCount: 4, isCurrent: false },
  { month: "2026-09", spentMinor: 300_000, txCount: 2, isCurrent: true },
];

describe("MonthlyTrendBars", () => {
  it("коротка історія: стовпці є, підпис каже, з якого місяця ведеш", () => {
    render(
      <MonthlyTrendBars
        points={points}
        averageMinor={1_234_500}
        perDayMinor={20_000}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      screen.getByText(
        /Ведеш з серпня: тренд стане корисним після трьох місяців/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/місяць ще триває/)).toBeInTheDocument();
    expect(screen.getByText(/У середньому/)).toHaveTextContent(/12\s?345/);
    expect(screen.getByText(/на день/)).toHaveTextContent(/200/);
  });

  it("без завершених місяців середнього за місяць немає", () => {
    render(<MonthlyTrendBars points={points.slice(1)} averageMinor={null} />);
    expect(screen.queryByText(/У середньому/)).toBeNull();
  });

  it("«Приховати суми» ховає суми і в підписах стовпців", () => {
    render(
      <MonthlyTrendBars
        points={points}
        averageMinor={1_234_500}
        showBalance={false}
      />,
    );
    expect(screen.getAllByText(/суму приховано/)).toHaveLength(2);
    expect(screen.queryByText(/У середньому/)).toBeNull();
  });
});

describe("CategoryDeltaTable", () => {
  it("показує відсоток лише з базою, інакше дельту в гривнях", () => {
    render(
      <CategoryDeltaTable
        rows={[
          {
            categoryId: "food",
            label: "Продукти",
            color: "#000",
            currentMinor: 80_750,
            prevMinor: 24_750,
            delta: { diffMinor: 56_000, pct: 226.26 },
          },
          {
            categoryId: "cafe",
            label: "Кафе",
            color: "#111",
            currentMinor: 50_000,
            prevMinor: 1_000,
            delta: { diffMinor: 49_000, pct: null },
          },
        ]}
      />,
    );
    const food = screen.getByRole("row", { name: /Продукти/ });
    expect(food).toHaveTextContent(/226/);
    expect(food).toHaveTextContent("%");
    const cafe = screen.getByRole("row", { name: /Кафе/ });
    expect(cafe).toHaveTextContent(/490/);
    expect(cafe).not.toHaveTextContent("%");
  });
});
