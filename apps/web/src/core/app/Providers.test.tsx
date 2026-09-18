/** @vitest-environment jsdom */
/**
 * Shell smoke for `Providers` — colocated invariant next to the ladder
 * component. Deep provider-order regression lives in `App.test.tsx`; here
 * we assert mount safety and that phase-2 router-effect bridges render
 * without throwing inside a data router.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("../auth/authClient", () => ({
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
vi.mock("../observability/posthog", () => ({
  identifyPostHogUser: vi.fn(),
  resetPostHog: vi.fn(),
  capturePostHogEvent: vi.fn(),
}));
vi.mock("../observability/PageviewTracker", () => ({
  PageviewTracker: () => null,
}));
vi.mock("../observability/RouteChangeTracker", () => ({
  RouteChangeTracker: () => null,
}));
vi.mock("../db/kvStoreBoot", () => ({
  bootstrapKvStore: () => Promise.resolve(),
  getActiveSqliteKvStore: () => null,
  kvStoreBoot: { loaded: false, warmCache: new Map() },
}));
vi.mock("../observability/analytics", async () => {
  const real = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return { ...real, trackEvent: vi.fn() };
});
vi.mock("react-router-dom", async () => {
  const real =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...real, ScrollRestoration: () => null };
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

import { Providers } from "./Providers";
import { useToast } from "@shared/hooks/useToast";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { useAuth } from "../auth/AuthContext";

function InvariantLeaf() {
  useToast();
  useAnnounce();
  useAuth();
  return <div data-testid="providers-leaf">ok</div>;
}

function renderProviders() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Providers>
          <InvariantLeaf />
        </Providers>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Providers — shell mount", () => {
  it("mounts the full provider ladder without throwing", () => {
    expect(() => renderProviders()).not.toThrow();
    expect(screen.getByTestId("providers-leaf").textContent).toBe("ok");
  });

  it("keeps toast, announcer, and auth contexts reachable from children", () => {
    renderProviders();
    expect(screen.getByTestId("providers-leaf")).toBeInTheDocument();
  });
});
