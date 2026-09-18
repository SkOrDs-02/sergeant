// @vitest-environment jsdom
/**
 * Tests for `RouteChangeTracker` — the side-effect-only RUM component that
 * brackets each top-level pathname transition with `beginRouteChange` /
 * `endRouteChange`.
 *
 * `routeChangePerf` is mocked so we can assert the begin/end call sequence
 * and timing semantics directly without exercising the analytics sink. rAF
 * is stubbed with a synchronous shim so the 2×rAF-scheduled `end` resolves
 * inside the test without fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";

const beginMock = vi.fn<(from: string, to: string) => void>();
const endMock = vi.fn<(to: string) => void>();

vi.mock("../lib/routeChangePerf", () => ({
  beginRouteChange: (from: string, to: string) => beginMock(from, to),
  endRouteChange: (to: string) => endMock(to),
}));

import { RouteChangeTracker } from "./RouteChangeTracker";

// Synchronous rAF shim: each rAF callback runs immediately, so the
// nested `requestAnimationFrame` chain that schedules `endRouteChange`
// completes within the synchronous navigation effect.
beforeEach(() => {
  beginMock.mockReset();
  endMock.mockReset();
  let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(
    (cb: FrameRequestCallback) => {
      id += 1;
      cb(performance.now());
      return id;
    },
  );
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RouteChangeTracker", () => {
  it("does not emit on initial mount (baseline only)", () => {
    render(
      <MemoryRouter initialEntries={["/finyk"]}>
        <RouteChangeTracker />
      </MemoryRouter>,
    );

    expect(beginMock).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });

  it("brackets a real pathname transition with begin → end", () => {
    function Nav(): null {
      const navigate = useNavigate();
      useEffect(() => {
        navigate("/fizruk");
      }, [navigate]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/finyk"]}>
        <RouteChangeTracker />
        <Routes>
          <Route path="/finyk" element={<Nav />} />
          <Route path="/fizruk" element={<div>fizruk</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(beginMock).toHaveBeenCalledTimes(1);
    expect(beginMock).toHaveBeenCalledWith("/finyk", "/fizruk");
    // 2×rAF shim runs synchronously → end fires for the new path.
    expect(endMock).toHaveBeenCalledTimes(1);
    expect(endMock).toHaveBeenCalledWith("/fizruk");
  });

  it("does not emit when only the query-string changes (same pathname)", () => {
    function Nav(): null {
      const navigate = useNavigate();
      useEffect(() => {
        navigate("/finyk?tab=week");
      }, [navigate]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/finyk"]}>
        <RouteChangeTracker />
        <Routes>
          <Route path="/finyk" element={<Nav />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(beginMock).not.toHaveBeenCalled();
    expect(endMock).not.toHaveBeenCalled();
  });

  it("renders nothing (returns null)", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <RouteChangeTracker />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
