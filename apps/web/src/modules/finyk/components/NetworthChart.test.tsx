// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NetworthChart } from "./NetworthChart";

describe("NetworthChart", () => {
  it("renders nothing without data", () => {
    const { container } = render(<NetworthChart />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing with fewer than two points", () => {
    const { container } = render(
      <NetworthChart data={[{ month: "2026-01", networth: 100 }]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an svg with a polyline and month labels for an upward trend", () => {
    const { container } = render(
      <NetworthChart
        data={[
          { month: "2026-01", networth: 1000 },
          { month: "2026-02", networth: 2000 },
          { month: "2026-03", networth: 3500 },
        ]}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-describedby", "finyk-networth-summary");
    expect(svg).toHaveAttribute("role", "img");
    expect(document.getElementById("finyk-networth-summary")).toHaveClass(
      "sr-only",
    );
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(container.querySelector("polygon")).not.toBeNull();
    // Ukrainian month labels for Jan/Feb/Mar.
    expect(container.textContent).toContain("Січ");
    expect(container.textContent).toContain("Бер");
    // First/last value labels are abbreviated with ₴ ("к" for thousands).
    expect(container.textContent).toContain("₴");
  });

  it("draws a zero line when data spans negative and positive values", () => {
    const { container } = render(
      <NetworthChart
        data={[
          { month: "2026-01", networth: -500 },
          { month: "2026-02", networth: 800 },
        ]}
      />,
    );
    // The zero baseline is a <line>; only present when min<0 && max>0.
    expect(container.querySelector("line")).not.toBeNull();
  });

  it("thins month labels when there are enough points to collide (bug fix)", () => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      networth: 1000 + i * 100,
    }));
    const { container } = render(<NetworthChart data={data} />);
    // Month labels live in <text> elements with the shared chartTick
    // className; the polyline/value labels use a different className, so
    // filter down to the tick-styled texts only.
    const monthTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("text-anchor") === "middle",
    );
    // 12 points must not render 12 collided labels — always keep first
    // and last, thinned in between.
    expect(monthTexts.length).toBeLessThan(12);
    expect(monthTexts.length).toBeGreaterThanOrEqual(2);
    expect(monthTexts[0]?.textContent).toBe("Січ");
    expect(monthTexts.at(-1)?.textContent).toBe("Груд");
  });

  it("keeps minimum spacing between adjacent month labels when the series is unaligned with the tick step (review fix)", () => {
    // 11 points: labelStep does not divide (length-1) evenly, so the forced
    // final label could land right next to the last periodic label unless
    // periodic ticks within labelStep of the end are suppressed.
    const data = Array.from({ length: 11 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      networth: 1000 + i * 100,
    }));
    const { container } = render(<NetworthChart data={data} />);
    const xs = Array.from(container.querySelectorAll("text"))
      .filter((t) => t.getAttribute("text-anchor") === "middle")
      .map((t) => Number(t.getAttribute("x")))
      .sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    // ~20 viewBox units fit a short month label; adjacent labels closer
    // than that visually collide at the rendered size.
    const MIN_GAP = 20;
    for (let i = 1; i < xs.length; i++) {
      const prev = xs[i - 1];
      const curr = xs[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      expect((curr as number) - (prev as number)).toBeGreaterThanOrEqual(
        MIN_GAP,
      );
    }
  });

  it("keeps every month label for a short series (no thinning needed)", () => {
    const { container } = render(
      <NetworthChart
        data={[
          { month: "2026-01", networth: 1000 },
          { month: "2026-02", networth: 2000 },
          { month: "2026-03", networth: 3500 },
        ]}
      />,
    );
    const monthTexts = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("text-anchor") === "middle",
    );
    expect(monthTexts).toHaveLength(3);
  });

  it("clamps the value label inside the viewBox and flips below the point near the top edge (bug fix)", () => {
    // A sharp spike on the last point pushes its y-position near the top
    // (viewBox top = 0, plot top = PAD.top = 10) — the label must not
    // paint above y=8 nor overlap the card header.
    const { container } = render(
      <NetworthChart
        data={[
          { month: "2026-01", networth: 0 },
          { month: "2026-02", networth: 100000 },
        ]}
      />,
    );
    const valueLabel = Array.from(container.querySelectorAll("text")).find(
      (t) =>
        t.textContent?.includes("₴") && t.getAttribute("text-anchor") === "end",
    );
    expect(valueLabel).toBeDefined();
    const y = Number(valueLabel?.getAttribute("y"));
    expect(y).toBeGreaterThanOrEqual(8);
  });
});
