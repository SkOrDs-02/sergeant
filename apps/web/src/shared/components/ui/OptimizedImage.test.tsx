/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import {
  OptimizedImage,
  OptimizedAvatar,
  OptimizedHeroImage,
  OptimizedThumbnail,
} from "./OptimizedImage";

afterEach(cleanup);

/**
 * OptimizedImage lazy-loads via IntersectionObserver unless `priority`.
 * jsdom has no IO, so we install a controllable mock that lets us flip
 * elements into view on demand.
 */
let ioInstances: Array<{ cb: IntersectionObserverCallback; el?: Element }>;

beforeEach(() => {
  ioInstances = [];
  class MockIO {
    cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
      ioInstances.push({ cb });
    }
    observe = (el: Element) => {
      const inst = ioInstances.find((i) => i.cb === this.cb);
      if (inst) inst.el = el;
    };
    unobserve = () => {};
    disconnect = () => {};
    takeRecords = () => [];
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal(
    "IntersectionObserver",
    MockIO as unknown as typeof IntersectionObserver,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function enterView() {
  act(() => {
    for (const inst of ioInstances) {
      inst.cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }
  });
}

describe("OptimizedImage", () => {
  it("priority images render immediately (no IO gate) with eager loading", () => {
    render(<OptimizedImage src="/hero.jpg" alt="Hero" priority />);
    const img = screen.getByAltText("Hero") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("non-priority images stay out of the DOM until they intersect", () => {
    render(<OptimizedImage src="/late.jpg" alt="Late" />);
    expect(screen.queryByAltText("Late")).toBeNull();
    enterView();
    const img = screen.getByAltText("Late") as HTMLImageElement;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("fetchpriority")).toBe("auto");
  });

  it("shows a skeleton placeholder until the image loads, then removes it", () => {
    const { container } = render(
      <OptimizedImage src="/x.jpg" alt="X" priority />,
    );
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    fireEvent.load(screen.getByAltText("X"));
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("invokes onImageLoad on load and onImageError on error", () => {
    const onImageLoad = vi.fn();
    const onImageError = vi.fn();
    render(
      <OptimizedImage
        src="/x.jpg"
        alt="X"
        priority
        onImageLoad={onImageLoad}
        onImageError={onImageError}
      />,
    );
    fireEvent.load(screen.getByAltText("X"));
    expect(onImageLoad).toHaveBeenCalledTimes(1);
  });

  it("renders the default error fallback (role=img) when the image errors", () => {
    render(<OptimizedImage src="/broken.jpg" alt="Broken" priority />);
    fireEvent.error(screen.getByAltText("Broken"));
    const fallback = screen.getByRole("img", { name: "Broken" });
    expect(fallback.querySelector("svg")).not.toBeNull();
  });

  it("renders a custom fallback element when provided and the image errors", () => {
    render(
      <OptimizedImage
        src="/broken.jpg"
        alt="Broken"
        priority
        fallback={<div data-testid="custom-fb">oops</div>}
      />,
    );
    fireEvent.error(screen.getByAltText("Broken"));
    expect(screen.getByTestId("custom-fb")).toBeInTheDocument();
  });

  it("applies aspectRatio style on the wrapper", () => {
    const { container } = render(
      <OptimizedImage src="/x.jpg" alt="X" aspectRatio="16/9" priority />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.aspectRatio).toBe("16/9");
  });
});

describe("OptimizedImage variants", () => {
  it("OptimizedAvatar applies a fixed size and rounded-full wrapper", () => {
    const { container } = render(
      <OptimizedAvatar src="/a.jpg" alt="Avatar" size={64} priority />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("rounded-full");
  });

  it("OptimizedHeroImage uses a 16/9 wrapper", () => {
    const { container } = render(
      <OptimizedHeroImage src="/h.jpg" alt="H" priority />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.aspectRatio).toBe("16/9");
    expect(wrapper.className).toContain("rounded-2xl");
  });

  it("OptimizedThumbnail maps size token to a width/height class", () => {
    const { container } = render(
      <OptimizedThumbnail src="/t.jpg" alt="T" size="lg" priority />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("w-24");
    expect(wrapper.className).toContain("h-24");
  });
});
