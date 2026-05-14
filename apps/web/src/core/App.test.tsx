// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Web deep-dive 2026-05-03 §1.1 — provider tree invariant.
 *
 * The original `App.tsx` interleaved providers and effect-only siblings
 * (`ToastContainer`, `ShellDeepLinkBridge`, `HashRedirect`,
 * `ScrollRestoration`, `PageviewTracker`) in a single 70-line JSX
 * ladder. Reordering rows silently broke `useAnnounce()` / `useAuth()`
 * for downstream consumers and there was no test that caught it.
 *
 * `Providers` now owns the ladder. This test renders a deep child that
 * calls every context hook required by descendants (`useToast`,
 * `useAnnounce`, `useAuth`). If any provider is reordered out of the
 * leaf's reach — or removed entirely — the render throws and the test
 * fails. That is the invariant.
 *
 * Mocks below stub the side-effecting bridges (deep links / pageviews /
 * scroll restoration / Better Auth client) so the test boots without
 * network, Capacitor, or PostHog. They are intentionally minimal —
 * the goal is exercise the **shape** of the provider tree, not the
 * behaviour of individual providers (those have their own tests).
 */

vi.mock("./app/ShellDeepLinkBridge", () => ({
  ShellDeepLinkBridge: () => null,
}));
vi.mock("./app/HashRedirect", () => ({
  HashRedirect: () => null,
}));
vi.mock("./observability/PageviewTracker", () => ({
  PageviewTracker: () => null,
}));
vi.mock("./auth/authClient", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("./observability/posthog", () => ({
  identifyPostHogUser: vi.fn(),
  resetPostHog: vi.fn(),
}));
vi.mock("./observability/analytics", async () => {
  const real = await vi.importActual<
    typeof import("./observability/analytics")
  >("./observability/analytics");
  return {
    ...real,
    trackEvent: vi.fn(),
  };
});
vi.mock("react-router-dom", async () => {
  const real =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...real,
    // `ScrollRestoration` requires a data-router; under `MemoryRouter`
    // it warns. Stub it for this invariant test — covered by its own
    // tests in `apps/web/src/core/app/HashRedirect.test.tsx` etc.
    ScrollRestoration: () => null,
  };
});
vi.mock("@sergeant/api-client/react", async () => {
  const real = await vi.importActual<
    typeof import("@sergeant/api-client/react")
  >("@sergeant/api-client/react");
  return {
    ...real,
    useUser: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      isSuccess: true,
    }),
  };
});

import { Providers } from "./app/Providers";
import { useToast } from "@shared/hooks/useToast";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { useAuth } from "./auth/AuthContext";

function DeepestChild() {
  // Each of these throws when the corresponding provider is missing
  // from the ancestor chain — exactly the regression the invariant
  // guards against.
  const toast = useToast();
  const announcer = useAnnounce();
  const auth = useAuth();

  return (
    <div
      data-testid="invariant-leaf"
      data-toast={typeof toast.show}
      data-announce={typeof announcer.announce}
      data-auth-status={auth.status}
    >
      ok
    </div>
  );
}

function renderWithProviders() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Providers>
          <DeepestChild />
        </Providers>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<Providers /> — provider-tree invariant (Web deep-dive §1.1)", () => {
  it("the deepest descendant can call useToast(), useAnnounce(), and useAuth() without throwing", () => {
    const { getByTestId } = renderWithProviders();
    const leaf = getByTestId("invariant-leaf");
    expect(leaf.textContent).toBe("ok");
    expect(leaf.dataset["toast"]).toBe("function");
    expect(leaf.dataset["announce"]).toBe("function");
    // `useUser` mock returns `data: undefined` → `user = null` →
    // status is `"unauthenticated"`. The exact status is not the
    // invariant — `auth.status` simply must be defined, i.e.
    // `AuthProvider` is in the ancestor chain.
    expect(leaf.dataset["authStatus"]).toBeDefined();
  });

  it("renders the children exactly once (no provider remounts the subtree on its own)", () => {
    const renderSpy = vi.fn();
    function CountingChild() {
      renderSpy();
      // Touch each context so we still cover the invariant when the
      // test changes shape in the future.
      useToast();
      useAnnounce();
      useAuth();
      return null;
    }
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Providers>
            <CountingChild />
          </Providers>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // One initial render is enough — a remount would push this above 1
    // and signal that one of the providers fired an effect that
    // invalidated its own subtree before paint.
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
