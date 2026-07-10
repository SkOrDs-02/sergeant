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
});
