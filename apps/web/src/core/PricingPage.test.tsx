// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const {
  submitMock,
  createCheckoutMock,
  toastSuccessMock,
  toastErrorMock,
  toastInfoMock,
  trackEventMock,
} = vi.hoisted(() => ({
  submitMock:
    vi.fn<(input: unknown) => Promise<{ ok: true; created: boolean }>>(),
  createCheckoutMock: vi.fn<
    (input: unknown) => Promise<{
      ok: true;
      mode: "test";
      sessionId: string;
      url: string;
    }>
  >(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

submitMock.mockResolvedValue({ ok: true, created: true });
createCheckoutMock.mockResolvedValue({
  ok: true,
  mode: "test",
  sessionId: "cs_test_123",
  url: "https://checkout.stripe.com/c/pay/cs_test_123",
});

vi.mock("@shared/api", () => ({
  waitlistApi: { submit: submitMock },
  billingApi: { createCheckout: createCheckoutMock },
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    success: toastSuccessMock,
    error: toastErrorMock,
    info: toastInfoMock,
  }),
}));

vi.mock("./observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return {
    ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS,
    trackEvent: (name: string, payload?: unknown) =>
      trackEventMock(name, payload),
  };
});

import { PricingPage } from "./PricingPage";
import { ANALYTICS_EVENTS } from "@sergeant/shared";

function renderPricing(initialUrl = "/pricing") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <PricingPage />
    </MemoryRouter>,
  );
}

describe("PricingPage (Phase 0 monetization rails)", () => {
  beforeEach(() => {
    submitMock.mockClear();
    createCheckoutMock.mockClear();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    toastInfoMock.mockClear();
    trackEventMock.mockClear();
  });
  afterEach(() => cleanup());

  it("fires PRICING_VIEWED on mount and renders the three tier cards", () => {
    renderPricing();
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRICING_VIEWED,
      { source: "direct" },
    );
    // Tier headings present
    expect(
      screen.getByRole("heading", { level: 3, name: "Free" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Plus" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Pro" })).toBeTruthy();
  });

  it("submits the waitlist form and tracks the WAITLIST_SUBMITTED event", async () => {
    renderPricing();

    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, {
      target: { value: "alice@example.com" },
    });

    const submit = screen.getByRole("button", {
      name: /Підписатись на waitlist/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submitMock).toHaveBeenCalledTimes(1);
    });
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@example.com",
        tier_interest: "unsure",
        source: "pricing_page",
      }),
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.WAITLIST_SUBMITTED,
      expect.objectContaining({
        tier_interest: "unsure",
        source: "pricing_page",
        created: true,
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("shows an inline email error and skips the network call on invalid input", async () => {
    renderPricing();

    const emailInput = screen.getByLabelText(/email/i);
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.click(
      screen.getByRole("button", { name: /Підписатись на waitlist/i }),
    );

    await waitFor(() => {
      // Точний матч на inline-error по `id` — не плутаємо з <label>Email</label>.
      expect(document.getElementById("waitlist-email-error")).not.toBeNull();
    });
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("opens Stripe Checkout when a paid tier CTA is pressed", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: assignMock },
    });
    renderPricing();
    const proCta = screen.getAllByRole("button", {
      name: /Перейти до оплати/i,
    });
    fireEvent.click(proCta[0]!);
    await waitFor(() => {
      expect(createCheckoutMock).toHaveBeenCalledWith({ plan: "plus" });
    });
    expect(assignMock).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_123",
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRICING_CTA_CLICKED,
      expect.objectContaining({ cta: "stripe_checkout" }),
    );
  });

  it("falls back to the waitlist block when billing is unavailable", async () => {
    createCheckoutMock.mockRejectedValueOnce(new Error("billing down"));
    renderPricing();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Перейти до оплати/i })[0]!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Оплата тимчасово недоступна/i,
    );
    expect(document.getElementById("waitlist-anchor")).not.toBeNull();
  });
});
