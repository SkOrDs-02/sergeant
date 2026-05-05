/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProgressRing } from "./ProgressRing";

afterEach(cleanup);

describe("ProgressRing", () => {
  it("renders role=progressbar with aria-valuenow/min/max", () => {
    const { getByRole } = render(<ProgressRing value={42} max={100} />);
    const ring = getByRole("progressbar");
    expect(ring.getAttribute("aria-valuenow")).toBe("42");
    expect(ring.getAttribute("aria-valuemin")).toBe("0");
    expect(ring.getAttribute("aria-valuemax")).toBe("100");
  });

  it("clamps value into [0, max] for aria-valuenow", () => {
    const { getByRole, rerender } = render(
      <ProgressRing value={-10} max={100} />,
    );
    expect(getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");

    rerender(<ProgressRing value={200} max={100} />);
    expect(getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("defaults showPercent=true — renders rounded %", () => {
    const { getByRole } = render(<ProgressRing value={25} max={100} />);
    const ring = getByRole("progressbar");
    expect(ring.textContent).toBe("25%");
  });

  it("custom `label` overrides the percent text", () => {
    const { getByRole } = render(
      <ProgressRing value={3} max={10} label="3 з 10" />,
    );
    expect(getByRole("progressbar").textContent).toBe("3 з 10");
  });

  it("showPercent=false and no label — renders no text content", () => {
    const { getByRole } = render(
      <ProgressRing value={50} max={100} showPercent={false} />,
    );
    // Only the <svg> (aria-hidden) remains; no visible label span.
    const ring = getByRole("progressbar");
    const labelSpan = ring.querySelector("span");
    expect(labelSpan).toBeNull();
  });

  it("variant applies the module colour class to the container", () => {
    const { getByRole } = render(<ProgressRing value={50} variant="finyk" />);
    expect(getByRole("progressbar").className).toContain("text-finyk");
  });

  it("size prop controls the outer diameter in px", () => {
    const { getByRole, rerender } = render(
      <ProgressRing value={50} size="sm" />,
    );
    expect(getByRole("progressbar").style.width).toBe("48px");

    rerender(<ProgressRing value={50} size="xl" />);
    expect(getByRole("progressbar").style.width).toBe("128px");
  });

  it("svg renders filled arc with dashoffset scaled to value/max", () => {
    const { getByRole } = render(<ProgressRing value={50} max={100} />);
    const circles = getByRole("progressbar").querySelectorAll("circle");
    expect(circles.length).toBe(2);
    const filled = circles[1];
    const circumference = Number(filled!.getAttribute("stroke-dasharray")!);
    const offset = Number(filled!.getAttribute("stroke-dashoffset")!);
    // 50% → offset is ≈ circumference/2
    expect(offset).toBeCloseTo(circumference / 2, 2);
  });
});
