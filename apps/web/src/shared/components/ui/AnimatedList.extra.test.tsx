// @vitest-environment jsdom
/**
 * Tests for AnimatedList + the AnimatedFadeIn / AnimatedSlideIn /
 * AnimatedScale single-item wrappers.
 *
 * IntersectionObserver is stubbed so we can drive the "scrolled into
 * view" trigger deterministically and assert the initial→animate class
 * swap and stagger-delay inline styles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

type IOEntryList = Array<{ isIntersecting: boolean }>;
let ioCallback: ((entries: IOEntryList) => void) | null = null;
const observeSpy = vi.fn();
const disconnectSpy = vi.fn();

class MockIO {
  constructor(cb: (entries: IOEntryList) => void) {
    ioCallback = cb;
  }
  observe = observeSpy;
  disconnect = disconnectSpy;
  unobserve = vi.fn();
  takeRecords = vi.fn();
}

beforeEach(() => {
  ioCallback = null;
  vi.stubGlobal("IntersectionObserver", MockIO);
  // Default: motion is allowed (no reduced-motion).
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

import {
  AnimatedList,
  AnimatedFadeIn,
  AnimatedSlideIn,
  AnimatedScale,
} from "./AnimatedList";

function triggerInView() {
  act(() => {
    ioCallback?.([{ isIntersecting: true }]);
  });
}

describe("AnimatedList", () => {
  it("renders each child wrapped in a positioned div", () => {
    render(
      <AnimatedList>
        {[<span key="1">A</span>, <span key="2">B</span>]}
      </AnimatedList>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("starts in the initial (hidden) state before intersecting", () => {
    render(<AnimatedList>{[<span key="1">A</span>]}</AnimatedList>);
    const wrapper = screen.getByText("A").parentElement as HTMLElement;
    // slideUp initial = opacity-0 translate-y-4
    expect(wrapper.className).toContain("opacity-0");
  });

  it("swaps to the animate state once scrolled into view, with stagger delay", () => {
    render(
      <AnimatedList staggerDelay={80}>
        {[<span key="1">A</span>, <span key="2">B</span>]}
      </AnimatedList>,
    );
    triggerInView();
    const wrapperA = screen.getByText("A").parentElement as HTMLElement;
    const wrapperB = screen.getByText("B").parentElement as HTMLElement;
    expect(wrapperA.className).toContain("opacity-100");
    // Second item carries a 1 * 80ms stagger delay.
    expect(wrapperB.getAttribute("style")).toContain("80ms");
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it("stays hidden when the observer reports a non-intersecting entry", () => {
    render(<AnimatedList>{[<span key="1">A</span>]}</AnimatedList>);
    act(() => {
      ioCallback?.([{ isIntersecting: false }]);
    });

    const wrapper = screen.getByText("A").parentElement as HTMLElement;
    expect(wrapper.className).toContain("opacity-0");
    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it("triggerOnView=false animates immediately without an observer", () => {
    render(
      <AnimatedList triggerOnView={false}>
        {[<span key="1">A</span>]}
      </AnimatedList>,
    );
    const wrapper = screen.getByText("A").parentElement as HTMLElement;
    expect(wrapper.className).toContain("opacity-100");
  });

  it("supports the 'scale' animation style", () => {
    render(
      <AnimatedList animation="scale" triggerOnView={false}>
        {[<span key="1">A</span>]}
      </AnimatedList>,
    );
    const wrapper = screen.getByText("A").parentElement as HTMLElement;
    expect(wrapper.className).toContain("scale-100");
  });

  it("wraps a single (non-array) child", () => {
    render(
      <AnimatedList>
        {(<span key="solo">Solo</span>) as unknown as never}
      </AnimatedList>,
    );
    expect(screen.getByText("Solo")).toBeInTheDocument();
  });
});

describe("AnimatedList — reduced motion", () => {
  it("collapses to the final state when prefers-reduced-motion is set", () => {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(<AnimatedList>{[<span key="1">A</span>]}</AnimatedList>);
    const wrapper = screen.getByText("A").parentElement as HTMLElement;
    expect(wrapper.className).toContain("opacity-100");
    // No inline transition style applied under reduced motion.
    expect(wrapper.getAttribute("style")).toBeNull();
  });
});

describe("AnimatedFadeIn + wrappers", () => {
  it("renders children and animates in on intersection", () => {
    const { container } = render(
      <AnimatedFadeIn delay={120}>
        <p>Hello</p>
      </AnimatedFadeIn>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    triggerInView();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("opacity-100");
    expect(wrapper.getAttribute("style")).toContain("120ms");
  });

  it("AnimatedFadeIn with triggerOnView=false is visible immediately", () => {
    const { container } = render(
      <AnimatedFadeIn triggerOnView={false}>
        <p>Now</p>
      </AnimatedFadeIn>,
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "opacity-100",
    );
  });

  it("AnimatedSlideIn renders its child", () => {
    render(
      <AnimatedSlideIn>
        <p>Slide</p>
      </AnimatedSlideIn>,
    );
    expect(screen.getByText("Slide")).toBeInTheDocument();
  });

  it("AnimatedScale renders its child", () => {
    render(
      <AnimatedScale>
        <p>Scale</p>
      </AnimatedScale>,
    );
    expect(screen.getByText("Scale")).toBeInTheDocument();
  });
});
