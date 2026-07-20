/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { BillingStatusResponse } from "@sergeant/shared";

const { statusMock, createPortalMock, cancelMock } = vi.hoisted(() => ({
  statusMock:
    vi.fn<
      (opts?: { signal?: AbortSignal }) => Promise<BillingStatusResponse>
    >(),
  createPortalMock:
    vi.fn<
      (opts?: { signal?: AbortSignal }) => Promise<{ ok: true; url: string }>
    >(),
  cancelMock: vi.fn<() => Promise<{ ok: true }>>(),
}));

vi.mock("@shared/api", () => ({
  billingApi: {
    status: statusMock,
    createCheckout: vi.fn(),
    createPortal: createPortalMock,
    cancel: cancelMock,
  },
}));

import { PlanSection } from "./PlanSection";

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/settings"]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(
    <Wrapper>
      <PlanSection />
    </Wrapper>,
  );
}

async function openSection() {
  // SettingsGroup renders collapsed by default; the trigger button is the
  // section header. Open it so the body (badge + CTA) is queryable.
  const trigger = await screen.findByRole("button", {
    name: /Підписка та план/i,
  });
  fireEvent.click(trigger);
}

const FREE_RESPONSE: BillingStatusResponse = {
  subscription: {
    id: null,
    provider: null,
    plan: null,
    status: null,
    active: false,
    currentPeriodEnd: null,
  },
};

const PRO_ACTIVE_RESPONSE: BillingStatusResponse = {
  subscription: {
    id: 42,
    provider: "stripe",
    plan: "pro",
    status: "active",
    active: true,
    currentPeriodEnd: "2026-06-01T10:00:00.000Z",
  },
};

const PRO_CANCELED_RESPONSE: BillingStatusResponse = {
  subscription: {
    id: 43,
    provider: "stripe",
    plan: "pro",
    status: "canceled",
    active: true,
    currentPeriodEnd: "2026-05-30T10:00:00.000Z",
  },
};

const PRO_TRIAL_RESPONSE: BillingStatusResponse = {
  subscription: {
    id: 44,
    provider: "stripe",
    plan: "pro",
    status: "trialing",
    active: true,
    currentPeriodEnd: "2026-06-07T10:00:00.000Z",
  },
};

describe("PlanSection (audit P1-6 — Settings plan + manage subscription)", () => {
  beforeEach(() => {
    statusMock.mockReset();
    createPortalMock.mockReset();
    cancelMock.mockReset();
    createPortalMock.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/bps_test_42",
    });
    // jsdom's `location.assign` is a no-op; stub it so we can assert the
    // browser-navigation contract for the «Керувати підпискою» button.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: vi.fn() },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the Free badge + «Перейти на Pro» CTA when no active subscription is on file", async () => {
    statusMock.mockResolvedValue(FREE_RESPONSE);
    renderSection();
    await openSection();

    await waitFor(() => expect(statusMock).toHaveBeenCalled());

    const badge = await screen.findByTestId("plan-badge");
    expect(badge).toHaveTextContent("Free");

    expect(screen.getByTestId("plan-upgrade-button")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-manage-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-trial-info")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-canceled-info")).not.toBeInTheDocument();
  });

  it("shows the Pro badge + Manage button + next-charge date when subscription is active", async () => {
    statusMock.mockResolvedValue(PRO_ACTIVE_RESPONSE);
    renderSection();
    await openSection();

    const badge = await screen.findByTestId("plan-badge");
    await waitFor(() => expect(badge).toHaveTextContent("Pro"));

    const manage = screen.getByTestId("plan-manage-button");
    expect(manage).toHaveTextContent(/Керувати підпискою/i);
    expect(screen.queryByTestId("plan-upgrade-button")).not.toBeInTheDocument();

    const activeInfo = screen.getByTestId("plan-active-info");
    // Kyiv-local rendering of "2026-06-01T10:00:00Z" → "1 червня 2026 р."
    expect(within(activeInfo).getByText(/1 червня 2026/)).toBeInTheDocument();

    fireEvent.click(manage);
    await waitFor(() => {
      expect(createPortalMock).toHaveBeenCalledTimes(1);
    });
    expect(window.location.assign).toHaveBeenCalledWith(
      "https://billing.stripe.com/session/bps_test_42",
    );
  });

  it("shows the Pro badge + canceled warning with end date + Manage button when subscription is canceled but still in grace period", async () => {
    statusMock.mockResolvedValue(PRO_CANCELED_RESPONSE);
    renderSection();
    await openSection();

    const badge = await screen.findByTestId("plan-badge");
    await waitFor(() => expect(badge).toHaveTextContent("Pro"));

    const canceledInfo = screen.getByTestId("plan-canceled-info");
    expect(canceledInfo).toHaveTextContent(/скасовано/i);
    expect(canceledInfo).toHaveTextContent(/30 травня 2026/);

    expect(screen.getByTestId("plan-manage-button")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-active-info")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plan-trial-info")).not.toBeInTheDocument();
  });

  it("shows the trial end date and requires confirmation before canceling", async () => {
    statusMock.mockResolvedValue(PRO_TRIAL_RESPONSE);
    renderSection();
    await openSection();

    expect(await screen.findByTestId("plan-trial-info")).toHaveTextContent(
      /7 червня 2026/,
    );
    fireEvent.click(screen.getByTestId("plan-cancel-button"));
    expect(
      screen.getByTestId("plan-cancel-confirm-button"),
    ).toBeInTheDocument();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("shows the cancel error and leaves confirmation open when cancellation fails", async () => {
    statusMock.mockResolvedValue(PRO_TRIAL_RESPONSE);
    cancelMock.mockRejectedValue(new Error("cancel failed"));
    renderSection();
    await openSection();

    fireEvent.click(await screen.findByTestId("plan-cancel-button"));
    fireEvent.click(screen.getByTestId("plan-cancel-confirm-button"));

    expect(await screen.findByTestId("plan-cancel-error")).toHaveTextContent(
      /Не вдалося скасувати/,
    );
    expect(
      screen.getByTestId("plan-cancel-confirm-button"),
    ).toBeInTheDocument();
  });

  it("shows provider-neutral past_due copy for LiqPay subscribers", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: 45,
        provider: "liqpay",
        plan: "pro",
        status: "past_due",
        active: true,
        currentPeriodEnd: "2026-06-01T10:00:00.000Z",
      },
    });
    renderSection();
    await openSection();

    const pastDue = await screen.findByTestId("plan-past-due-info");
    expect(pastDue).toHaveTextContent(/Останній платіж не пройшов/i);
    expect(pastDue).toHaveTextContent(/спосіб оплати/i);
    expect(pastDue).not.toHaveTextContent(/Stripe/i);
    expect(screen.queryByTestId("plan-manage-button")).not.toBeInTheDocument();
  });

  it("shows Stripe portal past_due copy for legacy Stripe subscribers", async () => {
    statusMock.mockResolvedValue({
      subscription: {
        id: 46,
        provider: "stripe",
        plan: "pro",
        status: "past_due",
        active: true,
        currentPeriodEnd: "2026-06-01T10:00:00.000Z",
      },
    });
    renderSection();
    await openSection();

    const pastDue = await screen.findByTestId("plan-past-due-info");
    expect(pastDue).toHaveTextContent(/платіжному порталі/i);
    expect(screen.getByTestId("plan-manage-button")).toBeInTheDocument();
  });
});
