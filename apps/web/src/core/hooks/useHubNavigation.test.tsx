// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  Outlet,
} from "react-router-dom";
import { useHubNavigation, type HubNavigation } from "./useHubNavigation";

// `goToModuleSettings` calls into the analytics + recent-modules side
// effects. They are not the focus of this suite, so stub them to keep
// the assertions on the URL contract.
vi.mock("../observability/posthog", () => ({
  capturePostHogEvent: vi.fn(),
}));
vi.mock("../lib/recentModules", () => ({
  recordModuleOpen: vi.fn(),
}));

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

describe("useHubNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Repro for the bug the user flagged on 2026-05-08: tapping the gear
  // icon in `FizrukHeader` invoked `goToModuleSettings("fizruk")` and
  // navigated to `/#settings-fizruk`. The hash is correct, but
  // `useHubUIState` reads the active Hub tab from `?tab=...`, so without
  // the query param the Hub fell back to the Dashboard view — the user
  // landed on hub home with a hash that scrolled to nothing. The fix
  // routes through `/?tab=settings#settings-<id>` so the Settings tab
  // mounts AND the section anchor scrolls into view.
  it("goToModuleSettings('fizruk') navigates to /?tab=settings#settings-fizruk", () => {
    const { Wrapper, locationRef } = makeWrapper(["/?module=fizruk"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );

    act(() => {
      result.current.goToModuleSettings("fizruk");
    });

    expect(locationRef.current?.pathname).toBe("/");
    expect(locationRef.current?.search).toBe("?tab=settings");
    expect(locationRef.current?.hash).toBe("#settings-fizruk");
  });

  it("goToModuleSettings clears the active module before navigating", () => {
    const { Wrapper } = makeWrapper(["/?module=fizruk"]);
    const { result } = renderHook<HubNavigation, void>(
      () => useHubNavigation(),
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current.activeModule).toBe("fizruk");

    act(() => {
      result.current.goToModuleSettings("fizruk");
    });

    expect(result.current.activeModule).toBeNull();
  });
});
