// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MiniLineChart, type MiniLineChartDataPoint } from "./MiniLineChart";

// jsdom ships MouseEvent but older/minimal shims may lack PointerEvent; mirror
// the guard used by `useStoryGestures.test.tsx` so `fireEvent.pointerMove`
// carries a `pointerType`.
class FakePointerEvent extends MouseEvent {
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "mouse";
  }
}

beforeAll(() => {
  if (!("PointerEvent" in globalThis)) {
    (
      globalThis as unknown as { PointerEvent: typeof FakePointerEvent }
    ).PointerEvent = FakePointerEvent;
  }
});

afterEach(cleanup);

function points(values: Array<number | null>): MiniLineChartDataPoint[] {
  return values.map((v, i) => ({ value: v, label: `d${i}` }));
}

// jsdom doesn't lay out elements — getBoundingClientRect returns 0×0 unless
// stubbed. `width`/`height` here intentionally sit at the exact aspect
// ratio the chart guarantees via `max-h-[160px]` + `max-w-[512px]` (both
// 3.2:1, matching the `viewBox="0 0 320 100"`), i.e. the "known scale"
// the CSS fix promises: no SVG letterboxing, so `useChartScrub`'s
// `(clientX - rect.left) / rect.width * viewBoxWidth` formula is exact.
function stubRect(el: Element, width: number, height: number) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    }),
  });
}

describe("MiniLineChart", () => {
  it("renders an empty-state when there are no numeric points", () => {
    render(<MiniLineChart data={[]} unit="кг" color="#f00" />);
    expect(screen.getByText("Немає числових даних")).toBeInTheDocument();
  });

  it("renders the too-few-points state with a single value", () => {
    render(<MiniLineChart data={points([80])} unit="кг" color="#f00" />);
    expect(screen.getByText("Замало точок для лінії")).toBeInTheDocument();
  });

  it("renders an SVG chart for two or more points", () => {
    render(
      <MiniLineChart
        data={points([80, 81, 82])}
        unit="кг"
        color="#00ff00"
        metricLabel="вагу"
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("aria-label", expect.stringContaining("вагу"));
    expect(img).toHaveAttribute("aria-describedby", "fizruk-mini-line-вагу");
    expect(document.getElementById("fizruk-mini-line-вагу")).toHaveClass(
      "sr-only",
    );
    // Last value rendered in the footer (value + unit, split across nodes).
    expect(
      screen.getByText((_content, el) => el?.textContent === "82 кг"),
    ).toBeInTheDocument();
  });

  it("shows a positive delta with a + sign", () => {
    render(<MiniLineChart data={points([80, 85])} unit="кг" color="#00f" />);
    expect(screen.getAllByText(/\+5,0 кг/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a negative delta", () => {
    render(<MiniLineChart data={points([85, 80])} unit="кг" color="#00f" />);
    expect(screen.getAllByText(/-5,0 кг/).length).toBeGreaterThanOrEqual(1);
  });

  describe("deltaDirection", () => {
    // Regression coverage: rising sleep/energy/mood must render success, not
    // the "watch out" warning tone the chart used to hardcode for any
    // positive delta.
    it("defaults to down-is-good: positive delta renders warning", () => {
      render(<MiniLineChart data={points([80, 85])} unit="кг" color="#00f" />);
      const label = screen.getByText((_c, el) => el?.textContent === "+5,0 кг");
      expect(label.className).toContain("text-warning-strong");
    });

    it("defaults to down-is-good: negative delta renders success", () => {
      render(<MiniLineChart data={points([85, 80])} unit="кг" color="#00f" />);
      const label = screen.getByText((_c, el) => el?.textContent === "-5,0 кг");
      expect(label.className).toContain("text-success-strong");
    });

    it("up-is-good: positive delta (more sleep) renders success, not warning", () => {
      render(
        <MiniLineChart
          data={points([6, 8])}
          unit="год"
          color="#00f"
          deltaDirection="up-is-good"
        />,
      );
      const label = screen.getByText(
        (_c, el) => el?.textContent === "+2,0 год",
      );
      expect(label.className).toContain("text-success-strong");
      expect(label.className).not.toContain("text-warning-strong");
    });

    it("up-is-good: negative delta (less sleep) renders warning, not success", () => {
      render(
        <MiniLineChart
          data={points([8, 6])}
          unit="год"
          color="#00f"
          deltaDirection="up-is-good"
        />,
      );
      const label = screen.getByText(
        (_c, el) => el?.textContent === "-2,0 год",
      );
      expect(label.className).toContain("text-warning-strong");
      expect(label.className).not.toContain("text-success-strong");
    });

    it("neutral: positive delta uses neither success nor warning colour", () => {
      render(
        <MiniLineChart
          data={points([80, 85])}
          unit="кг"
          color="#00f"
          deltaDirection="neutral"
        />,
      );
      const label = screen.getByText((_c, el) => el?.textContent === "+5,0 кг");
      expect(label.className).not.toContain("text-success-strong");
      expect(label.className).not.toContain("text-warning-strong");
      expect(label.className).toContain("text-subtle");
    });
  });

  it("handles gaps (null points) without crashing", () => {
    render(
      <MiniLineChart
        data={points([80, null, 82, 83, null, 85])}
        unit="%"
        color="#abc"
      />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders many points (label thinning path)", () => {
    render(
      <MiniLineChart
        data={points([70, 71, 72, 73, 74, 75, 76])}
        unit="кг"
        color="#123"
      />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  describe("scrub coordinate mapping (#2 letterbox fix)", () => {
    it("keeps the box aspect-locked to the viewBox so it never letterboxes", () => {
      render(
        <MiniLineChart
          data={points([80, 81, 82, 83])}
          unit="кг"
          color="#f00"
        />,
      );
      const svg = screen.getByRole("img");
      // viewBox is 320×100 (3.2:1); the CSS cap pair must preserve that
      // exact ratio (160 * 3.2 = 512) or the SVG's default
      // `preserveAspectRatio="xMidYMid meet"` letterboxes the content and
      // scrub coordinates drift off the cursor on wide desktop layouts.
      expect(svg).toHaveClass("max-h-[160px]");
      expect(svg).toHaveClass("max-w-[512px]");
      expect(512 / 160).toBeCloseTo(320 / 100);
    });

    it("resolves the pointer to the nearest data point at a known (letterbox-free) scale", () => {
      const { container } = render(
        <MiniLineChart
          data={points([80, 81, 82, 83])}
          unit="кг"
          color="#f00"
        />,
      );
      const svg = container.querySelector("svg") as SVGSVGElement;
      // Scale factor 1.6 (512 / 320) — the exact scale the max-w/max-h pair
      // allows, i.e. a properly aspect-matched (non-letterboxed) box.
      stubRect(svg, 512, 160);
      // padL=40, innerW=320-40-8=272, step=272/3 → x of index 2 ≈ 221.33
      // (viewBox units); scaled by 1.6 → clientX ≈ 354.13.
      fireEvent.pointerMove(svg, {
        clientX: 354.13,
        clientY: 80,
        pointerType: "mouse",
      });
      // Both the SVG tooltip and the footer value switch to the scrubbed
      // point once a valid index resolves — assert at least one match
      // rather than pinning the exact count of duplicate text nodes.
      expect(
        screen.getAllByText((_c, el) => el?.textContent === "82,0 кг").length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("uses the surface token (not a static white) for the point-dot halo (#4)", () => {
    const { container } = render(
      <MiniLineChart data={points([80, 81, 82])} unit="кг" color="#00ff00" />,
    );
    const dots = container.querySelectorAll("circle[stroke]");
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot) => {
      expect(dot.getAttribute("stroke")).toBe("rgb(var(--c-panel))");
    });
  });

  it("allows vertical page scroll during scrub (#3 — pan-y, not touch-none)", () => {
    render(
      <MiniLineChart data={points([80, 81, 82])} unit="кг" color="#f00" />,
    );
    const svg = screen.getByRole("img");
    expect(svg).toHaveClass("touch-pan-y");
    expect(svg).not.toHaveClass("touch-none");
  });
});
