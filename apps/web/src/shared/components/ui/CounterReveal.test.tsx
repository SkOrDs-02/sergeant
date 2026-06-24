/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { CounterReveal } from "./CounterReveal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CounterReveal", () => {
  it("starts the tween from entranceFrom and animates toward value", () => {
    const cbs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cbs.push(cb);
      return cbs.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const flush = (ts: number) => {
      const pending = cbs.splice(0, cbs.length);
      act(() => {
        for (const cb of pending) cb(ts);
      });
    };

    const { container } = render(
      <CounterReveal value={100} entranceFrom={0} duration={800} />,
    );
    // Before any frame runs, display sits at entranceFrom.
    expect(container.textContent).toBe("0");

    flush(0); // establishes startTime
    flush(400); // mid-way
    const mid = Number(container.textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);

    flush(800); // complete
    expect(container.textContent).toBe("100");
  });

  it("renders value / max when max is provided", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { container } = render(
      <CounterReveal value={3} max={5} entranceFrom={3} />,
    );
    // entranceFrom === value path: no tween, display stays at 3.
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("/");
    expect(container.textContent).toContain("5");
  });

  it("uses a custom format callback for both value and max", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { container } = render(
      <CounterReveal
        value={10}
        max={20}
        entranceFrom={10}
        format={(n) => `₴${n.toFixed(0)}`}
      />,
    );
    expect(container.textContent).toContain("₴10");
    expect(container.textContent).toContain("₴20");
  });

  it("renders the final value instantly under prefers-reduced-motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const { container } = render(
      <CounterReveal value={555} entranceFrom={0} />,
    );
    expect(container.textContent).toBe("555");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
  });
});
