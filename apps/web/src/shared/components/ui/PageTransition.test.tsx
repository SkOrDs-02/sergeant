/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { PageTransition } from "./PageTransition";

afterEach(cleanup);

describe("PageTransition", () => {
  it("renders its children and applies the enter animation class for the direction", () => {
    const { container } = render(
      <PageTransition pageKey="a" direction="forward">
        <div>Page A</div>
      </PageTransition>,
    );
    expect(screen.getByText("Page A")).toBeInTheDocument();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("animate-slide-in-right");
    expect(wrapper.style.animationDuration).toBe("240ms");
  });

  it("uses the fade enter class when direction='fade'", () => {
    const { container } = render(
      <PageTransition pageKey="a" direction="fade">
        <div>X</div>
      </PageTransition>,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "animate-fade-in",
    );
  });

  it("plays exit then enter when pageKey changes, swapping content after the duration", () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(
        <PageTransition pageKey="a" direction="forward" duration={200}>
          <div>Page A</div>
        </PageTransition>,
      );
      rerender(
        <PageTransition pageKey="b" direction="forward" duration={200}>
          <div>Page B</div>
        </PageTransition>,
      );
      // During exit: old content still shown, exit animation applied.
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.className).toContain("animate-slide-out-left");
      expect(screen.getByText("Page A")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(200);
      });
      // After the timeout: new content shown, enter animation applied again.
      expect(screen.getByText("Page B")).toBeInTheDocument();
      expect(screen.queryByText("Page A")).toBeNull();
      expect((container.firstElementChild as HTMLElement).className).toContain(
        "animate-slide-in-right",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires onTransitionEnd after the transition completes", () => {
    vi.useFakeTimers();
    try {
      const onTransitionEnd = vi.fn();
      const { rerender } = render(
        <PageTransition
          pageKey="a"
          duration={150}
          onTransitionEnd={onTransitionEnd}
        >
          <div>A</div>
        </PageTransition>,
      );
      rerender(
        <PageTransition
          pageKey="b"
          duration={150}
          onTransitionEnd={onTransitionEnd}
        >
          <div>B</div>
        </PageTransition>,
      );
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onTransitionEnd).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates content in place when children change but pageKey stays the same", () => {
    const { rerender } = render(
      <PageTransition pageKey="same">
        <div>First</div>
      </PageTransition>,
    );
    rerender(
      <PageTransition pageKey="same">
        <div>Second</div>
      </PageTransition>,
    );
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByText("First")).toBeNull();
  });

  it("skips animation immediately under prefers-reduced-motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    const onTransitionEnd = vi.fn();
    const { rerender } = render(
      <PageTransition pageKey="a" onTransitionEnd={onTransitionEnd}>
        <div>A</div>
      </PageTransition>,
    );
    rerender(
      <PageTransition pageKey="b" onTransitionEnd={onTransitionEnd}>
        <div>B</div>
      </PageTransition>,
    );
    // No fake timers needed — reduced motion swaps synchronously in the effect.
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(onTransitionEnd).toHaveBeenCalledTimes(1);
    // Restore so other suites don't see a forced matchMedia.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: undefined,
    });
  });
});
