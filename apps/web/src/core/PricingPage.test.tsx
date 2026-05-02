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
  toastSuccessMock,
  toastErrorMock,
  toastInfoMock,
  trackEventMock,
} = vi.hoisted(() => ({
  submitMock:
    vi.fn<(input: unknown) => Promise<{ ok: true; created: boolean }>>(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  trackEventMock: vi.fn(),
}));

submitMock.mockResolvedValue({ ok: true, created: true });

vi.mock("@shared/api", () => ({
  waitlistApi: { submit: submitMock },
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

  it("fires PRICING_CTA_CLICKED when a tier card CTA is pressed", () => {
    renderPricing();
    const proCta = screen.getAllByRole("button", {
      name: /Хочу дізнатись першим/i,
    });
    fireEvent.click(proCta[0]);
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRICING_CTA_CLICKED,
      expect.objectContaining({ cta: "waitlist" }),
    );
  });
});
