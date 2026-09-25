// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MerchantList, needsKopecks } from "./MerchantList";

describe("MerchantList", () => {
  it("renders nothing for an empty list", () => {
    const { container } = render(<MerchantList merchants={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders ranked merchants with totals and counts", () => {
    render(
      <MerchantList
        merchants={[
          { name: "Сільпо", total: 5000, count: 12 },
          { name: "АТБ", total: 2500, count: 3 },
        ]}
      />,
    );
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("АТБ")).toBeInTheDocument();
    // Rank labels.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Count appears with a pluralized "times" label.
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  // Регресія: витрата на 0,01 ₴ малювалась як «0 ₴» — список стверджував,
  // що витрати не було, тоді як «Операції» показували −0,01 ₴.
  it("keeps a sub-hryvnia total visible instead of rounding it to zero", () => {
    const { container } = render(
      <MerchantList merchants={[{ name: "Копійка", total: 0.01, count: 1 }]} />,
    );
    const row = container.textContent ?? "";
    expect(row).toContain("0,01");
    // «0 ₴» — саме той рядок, який брехав, що витрати не було.
    expect(row).not.toMatch(/(^|\D)0\s*₴/u);
  });

  it("keeps whole-hryvnia totals free of decimal noise", () => {
    const { container } = render(
      <MerchantList merchants={[{ name: "Сільпо", total: 2600, count: 4 }]} />,
    );
    // Розряди й символ валюти розділені вузькими нерозривними пробілами,
    // тож звіряємо на тексті без будь-яких пробілів.
    expect((container.textContent ?? "").replace(/\s/gu, "")).toContain(
      "2600\u20b4",
    );
    expect(container.textContent).not.toContain(",00");
  });

  // PR-F3 (founder-UX audit wave 6, «Чесність показників»): the list never
  // accepted `showBalance`, so «Топ продавці» amounts stayed visible after
  // «Приховати суми» on Overview.
  it("masks merchant amounts when showBalance=false", () => {
    render(
      <MerchantList
        merchants={[
          { name: "Сільпо", total: 5000, count: 12 },
          { name: "АТБ", total: 2500, count: 3 },
        ]}
        showBalance={false}
      />,
    );
    expect(screen.queryByText(/5\s?000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2\s?500/)).not.toBeInTheDocument();
    expect(screen.getAllByText("••••").length).toBe(2);
  });

  // Р17: дельта до минулого місяця, відсоток лише з базою (Р4).
  it("shows a percent delta with a base and a hryvnia delta without one", () => {
    const { container } = render(
      <MerchantList
        merchants={[
          {
            key: "атб",
            name: "АТБ",
            total: 808,
            totalMinor: 80_750,
            count: 3,
            delta: { diffMinor: 56_000, pct: 226.26 },
          },
          {
            key: "кава",
            name: "Кава",
            total: 300,
            totalMinor: 30_000,
            count: 1,
            delta: { diffMinor: 30_000, pct: null },
          },
          { key: "сільпо", name: "Сільпо", total: 5, count: 1, delta: null },
        ]}
      />,
    );
    const text = (container.textContent ?? "").replace(/\s/gu, "");
    expect(text).toContain("226%");
    expect(text).toContain("300₴");
    expect(text).toMatch(/Сільпо5₴1раз$/u);
  });

  it("needsKopecks flags only totals that round away entirely", () => {
    expect(needsKopecks(0.01)).toBe(true);
    expect(needsKopecks(0.4)).toBe(true);
    expect(needsKopecks(0)).toBe(false);
    expect(needsKopecks(1.2)).toBe(false);
    expect(needsKopecks(2600)).toBe(false);
  });
});
