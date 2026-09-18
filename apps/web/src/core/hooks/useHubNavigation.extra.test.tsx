// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  Outlet,
} from "react-router-dom";
import { useHubNavigation, type HubNavigation } from "./useHubNavigation";

const recordModuleOpen = vi.hoisted(() => vi.fn());
vi.mock("../observability/posthog", () => ({ capturePostHogEvent: vi.fn() }));
vi.mock("../lib/recentModules", () => ({ recordModuleOpen }));

function makeWrapper(initialEntries: string[]) {
  const locationRef = {
    current: null as ReturnType<typeof useLocation> | null,
  };
  function LocationCapture() {
    locationRef.current = useLocation();
    return <Outlet />;
  }
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<LocationCapture />}>
            <Route path="*" element={<>{children}</>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }
  return { Wrapper, locationRef };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
});

describe("initial module detection", () => {
  it("detects a path-based module from the pathname", () => {
    const { Wrapper } = makeWrapper(["/finyk"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    expect(result.current.activeModule).toBe("finyk");
  });

  it("detects a module from the ?module= query param", () => {
    const { Wrapper } = makeWrapper(["/?module=routine"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    expect(result.current.activeModule).toBe("routine");
  });

  it("is null on the hub root and for invalid ids", () => {
    const { Wrapper } = makeWrapper(["/?module=bogus"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    expect(result.current.activeModule).toBeNull();
  });
});

describe("openModule", () => {
  it("navigates to a clean path and records the open for path-based modules", () => {
    const { Wrapper, locationRef } = makeWrapper(["/"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    act(() => result.current.openModule("fizruk"));
    expect(recordModuleOpen).toHaveBeenCalledWith("fizruk");
    expect(locationRef.current?.pathname).toBe("/fizruk");
    expect(result.current.activeModule).toBe("fizruk");
    expect(result.current.moduleAnimClass).toBe("module-enter");
  });

  it("builds a path suffix from the hash option", () => {
    const { Wrapper, locationRef } = makeWrapper(["/"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    act(() => result.current.openModule("nutrition", { hash: "#log" }));
    expect(locationRef.current?.pathname).toBe("/nutrition/log");
  });

  it("ignores invalid and nullish ids", () => {
    const { Wrapper, locationRef } = makeWrapper(["/"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    act(() => result.current.openModule("nope"));
    act(() => result.current.openModule(null));
    act(() => result.current.openModule(undefined));
    expect(locationRef.current?.pathname).toBe("/");
    expect(recordModuleOpen).not.toHaveBeenCalled();
  });
});

describe("goToHub", () => {
  it("navigates to root and clears the active module", () => {
    const { Wrapper, locationRef } = makeWrapper(["/finyk"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );
    act(() => result.current.goToHub());
    expect(locationRef.current?.pathname).toBe("/");
    expect(result.current.activeModule).toBeNull();
    expect(result.current.moduleAnimClass).toBe("hub-enter");
  });
});
