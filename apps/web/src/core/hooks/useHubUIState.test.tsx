// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
  Outlet,
} from "react-router-dom";
import { useHubUIState, type HubUIState } from "./useHubUIState";

// Wrapper that lets a test grab a `navigate` ref so it can swap the URL
// out-of-band (mimicking the `/profile → /?tab=profile` redirect in
// `App.tsx`) without going through `setHubView`.
function makeWrapper(initialEntries: string[]) {
  const navigateRef = {
    current: null as ReturnType<typeof useNavigate> | null,
  };

  function NavigateCapture() {
    navigateRef.current = useNavigate();
    return <Outlet />;
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<NavigateCapture />}>
            <Route path="*" element={<>{children}</>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  return { Wrapper, navigateRef };
}

describe("useHubUIState", () => {
  beforeEach(() => {
    // jsdom holds onto window.location.search across tests; MemoryRouter is
    // the source of truth here, so nothing to clean up.
  });

  it("initializes hubView from `?tab` on mount", () => {
    const { Wrapper } = makeWrapper(["/?tab=settings"]);
    const { result } = renderHook<HubUIState, void>(() => useHubUIState(), {
      wrapper: Wrapper,
    });
    expect(result.current.hubView).toBe("settings");
  });

  it("falls back to dashboard when `?tab` is missing or invalid", () => {
    const { Wrapper } = makeWrapper(["/?tab=bogus"]);
    const { result } = renderHook<HubUIState, void>(() => useHubUIState(), {
      wrapper: Wrapper,
    });
    expect(result.current.hubView).toBe("dashboard");
  });

  it("re-syncs hubView when the URL `?tab` changes via navigate()", () => {
    // Repro for the regression flagged by Devin Review on PR #1186: an
    // external `navigate("/?tab=profile")` (e.g. the legacy `/profile`
    // redirect) must activate the profile tab even though it doesn't go
    // through `setHubView`.
    const { Wrapper, navigateRef } = makeWrapper(["/profile"]);
    const { result } = renderHook<HubUIState, void>(() => useHubUIState(), {
      wrapper: Wrapper,
    });
    // No `?tab` on `/profile` → starts on dashboard.
    expect(result.current.hubView).toBe("dashboard");

    act(() => {
      navigateRef.current!("/?tab=profile", { replace: true });
    });

    expect(result.current.hubView).toBe("profile");
  });

  it("setHubView('reports') flips hubView immediately", () => {
    const { Wrapper } = makeWrapper(["/"]);
    const { result } = renderHook<HubUIState, void>(() => useHubUIState(), {
      wrapper: Wrapper,
    });
    expect(result.current.hubView).toBe("dashboard");
    act(() => {
      result.current.setHubView("reports");
    });
    expect(result.current.hubView).toBe("reports");
  });
});
