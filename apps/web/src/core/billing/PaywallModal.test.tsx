/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const { trackEventMock, navigateSpy } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
  navigateSpy: vi.fn(),
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
                description="Free план: 10 повідомлень/день."
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
  });
  afterEach(() => cleanup());

  it("fires `paywall_viewed` with the surface label only when open", () => {
    const { rerender } = render(
      <MemoryRouter>
        <PaywallModal
          open={false}
          onClose={() => {}}
          surface="cloud_sync"
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
          surface="cloud_sync"
          title="CloudSync"
          description="Sync."
        />
      </MemoryRouter>,
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.PAYWALL_VIEWED,
      { surface: "cloud_sync" },
    );
  });

  it("renders the headline + description and a primary Pro CTA when open", () => {
    renderModal(true);
    expect(screen.getByText("AI-чат на ліміті")).toBeTruthy();
    expect(screen.getByText("Free план: 10 повідомлень/день.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Перейти до Pro/ })).toBeTruthy();
  });

  it("navigates to /pricing?source=paywall when the primary CTA is pressed", () => {
    renderModal(true);
    navigateSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Перейти до Pro/ }));
    expect(navigateSpy).toHaveBeenLastCalledWith("/pricing?source=paywall");
  });

  it("uses custom labels/features and closes from the dismiss CTA", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <PaywallModal
          open
          onClose={onClose}
          surface="themes"
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
          surface="cloud_sync"
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
});
