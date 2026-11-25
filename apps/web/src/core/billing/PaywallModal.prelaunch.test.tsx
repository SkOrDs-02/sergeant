/** @vitest-environment jsdom */
/**
 * ux-29 (рішення власника 2026-11-21): поки провайдерів оплати нуль, пейвол
 * не веде на /pricing до checkout-у, що впаде, а записує в лист очікування.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const { providersMock, submitMock, locationSpy, authState } = vi.hoisted(
  () => ({
    providersMock: vi.fn(),
    submitMock: vi.fn(),
    locationSpy: vi.fn(),
    authState: { email: "olena@example.com" as string | null },
  }),
);

vi.mock("./usePlan", () => ({
  usePlan: () => ({ access: { state: "free" } }),
}));

vi.mock("@shared/api", () => ({
  billingApi: { requestManualAccess: vi.fn(), providers: providersMock },
  waitlistApi: { submit: submitMock },
}));

vi.mock("../auth/AuthContext", () => ({
  useAuthOptional: () => ({
    status: "authenticated",
    user: { id: "u1", email: authState.email },
  }),
}));

vi.mock("../observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return { ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS, trackEvent: vi.fn() };
});

import { PaywallModal } from "./PaywallModal";

function LocationProbe() {
  const location = useLocation();
  locationSpy(`${location.pathname}${location.search}`);
  return null;
}

function renderModal(open = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/finyk"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LocationProbe />
                <PaywallModal
                  open={open}
                  onClose={() => {}}
                  surface="week_plan"
                  title="План на тиждень у Premium"
                  description="Premium складає меню на тиждень."
                />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PaywallModal до запуску оплати (ux-29)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.email = "olena@example.com";
    providersMock.mockResolvedValue({ providers: [] });
    submitMock.mockResolvedValue({ ok: true, created: true });
  });
  afterEach(() => cleanup());

  it("без провайдерів CTA записує в лист очікування і лишається на місці", async () => {
    renderModal();
    const cta = await screen.findByRole("button", {
      name: "Повідомити про запуск",
    });
    fireEvent.click(cta);
    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith({
        email: "olena@example.com",
        tier_interest: "pro",
        source: "paywall",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Ти в списку" }),
    ).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Email збережено. Напишу, щойно Premium запуститься.",
    );
    expect(locationSpy).not.toHaveBeenCalledWith("/pricing?source=paywall");
  });

  it("з провайдером CTA, як і раніше, веде на /pricing", async () => {
    providersMock.mockResolvedValue({ providers: ["liqpay"] });
    renderModal();
    await waitFor(() => expect(providersMock).toHaveBeenCalled());
    fireEvent.click(
      await screen.findByRole("button", { name: "Дивитися плани" }),
    );
    expect(locationSpy).toHaveBeenLastCalledWith("/pricing?source=paywall");
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("закритий пейвол не питає провайдерів", () => {
    renderModal(false);
    expect(providersMock).not.toHaveBeenCalled();
  });
});
