// @vitest-environment jsdom
/**
 * ux-29 (рішення власника 2026-11-21): поки жоден провайдер оплати не
 * увімкнений, Premium-CTA на /pricing не відкриває checkout, а записує в лист
 * очікування («Повідомити про запуск»).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@sergeant/api-client";
import { accessFixture } from "../test/helpers/billingAccess";

const {
  submitMock,
  createCheckoutMock,
  providersMock,
  statusMock,
  toastSuccessMock,
  toastErrorMock,
  toastInfoMock,
  trackEventMock,
  captureExceptionMock,
  authState,
} = vi.hoisted(() => ({
  submitMock: vi.fn(),
  createCheckoutMock: vi.fn(),
  providersMock: vi.fn(),
  statusMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  trackEventMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  authState: {
    status: "authenticated" as "authenticated" | "unauthenticated",
    email: "olena@example.com" as string | null,
  },
}));

vi.mock("@shared/api", () => ({
  waitlistApi: { submit: submitMock },
  billingApi: {
    createCheckout: createCheckoutMock,
    createPortal: vi.fn(),
    providers: providersMock,
    status: statusMock,
  },
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

vi.mock("./observability/sentry", () => ({
  captureException: captureExceptionMock,
}));

vi.mock("./auth/AuthContext", () => ({
  useAuthOptional: () => ({
    status: authState.status,
    user:
      authState.status === "authenticated"
        ? { id: "u1", email: authState.email }
        : null,
  }),
}));

import { PricingPage } from "./PricingPage";
import { ANALYTICS_EVENTS } from "@sergeant/shared";

function renderPricing(initialUrl = "/pricing") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="*" element={<p>sign-in-screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PricingPage до запуску оплати (ux-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = "authenticated";
    authState.email = "olena@example.com";
    submitMock.mockResolvedValue({ ok: true, created: true });
    providersMock.mockResolvedValue({ providers: [] });
    statusMock.mockResolvedValue({
      subscription: {
        active: false,
        id: null,
        plan: null,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      access: accessFixture("free"),
    });
  });
  afterEach(() => cleanup());

  it("без провайдерів CTA записує email сесії в лист очікування, а не відкриває checkout", async () => {
    renderPricing("/pricing?source=paywall");
    const cta = await screen.findByRole("button", {
      name: "Повідомити про запуск",
    });
    expect(
      screen.queryByRole("button", { name: /Спробувати Premium/i }),
    ).toBeNull();

    fireEvent.click(cta);

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith({
        email: "olena@example.com",
        tier_interest: "pro",
        source: "paywall",
      }),
    );
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: "Ти в списку" }),
    ).toBeDisabled();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Email збережено. Напишу, щойно Premium запуститься.",
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PRICING_CTA_CLICKED,
      { tier: "pro", cta: "notify_launch" },
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.WAITLIST_SUBMITTED,
      { tier_interest: "pro", source: "paywall", created: true },
    );
  });

  it("email, що вже в списку, — нейтральний тост, а не помилка", async () => {
    submitMock.mockResolvedValueOnce({ ok: true, created: false });
    renderPricing();
    fireEvent.click(
      await screen.findByRole("button", { name: "Повідомити про запуск" }),
    );
    await waitFor(() =>
      expect(toastInfoMock).toHaveBeenCalledWith(
        "Ти вже в списку. Напишу, щойно Premium запуститься.",
      ),
    );
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "pricing_page" }),
    );
  });

  it("невдалий запис лишає кнопку активною і каже, що робити", async () => {
    submitMock.mockRejectedValueOnce(new Error("offline"));
    renderPricing();
    fireEvent.click(
      await screen.findByRole("button", { name: "Повідомити про запуск" }),
    );
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Не вдалося записати тебе в список. Перевір звʼязок і спробуй ще раз.",
        undefined,
        expect.objectContaining({ label: "Повторити" }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Повідомити про запуск" }),
    ).not.toBeDisabled();
    // «Повторити» з тосту реально шле запит ще раз.
    const action = toastErrorMock.mock.calls[0]?.[2] as { onClick: () => void };
    action.onClick();
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", { name: "Ти в списку" }),
    ).toBeDisabled();
  });

  it("гість не стріляє в checkout (401), а йде до форми листа очікування", async () => {
    authState.status = "unauthenticated";
    renderPricing();
    const cta = screen.getByRole("button", { name: "Повідомити про запуск" });
    fireEvent.click(cta);
    expect(createCheckoutMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
    expect(providersMock).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("waitlist-email");
  });

  it("з увімкненим провайдером CTA лишається checkout-ом", async () => {
    providersMock.mockResolvedValue({ providers: ["liqpay"] });
    createCheckoutMock.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 400,
        url: "/api/billing/checkout",
        message: "nope",
        body: { error: "nope", code: "PROVIDER_UNAVAILABLE" },
      }),
    );
    renderPricing();
    const cta = await screen.findByRole("button", {
      name: /Спробувати Premium/i,
    });
    await waitFor(() => expect(providersMock).toHaveBeenCalled());
    fireEvent.click(cta);
    await waitFor(() => expect(createCheckoutMock).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Оплата тимчасово недоступна/i,
    );
    // Відсутній провайдер — очікуваний стан, не збій для Sentry.
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("401 від checkout-у веде на вхід, а не в «оплата недоступна»", async () => {
    providersMock.mockResolvedValue({ providers: ["liqpay"] });
    createCheckoutMock.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 401,
        url: "/api/billing/checkout",
        message: "unauthorized",
      }),
    );
    renderPricing();
    await waitFor(() => expect(providersMock).toHaveBeenCalled());
    fireEvent.click(
      await screen.findByRole("button", { name: /Спробувати Premium/i }),
    );
    expect(await screen.findByText("sign-in-screen")).toBeTruthy();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
