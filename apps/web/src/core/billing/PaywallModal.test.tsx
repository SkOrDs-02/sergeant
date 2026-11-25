/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@sergeant/api-client";

const { trackEventMock, navigateSpy, planState, requestManualAccessMock } =
  vi.hoisted(() => ({
    trackEventMock: vi.fn(),
    navigateSpy: vi.fn(),
    planState: {
      manualAccess: undefined as
        { available: boolean; requestedAt: string | null } | undefined,
    },
    requestManualAccessMock: vi.fn(),
  }));

// Знімок доступу: лише поле `manualAccess` має значення для пейволу.
vi.mock("./usePlan", () => ({
  usePlan: () => ({
    access:
      planState.manualAccess === undefined
        ? { state: "free" }
        : { state: "free", manualAccess: planState.manualAccess },
  }),
}));

vi.mock("@shared/api", () => ({
  billingApi: { requestManualAccess: requestManualAccessMock },
}));

vi.mock("../observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return {
    ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS,
    trackEvent: (name: string, payload?: unknown) =>
      trackEventMock(name, payload),
  };
});

import { PaywallModal } from "./PaywallModal";

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: Providers });
}
import { ANALYTICS_EVENTS } from "@sergeant/shared";

function LocationProbe() {
  const location = useLocation();
  navigateSpy(`${location.pathname}${location.search}`);
  return null;
}

function renderModal(open: boolean) {
  return render(
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
                surface="ai_chat_limit"
                title="AI-чат на ліміті"
                description="Free план: 5 запитів/день."
              />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PaywallModal", () => {
  beforeEach(() => {
    trackEventMock.mockClear();
    navigateSpy.mockClear();
    requestManualAccessMock.mockReset();
    planState.manualAccess = undefined;
  });
  afterEach(() => cleanup());

  it("fires `paywall_viewed` with the surface label only when open", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PaywallModal
          open={false}
          onClose={() => {}}
          surface="finyk_vision"
          title="CloudSync"
          description="Sync."
        />
      </MemoryRouter>,
    );
    expect(trackEventMock).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <PaywallModal
          open={true}
          onClose={() => {}}
          surface="finyk_vision"
          title="CloudSync"
          description="Sync."
        />
      </MemoryRouter>,
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PAYWALL_VIEWED,
      { surface: "finyk_vision" },
    );
  });

  it("renders the headline + description and a primary Pro CTA when open", () => {
    renderModal(true);
    expect(screen.getByText("AI-чат на ліміті")).toBeTruthy();
    expect(screen.getByText("Free план: 5 запитів/день.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Дивитися плани/ })).toBeTruthy();
  });

  // Trial дає лише новому акаунту і лише за прапорцем (спека access-tiers),
  // тож дефолтний список paywall-у не має обіцяти trial.
  it("does not promise a trial in the default feature list", () => {
    renderModal(true);
    expect(screen.queryByText(/trial/i)).toBeNull();
    expect(screen.queryByText(/привʼязки картки/i)).toBeNull();
    // Решта дефолтних булітів лишається на місці.
    expect(screen.getByText(/Сержант без ліміту/)).toBeInTheDocument();
    expect(screen.getByText(/PDF-звіти/)).toBeInTheDocument();
  });

  // ux-15: початковий фокус на «Закрити» робив пейвол вразливим до будь-якого
  // «залишкового» Enter/Space. Фокус має падати на основну CTA.
  it("moves initial focus to the primary CTA, not the close button", () => {
    renderModal(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Дивитися плани/ }),
    );
  });

  it("navigates to /pricing?source=paywall when the primary CTA is pressed", () => {
    renderModal(true);
    navigateSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Дивитися плани/ }));
    expect(navigateSpy).toHaveBeenLastCalledWith("/pricing?source=paywall");
  });

  it("uses custom labels/features and closes from the dismiss CTA", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <PaywallModal
          open
          onClose={onClose}
          surface="week_plan"
          title="Themes"
          description="Custom description"
          features={["Feature A", "Feature B"]}
          ctaLabel="Upgrade now"
          dismissLabel="Later"
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Feature A")).toBeInTheDocument();
    expect(screen.getByText("Feature B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires once per open transition, including after a close and reopen", () => {
    const onClose = vi.fn();
    const view = (open: boolean) => (
      <MemoryRouter>
        <PaywallModal
          open={open}
          onClose={onClose}
          surface="finyk_vision"
          title="CloudSync"
          description="Sync."
        />
      </MemoryRouter>
    );
    const { rerender } = render(view(true));
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    rerender(view(true));
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    rerender(view(false));
    rerender(view(true));
    expect(trackEventMock).toHaveBeenCalledTimes(2);
  });

  describe("ручний Premium за запитом", () => {
    it("з available: false футер як раніше", () => {
      planState.manualAccess = { available: false, requestedAt: null };
      renderModal(true);
      expect(
        screen.queryByRole("button", { name: "Попросити доступ" }),
      ).toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /Дивитися плани/ }),
      );
    });

    it("основна «Попросити доступ» з фокусом, «Дивитися плани» другорядна", () => {
      planState.manualAccess = { available: true, requestedAt: null };
      renderModal(true);
      const request = screen.getByRole("button", { name: "Попросити доступ" });
      expect(request.hasAttribute("data-autofocus")).toBe(true);
      expect(document.activeElement).toBe(request);
      const plans = screen.getByRole("button", { name: /Дивитися плани/ });
      expect(plans.hasAttribute("data-autofocus")).toBe(false);
      expect(screen.getByRole("button", { name: "Не зараз" })).toBeTruthy();
    });

    it("клік дає рівно один POST і стан «надіслано»", async () => {
      planState.manualAccess = { available: true, requestedAt: null };
      requestManualAccessMock.mockResolvedValue({
        ok: true,
        requestedAt: "2026-11-18T10:00:00.000Z",
      });
      renderModal(true);
      const request = screen.getByRole("button", { name: "Попросити доступ" });
      fireEvent.click(request);
      fireEvent.click(request);
      const sent = await screen.findByRole("button", {
        name: "Запит надіслано",
      });
      expect(sent).toBeDisabled();
      expect(requestManualAccessMock).toHaveBeenCalledTimes(1);
      expect(requestManualAccessMock.mock.calls[0]?.[0]).toMatchObject({
        surface: "ai_chat_limit",
      });
    });

    it("з requestedAt одразу стан «надіслано» без запиту", () => {
      planState.manualAccess = {
        available: true,
        requestedAt: "2026-11-17T10:00:00.000Z",
      };
      renderModal(true);
      expect(
        screen.getByRole("button", { name: "Запит надіслано" }),
      ).toBeDisabled();
      expect(requestManualAccessMock).not.toHaveBeenCalled();
    });

    it("409 ALREADY_REQUESTED теж дає «надіслано», а не помилку", async () => {
      planState.manualAccess = { available: true, requestedAt: null };
      requestManualAccessMock.mockRejectedValue(
        new ApiError({
          kind: "http",
          status: 409,
          message: "already",
          body: { code: "MANUAL_ACCESS_ALREADY_REQUESTED" },
          url: "/api/billing/manual-access",
        }),
      );
      renderModal(true);
      fireEvent.click(screen.getByRole("button", { name: "Попросити доступ" }));
      await screen.findByRole("button", { name: "Запит надіслано" });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("мережева помилка: текст помилки, кнопка знову активна", async () => {
      planState.manualAccess = { available: true, requestedAt: null };
      requestManualAccessMock.mockRejectedValue(new Error("offline"));
      renderModal(true);
      fireEvent.click(screen.getByRole("button", { name: "Попросити доступ" }));
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Не вдалося надіслати запит",
        ),
      );
      expect(
        screen.getByRole("button", { name: "Попросити доступ" }),
      ).not.toBeDisabled();
    });
  });
});
