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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { billingKeys } from "@shared/lib/api/queryKeys";

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
  billingApi: { createCheckout: createCheckoutMock, status: vi.fn() },
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

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPricing(initialUrl = "/pricing", queryClient = makeClient()) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <PricingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("PricingPage (Phase 7 D3 — Free + Premium)", () => {
  beforeEach(() => {
    submitMock.mockClear();
    createCheckoutMock.mockClear();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    toastInfoMock.mockClear();
    trackEventMock.mockClear();
  });
  afterEach(() => cleanup());

  it("fires PRICING_VIEWED on mount and renders two tier cards (Free + Premium)", () => {
    renderPricing();
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRICING_VIEWED,
      { source: "direct" },
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Free" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 3, name: "Premium" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Plus" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "Pro" })).toBeNull();
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

  it("opens Stripe Checkout when Pro CTA is pressed and tracks CHECKOUT_OPENED", async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: assignMock },
    });
    renderPricing();
    fireEvent.click(
      screen.getByRole("button", { name: /Спробувати Premium/i }),
    );
    await waitFor(() => {
      expect(createCheckoutMock).toHaveBeenCalledWith({ plan: "pro" });
    });
    expect(assignMock).toHaveBeenCalledWith(
      "https://checkout.stripe.com/c/pay/cs_test_123",
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRICING_CTA_CLICKED,
      expect.objectContaining({ cta: "stripe_checkout" }),
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CHECKOUT_OPENED,
      { plan: "pro", mode: "test" },
    );
  });

  it("falls back to the waitlist block when billing is unavailable", async () => {
    createCheckoutMock.mockRejectedValueOnce(new Error("billing down"));
    renderPricing();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Спробувати Premium/i })[0]!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Оплата тимчасово недоступна/i,
    );
    expect(document.getElementById("waitlist-anchor")).not.toBeNull();
  });

  // P1-8 (audit `2026-05-13-revenue-monetization-roast.md`): Stripe Checkout
  // повертає юзера на `/pricing?checkout=success|cancel|cancelled`. На success ми
  // інвалідовуємо `billingKeys.status` (щоб `usePlan` перевірив новий plan
  // без очікування на webhook) + success-toast із "Перейти у налаштування" action.
  // На cancelled виводимо нейтральний info-toast (без invalidate — підписка
  // не створена). У обох випадках чистимо `?checkout=...` з URL.
  describe("checkout return URL (P1-8)", () => {
    it("on ?checkout=success: invalidates billingKeys.status and shows success toast with settings action", async () => {
      const client = makeClient();
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");
      renderPricing("/pricing?checkout=success", client);

      await waitFor(() => {
        expect(toastSuccessMock).toHaveBeenCalledTimes(1);
      });

      const [msg, duration, action] = toastSuccessMock.mock.calls[0]!;
      expect(String(msg)).toMatch(/Підписку активовано/i);
      expect(duration).toBeUndefined();
      expect(action).toEqual(
        expect.objectContaining({
          label: "Перейти у налаштування",
          onClick: expect.any(Function),
        }),
      );

      // billingKeys.status інвалідується щонайменше раз із правильною
      // фабричною композицією (Hard Rule #2 — RQ keys лише через фабрики).
      const billingInvalidations = invalidateSpy.mock.calls.filter((call) => {
        const arg = call[0] as { queryKey?: unknown } | undefined;
        return (
          Array.isArray(arg?.queryKey) &&
          (arg.queryKey as ReadonlyArray<unknown>).join("|") ===
            billingKeys.status.join("|")
        );
      });
      expect(billingInvalidations.length).toBeGreaterThanOrEqual(1);

      expect(toastInfoMock).not.toHaveBeenCalled();
      expect(toastErrorMock).not.toHaveBeenCalled();
    });

    it("on ?checkout=cancelled: shows neutral info toast and does NOT invalidate billing status", async () => {
      const client = makeClient();
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");
      renderPricing("/pricing?checkout=cancelled", client);

      await waitFor(() => {
        expect(toastInfoMock).toHaveBeenCalledTimes(1);
      });
      expect(String(toastInfoMock.mock.calls[0]![0])).toMatch(
        /Оплату скасовано/i,
      );

      const billingInvalidations = invalidateSpy.mock.calls.filter((call) => {
        const arg = call[0] as { queryKey?: unknown } | undefined;
        return (
          Array.isArray(arg?.queryKey) &&
          (arg.queryKey as ReadonlyArray<unknown>).join("|") ===
            billingKeys.status.join("|")
        );
      });
      expect(billingInvalidations).toHaveLength(0);

      expect(toastSuccessMock).not.toHaveBeenCalled();
    });

    it("on ?checkout=cancel: accepts the server cancel_url spelling", async () => {
      const client = makeClient();
      renderPricing("/pricing?checkout=cancel", client);

      await waitFor(() => {
        expect(toastInfoMock).toHaveBeenCalledTimes(1);
      });
      expect(String(toastInfoMock.mock.calls[0]![0])).toMatch(
        /Оплату скасовано/i,
      );
      expect(toastSuccessMock).not.toHaveBeenCalled();
    });

    it("does NOT fire toast on plain /pricing (no checkout param)", () => {
      renderPricing("/pricing");
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(toastInfoMock).not.toHaveBeenCalled();
    });
  });
});
