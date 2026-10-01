// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(
      screen.getByRole("button", { name: /місяць ще триває/ }),
    ).toBeInTheDocument();
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
    expect(
      screen.getAllByRole("button", { name: /суму приховано/ }),
    ).toHaveLength(2);
    expect(screen.queryByText(/У середньому/)).toBeNull();
  });

  // Раніше стовпці були `aria-hidden` дівами, а точна сума жила лише в
  // sr-only: побачити, скільки витрачено в серпні, можна було тільки за
  // висотою. Тепер стовпець тапається (патерн BarChart із хаб-звіту).
  describe("тап по стовпцю", () => {
    const bars = () => screen.getAllByRole("button", { name: /р\.: / });

    it("кожен стовпець — кнопка з підписом «місяць: сума», нічого не вибрано", () => {
      render(<MonthlyTrendBars points={points} />);
      expect(bars()).toHaveLength(2);
      expect(
        screen.getByRole("button", { name: /серпень 2026 р\.: 12\s?345\s?₴/ }),
      ).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByRole("button", {
          name: /вересень 2026 р\.: 3\s?000\s?₴, місяць ще триває/,
        }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("тап показує суму місяця над стовпцями й позначає кнопку натиснутою", () => {
      render(<MonthlyTrendBars points={points} />);
      const august = screen.getByRole("button", { name: /серпень 2026/ });

      fireEvent.click(august);

      expect(august).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByText(/^серпень 2026 р\.: 12\s?345\s?₴$/),
      ).toBeInTheDocument();
    });

    it("поточний місяць у рядку вибору лишається позначений як неповний", () => {
      render(<MonthlyTrendBars points={points} />);
      fireEvent.click(screen.getByRole("button", { name: /вересень 2026/ }));
      expect(
        screen.getByText(/^вересень 2026 р\.: 3\s?000\s?₴, місяць ще триває$/),
      ).toBeInTheDocument();
    });

    it("повторний тап знімає вибір, інший стовпець переносить його", () => {
      render(<MonthlyTrendBars points={points} />);
      const [august, september] = bars();

      fireEvent.click(august!);
      fireEvent.click(september!);
      expect(august).toHaveAttribute("aria-pressed", "false");
      expect(september).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByText(/^серпень 2026 р\.: /)).toBeNull();

      fireEvent.click(september!);
      expect(september).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByText(/^вересень 2026 р\.: /)).toBeNull();
    });

    it("«Приховати суми»: рядок вибору каже «суму приховано», число не світиться", () => {
      const { container } = render(
        <MonthlyTrendBars points={points} showBalance={false} />,
      );
      fireEvent.click(bars()[0]!);

      expect(
        screen.getByText(/^серпень 2026 р\.: суму приховано$/),
      ).toBeInTheDocument();
      expect(container).not.toHaveTextContent(/12\s?345/);
      expect(container.innerHTML).not.toMatch(/12\s?345/);
    });

    it("стовпці лишаються пунктами списку, а вибір не зсуває розкладку: рядок суми має фіксовану висоту", () => {
      const { container } = render(<MonthlyTrendBars points={points} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      const readout = container.querySelector(".h-4.mb-1");
      expect(readout).not.toBeNull();
      expect(readout).toBeEmptyDOMElement();
      fireEvent.click(bars()[0]!);
      expect(container.querySelector(".h-4.mb-1")).not.toBeEmptyDOMElement();
    });
  });
});

describe("CategoryDeltaTable", () => {
  const rows = [
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
    {
      categoryId: "transport",
      label: "Транспорт",
      color: "#222",
      currentMinor: 30_000,
      prevMinor: 45_000,
      delta: { diffMinor: -15_000, pct: -33.33 },
    },
  ];

  // Рішення власника 2026-10-01: у цій таблиці зміна завжди в гривнях,
  // навіть коли Р4 дозволяє відсоток (обидві суми вже в сусідніх колонках).
  it("зміна завжди в гривнях: і з базою для відсотка, і без неї", () => {
    render(<CategoryDeltaTable rows={rows} />);
    const food = screen.getByRole("row", { name: /Продукти/ });
    expect(food).toHaveTextContent(/\+560/);
    expect(food).toHaveTextContent("₴");
    expect(food).not.toHaveTextContent("%");
    expect(food).not.toHaveTextContent(/226/);
    const cafe = screen.getByRole("row", { name: /Кафе/ });
    expect(cafe).toHaveTextContent(/\+490/);
    expect(cafe).not.toHaveTextContent("%");
  });

  it("спад — зі знаком мінус і теж у гривнях", () => {
    render(<CategoryDeltaTable rows={rows} />);
    const transport = screen.getByRole("row", { name: /Транспорт/ });
    expect(transport).toHaveTextContent(/[-−]150/);
    expect(transport).toHaveTextContent("₴");
    expect(transport).not.toHaveTextContent("%");
  });

  it("без зміни (0 ₴ після округлення) колонка зміни порожня", () => {
    render(
      <CategoryDeltaTable
        rows={[
          {
            categoryId: "same",
            label: "Стабільна",
            color: "#333",
            currentMinor: 10_040,
            prevMinor: 10_000,
            delta: { diffMinor: 40, pct: 0.4 },
          },
        ]}
      />,
    );
    const row = screen.getByRole("row", { name: /Стабільна/ });
    expect(row).not.toHaveTextContent("%");
    expect(row).not.toHaveTextContent(/[+−-]\s?\d/);
  });

  it("«Приховати суми» ховає зміну разом із сумами", () => {
    render(<CategoryDeltaTable rows={rows} showBalance={false} />);
    const food = screen.getByRole("row", { name: /Продукти/ });
    expect(food).not.toHaveTextContent("₴");
    expect(food).not.toHaveTextContent(/560/);
  });
});
