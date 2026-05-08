/**
 * Smoke test for the Finyk mobile module shell.
 *
 * After Phase 4 / "Overview page" PR, `FinykApp` is a thin wrapper that
 * renders the full Overview screen. We assert on a few stable Overview
 * surfaces (hero + planning copy, in-module nav grid) so this test is a
 * regression fence for the composition itself, not for individual card
 * internals (those have their own tests).
 *
 * `FinykApp` boots `useFinykDualWriteBoot` which calls `useUser()` from
 * `@sergeant/api-client/react`. That hook needs both an
 * `<ApiClientProvider>` (for the underlying ApiClient) and a
 * `<QueryClientProvider>` (for the React Query store). Without them
 * `FinykApp` throws in the boot hook and the surrounding
 * `ModuleErrorBoundary` (top-level wrapper) catches the error and
 * renders the "module crashed" fallback, hiding the surfaces we want
 * to assert on. Mirror the runtime provider tree from `app/_layout.tsx`
 * so render-tests see the real component, not the boundary fallback.
 */
import { render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider, apiQueryKeys } from "@sergeant/api-client/react";
import { createApiClient } from "@sergeant/api-client";
import type { ReactElement } from "react";

import { FinykApp } from "./FinykApp";

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const testUser = {
  user: {
    id: "test-user",
    email: "test@example.com",
    name: "Test User",
    image: null,
    emailVerified: true,
    createdAt: "2026-04-21T00:00:00.000Z",
  },
};

const testApiClient = createApiClient({
  baseUrl: "http://127.0.0.1",
  fetchImpl: async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(testUser),
    }) as Response,
});

function renderFinyk(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  // Pre-seed the `useUser` cache so the `me` query hydrates synchronously
  // without firing a fetch — we don't care about the user data here, only
  // that the dual-write boot hook receives a stable user id.
  queryClient.setQueryData(apiQueryKeys.me.current(), testUser);
  return render(
    <ApiClientProvider client={testApiClient}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe("FinykApp shell", () => {
  it("renders the Overview hero card", () => {
    renderFinyk(<FinykApp />);
    expect(screen.getByTestId("finyk-overview-hero")).toBeTruthy();
    expect(screen.getByText("Загальний нетворс")).toBeTruthy();
  });

  it("renders the in-module navigation grid", () => {
    renderFinyk(<FinykApp />);
    expect(screen.getByTestId("finyk-nav-grid-transactions")).toBeTruthy();
    expect(screen.getByTestId("finyk-nav-grid-budgets")).toBeTruthy();
    expect(screen.getByTestId("finyk-nav-grid-analytics")).toBeTruthy();
    expect(screen.getByTestId("finyk-nav-grid-assets")).toBeTruthy();
  });

  it("renders the networth empty-state on first-run data", () => {
    renderFinyk(<FinykApp />);
    // Networth history starts empty in the `useFinykOverviewData` stub
    // — we expect the "too few snapshots" placeholder, not the chart.
    expect(screen.getByTestId("finyk-overview-networth-empty")).toBeTruthy();
  });
});
