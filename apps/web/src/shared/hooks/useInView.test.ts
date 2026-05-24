// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useInView } from "./useInView";

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let capturedCallback: IOCallback | null = null;
let capturedNode: Element | null = null;

class MockIntersectionObserver {
  constructor(cb: IOCallback) {
    capturedCallback = cb;
  }
  observe(node: Element) {
    capturedNode = node;
  }
  disconnect() {
    capturedNode = null;
    capturedCallback = null;
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  capturedCallback = null;
  capturedNode = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInView", () => {
  it("starts as false before any observation fires", () => {
    const { result } = renderHook(() => useInView());
    const [, inView] = result.current;
    expect(inView).toBe(false);
  });

  it("attaches an IntersectionObserver to the ref'd node", () => {
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    const div = document.createElement("div");
    act(() => {
      ref(div);
    });
    expect(capturedNode).toBe(div);
  });

  it("flips to true on the first intersecting entry", () => {
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    const div = document.createElement("div");
    act(() => {
      ref(div);
    });
    act(() => {
      capturedCallback?.([{ isIntersecting: true }]);
    });
    const [, inView] = result.current;
    expect(inView).toBe(true);
  });

  it("stays false while the element is below the threshold", () => {
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    const div = document.createElement("div");
    act(() => {
      ref(div);
    });
    act(() => {
      capturedCallback?.([{ isIntersecting: false }]);
    });
    const [, inView] = result.current;
    expect(inView).toBe(false);
  });

  it("does not reattach the observer once inView is true", () => {
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    const div = document.createElement("div");
    act(() => {
      ref(div);
    });
    act(() => {
      capturedCallback?.([{ isIntersecting: true }]);
    });
    // Re-running ref with the same node should NOT create a new observer:
    // disconnect runs but observe does not, so capturedNode is null.
    const [ref2] = result.current;
    act(() => {
      ref2(div);
    });
    expect(capturedNode).toBeNull();
  });

  it("disconnects the observer when ref is called with null", () => {
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    const div = document.createElement("div");
    act(() => {
      ref(div);
    });
    expect(capturedNode).toBe(div);
    act(() => {
      ref(null);
    });
    expect(capturedNode).toBeNull();
  });

  it("falls back to inView=true when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => useInView());
    const [ref] = result.current;
    const div = document.createElement("div");
    act(() => {
      ref(div);
    });
    const [, inView] = result.current;
    expect(inView).toBe(true);
  });
});
