/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import {
  AnimatedNumber,
  AnimatedCurrency,
  AnimatedPercent,
} from "./AnimatedNumber";

afterEach(cleanup);

/**
 * AnimatedNumber smooths a count-up via requestAnimationFrame + easeOutCubic.
 * jsdom has no `matchMedia` by default, so `prefersReducedMotion` is falsy
 * and the RAF animation path runs — we drive it with fake timers + a stubbed
 * `requestAnimationFrame`.
 */
describe("AnimatedNumber — formatting", () => {
  it("immediate mode renders the final value without animation", () => {
    const { container } = render(
      <AnimatedNumber value={1234} immediate decimals={0} />,
    );
    // uk-UA grouping uses a non-breaking space; normalise before asserting.
    const text = container.textContent?.replace(/\s/g, " ") ?? "";
    expect(text).toBe("1 234");
  });

  it("applies prefix and suffix around the formatted value", () => {
    const { container } = render(
      <AnimatedNumber value={50} immediate prefix="₴" suffix="%" />,
    );
    expect(container.textContent).toBe("₴50%");
  });

  it("honours decimals", () => {
    const { container } = render(
      <AnimatedNumber value={99.5} immediate decimals={1} />,
    );
    expect(container.textContent).toBe("99,5");
  });

  it("custom formatter overrides locale/formatOptions", () => {
    const { container } = render(
      <AnimatedNumber
        value={42}
        immediate
        formatter={(v) => `<<${v.toFixed(0)}>>`}
      />,
    );
    expect(container.textContent).toBe("<<42>>");
  });

  it("forwards className to the span (keeps tabular-nums)", () => {
    const { container } = render(
      <AnimatedNumber value={1} immediate className="custom-cls" />,
    );
    const span = container.querySelector("span");
    expect(span?.className).toContain("custom-cls");
    expect(span?.className).toContain("tabular-nums");
  });
});

describe("AnimatedNumber — animation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("animates from old to new value across RAF frames and settles on the target", () => {
    let now = 0;
    const cbs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cbs.push(cb);
      return cbs.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const flush = (ts: number) => {
      now = ts;
      const pending = cbs.splice(0, cbs.length);
      act(() => {
        for (const cb of pending) cb(now);
      });
    };

    const { container, rerender } = render(
      <AnimatedNumber value={0} duration={600} immediate />,
    );
    // Switch off immediate so the next value change animates.
    rerender(<AnimatedNumber value={0} duration={600} />);
    rerender(<AnimatedNumber value={100} duration={600} />);

    // First frame establishes the start timestamp (no progress yet).
    flush(0);
    // Mid-animation — value should be between start and end, not the target.
    flush(300);
    const mid = Number(container.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    // Past the duration — value snaps to the target.
    flush(600);
    expect(container.textContent).toBe("100");
  });
});

describe("AnimatedNumber — reduced motion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips animation and shows final value when prefers-reduced-motion is set", () => {
    vi.stubGlobal(
      "matchMedia",
      vi
        .fn()
        .mockReturnValue({ matches: true }) as unknown as typeof matchMedia,
    );
    // window.matchMedia is read off `window` — assign there too.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const { container, rerender } = render(<AnimatedNumber value={5} />);
    rerender(<AnimatedNumber value={900} />);
    expect(container.textContent).toBe("900");
  });
});

describe("AnimatedCurrency / AnimatedPercent", () => {
  it("AnimatedCurrency renders a currency-styled value", () => {
    const { container } = render(
      <AnimatedCurrency value={5000} immediate currency="UAH" />,
    );
    // Contains the digits regardless of symbol placement / spacing.
    expect(container.textContent?.replace(/\s/g, "")).toMatch(/5000/);
  });

  it("AnimatedPercent appends a % suffix", () => {
    const { container } = render(<AnimatedPercent value={75} immediate />);
    expect(container.textContent).toBe("75%");
  });
});
