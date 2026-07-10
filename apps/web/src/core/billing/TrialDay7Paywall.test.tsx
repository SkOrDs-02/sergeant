/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { BillingStatusResponse } from "@sergeant/shared";

const { statusMock, trackEventMock } = vi.hoisted(() => ({
  statusMock:
    vi.fn<
      (opts?: { signal?: AbortSignal }) => Promise<BillingStatusResponse>
    >(),
  trackEventMock: vi.fn(),
}));

// Control the A/B variant deterministically — bypasses useAuth() so the
// test does not need an AuthProvider tree.
vi.mock("./featureFlags", () => ({
  useTrialDay7Variant: () => "B" as const,
  resolvePaywallTrialDay7Copy: () => "B" as const,
  PAYWALL_TRIAL_DAY7_COPY_FLAG: "paywall_trial_day7_copy",
}));

vi.mock("../observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return {
    ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS,
    trackEvent: (name: string, payload?: unknown) =>
      trackEventMock(name, payload),
  };
});

vi.mock("@shared/api", () => ({
  billingApi: { status: statusMock, createCheckout: vi.fn() },
}));

import { TrialDay7Paywall } from "./TrialDay7Paywall";

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const NOW = new Date("2026-07-09T12:00:00.000Z").getTime();
const fixedNow = () => NOW;

function trialingResponse(hoursFromNow: number): BillingStatusResponse {
  const periodEnd = new Date(NOW + hoursFromNow * 60 * 60 * 1000);
  return {
    subscription: {
      id: 7,
      provider: "stripe",
      plan: "pro",
      status: "trialling",
      active: true,
      currentPeriodEnd: periodEnd.toISOString(),
    },
  };
}

describe("TrialDay7Paywall (CMP-72)", () => {
  beforeEach(() => {
    statusMock.mockReset();
    trackEventMock.mockClear();
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not mount while the billing query is in flight", () => {
    statusMock.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <Wrapper>
        <TrialDay7Paywall now={fixedNow} />
      </Wrapper>,
    );
    expect(container.textContent).toBe("");
  });

  it("does not open for a non-trialing subscription", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: 9,
        provider: "stripe",
        plan: "pro",
        status: "active",
        active: true,
        currentPeriodEnd: new Date(NOW + 60_000).toISOString(),
      },
    });
    const { container, findByText } = render(
      <Wrapper>
        <TrialDay7Paywall now={fixedNow} />
        <p>placeholder</p>
      </Wrapper>,
    );
    await findByText("placeholder");
    expect(container.textContent).not.toContain("Збережи свій ритм");
  });

  it("does not open when the trial still has more than 24h left", async () => {
    statusMock.mockResolvedValue(trialingResponse(48));
    const { findByText, container } = render(
      <Wrapper>
        <TrialDay7Paywall now={fixedNow} />
        <p>placeholder</p>
      </Wrapper>,
    );
    await findByText("placeholder");
    expect(container.textContent).not.toContain("Збережи свій ритм");
  });

  it("opens the day-7 paywall with variant B copy when ≤24h remain and fires paywall_viewed with variant", async () => {
    statusMock.mockResolvedValue(trialingResponse(5));
    render(
      <Wrapper>
        <TrialDay7Paywall now={fixedNow} />
      </Wrapper>,
    );
    const title = await screen.findByText("Збережи свій ритм");
    expect(title).toBeTruthy();
    // variant B social proof is rendered under the features list.
    expect(screen.getByText(/Зроблений в Україні медиком/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Зберегти Pro/ })).toBeTruthy();

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith("paywall_viewed", {
        surface: "trial_day7",
        variant: "B",
      });
    });
  });

  it("stays dismissed for this trial after closing (sessionStorage-keyed)", async () => {
    statusMock.mockResolvedValue(trialingResponse(3));
    const { unmount } = render(
      <Wrapper>
        <TrialDay7Paywall now={fixedNow} />
      </Wrapper>,
    );
    const dismiss = await screen.findByRole("button", { name: /Не зараз/ });
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith("paywall_viewed", {
        surface: "trial_day7",
        variant: "B",
      });
    });

    // The modal must not reopen on remount within the same tab.
    trackEventMock.mockClear();
    unmount();
    render(
      <Wrapper>
        <TrialDay7Paywall now={fixedNow} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(trackEventMock).not.toHaveBeenCalledWith(
        "paywall_viewed",
        expect.anything(),
      );
    });
  });
});
