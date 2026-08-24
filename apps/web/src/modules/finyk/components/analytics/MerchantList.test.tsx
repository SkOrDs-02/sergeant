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

  it("needsKopecks flags only totals that round away entirely", () => {
    expect(needsKopecks(0.01)).toBe(true);
    expect(needsKopecks(0.4)).toBe(true);
    expect(needsKopecks(0)).toBe(false);
    expect(needsKopecks(1.2)).toBe(false);
    expect(needsKopecks(2600)).toBe(false);
  });
});
