// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
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

  it("передає явну ціль секції в router URL, зберігаючи інші параметри", () => {
    const { Wrapper } = makeWrapper([
      "/?tab=settings&group=advanced#settings-privacy",
    ]);
    const { result } = renderHook(
      () => ({ ui: useHubUIState(), location: useLocation() }),
      { wrapper: Wrapper },
    );
    act(() =>
      result.current.ui.setHubView("profile", { hash: "#profile-memory" }),
    );
    expect(result.current.ui.hubView).toBe("profile");
    expect(result.current.location.hash).toBe("#profile-memory");
    expect(result.current.location.search).toBe("?tab=profile&group=advanced");
  });

  it("initializes hubView from `?tab` on mount", () => {
    const { Wrapper } = makeWrapper(["/?tab=settings"]);
    const { result } = renderHook<HubUIState, void>(() => useHubUIState(), {
      wrapper: Wrapper,
    });
    expect(result.current.hubView).toBe("settings");
  });

  it.each(["#profile-memory", "#profile-account-deletion"])(
    "не переносить стару ціль %s у звичайні переходи вкладками, але зберігає її для Back",
    (hash) => {
      const { Wrapper, navigateRef } = makeWrapper([`/?tab=profile${hash}`]);
      const { result } = renderHook(
        () => ({ ui: useHubUIState(), location: useLocation() }),
        { wrapper: Wrapper },
      );

      act(() => result.current.ui.setHubView("dashboard"));
      expect(result.current.location.hash).toBe("");
      act(() => result.current.ui.setHubView("profile"));
      expect(result.current.location.hash).toBe("");
      act(() => navigateRef.current!(-1));
      expect(result.current.ui.hubView).toBe("dashboard");
      act(() => navigateRef.current!(-1));
      expect(result.current.ui.hubView).toBe("profile");
      expect(result.current.location.hash).toBe(hash);
    },
  );

  it("зберігає сторонні hashes і поважає явне очищення цілі", () => {
    const { Wrapper } = makeWrapper(["/?tab=settings#settings-privacy"]);
    const { result } = renderHook(
      () => ({ ui: useHubUIState(), location: useLocation() }),
      { wrapper: Wrapper },
    );
    act(() => result.current.ui.setHubView("dashboard"));
    expect(result.current.location.hash).toBe("#settings-privacy");
    act(() => result.current.ui.setHubView("profile", { hash: "" }));
    expect(result.current.location.hash).toBe("");
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
