// @vitest-environment jsdom
/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Integration test (T-7): component + hook + MSW.
 *
 * Drives `useMonoBackfillProgress` through a thin consumer component and a
 * *real* MSW handler for `GET /api/v1/mono/backfill-progress` (the api-client
 * prefix-rewrites `/api/mono/...` → `/api/v1/mono/...` in tests). This
 * exercises the full client path — `@sergeant/api-client` HTTP layer →
 * `monoWebhookApi.backfillProgress` → React Query cache keyed via
 * `finykKeys.monoBackfillProgress` → rendered DOM — instead of stubbing the
 * endpoint, so a contract drift in the request URL or response parsing
 * fails the test.
 *
 * Per-test handlers registered with `server.use(...)`; `server.resetHandlers()`
 * in `src/test/setup.ts` keeps suites isolated (T-7 risk note on handler leak).
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import type { MonoBackfillProgress } from "@shared/api";
import { server } from "../../../test/msw/server";
import { useMonoBackfillProgress } from "./useMonoBackfillProgress";

function snapshot(
  overrides: Partial<MonoBackfillProgress> = {},
): MonoBackfillProgress {
  return {
    status: "idle",
    startedAt: null,
    completedAt: null,
    accountsTotal: 0,
    accountsProcessed: 0,
    currentAccountId: null,
    transactionsProcessed: 0,
    lastError: null,
    ...overrides,
  };
}

function BackfillStatus() {
  const { progress, isCompleted, isFailed } = useMonoBackfillProgress();
  if (!progress) return <span>loading</span>;
  const label = isCompleted
    ? "completed"
    : isFailed
      ? "failed"
      : progress.status;
  return (
    <div>
      <span data-testid="status">{label}</span>
      <span data-testid="tx">{progress.transactionsProcessed}</span>
    </div>
  );
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("mono backfill progress · component + hook + MSW", () => {
  it("renders the completed snapshot fetched over the wire", async () => {
    server.use(
      http.get("*/api/v1/mono/backfill-progress", () =>
        HttpResponse.json(
          snapshot({
            status: "completed",
            accountsTotal: 2,
            accountsProcessed: 2,
            transactionsProcessed: 17,
            completedAt: "2026-01-15T10:05:00.000Z",
          }),
        ),
      ),
    );

    renderWithClient(<BackfillStatus />);

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("completed"),
    );
    expect(screen.getByTestId("tx")).toHaveTextContent("17");
  });

  it("surfaces a failed backfill from the endpoint", async () => {
    server.use(
      http.get("*/api/v1/mono/backfill-progress", () =>
        HttpResponse.json(
          snapshot({
            status: "failed",
            lastError: "upstream 502",
          }),
        ),
      ),
    );

    renderWithClient(<BackfillStatus />);

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("failed"),
    );
  });
});
