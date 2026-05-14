/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@shared/hooks/useToast";
import { HubSettingsPage } from "./HubSettingsPage";

// `DashboardSection` and `PWASection` consume `useToast`, which throws
// outside a `ToastProvider`. The other sections are mocked above; these
// two render in-tree because the test exercises their anchor wiring.
function renderWithToast(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

vi.mock("../settings/AIDigestSection", () => ({
  AIDigestSection: () => <section>AI digest section</section>,
}));
vi.mock("../settings/AssistantCatalogueSection", () => ({
  AssistantCatalogueSection: () => <section>Assistant section</section>,
}));
vi.mock("../settings/ExperimentalSection", () => ({
  ExperimentalSection: () => <section>Experimental section</section>,
}));
vi.mock("../settings/FinykSection", () => ({
  FinykSection: () => <section>Finyk section</section>,
}));
vi.mock("../settings/FizrukSection", () => ({
  FizrukSection: () => <section>Fizruk section</section>,
}));
vi.mock("../settings/GeneralSection", () => ({
  GeneralSection: () => <section>General section</section>,
}));
vi.mock("../settings/NotificationsSection", () => ({
  NotificationsSection: () => <section>Notifications section</section>,
}));
vi.mock("../settings/NutritionSection", () => ({
  NutritionSection: () => <section>Nutrition section</section>,
}));
vi.mock("../settings/PlanSection", () => ({
  PlanSection: () => <section>Plan section</section>,
}));
vi.mock("../settings/RoutineSection", () => ({
  RoutineSection: () => <section>Routine section</section>,
}));

describe("HubSettingsPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders stable anchors and search keywords for settings sections", () => {
    renderWithToast(
      <HubSettingsPage
        user={{
          id: "u1",
          email: null,
          name: null,
          image: null,
          emailVerified: true,
          createdAt: null,
        }}
      />,
    );

    const general = document.getElementById("settings-general");

    expect(general).toBeInTheDocument();
    // "sync cloud" is the General section's stable findability marker.
    // ("backup" used to live here but moved to the dedicated `dataExport`
    // section in `ecbac8d8` — see HubSettingsPage.tsx for the keyword owner.
    // `dataExport` lives under the «Додатково» tab so it isn't in the DOM
    // for this default-tab render; assert against `general` only.)
    expect(general).toHaveAttribute(
      "data-search-keywords",
      expect.stringContaining("sync cloud"),
    );
  });

  it("reveals and scrolls to a hash-linked settings section", () => {
    window.history.replaceState(null, "", "/?tab=settings#settings-finyk");

    renderWithToast(
      <HubSettingsPage
        user={{
          id: "u1",
          email: null,
          name: null,
          image: null,
          emailVerified: true,
          createdAt: null,
        }}
      />,
    );

    const finyk = document.getElementById("settings-finyk");

    expect(screen.getByText("Finyk section")).toBeInTheDocument();
    expect(finyk).toBeInTheDocument();
    expect(finyk?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("mirrors the inner group tab to ?group= so reload keeps the user on Розділи", () => {
    window.history.replaceState(null, "", "/?tab=settings&group=modules");

    renderWithToast(
      <HubSettingsPage
        user={{
          id: "u1",
          email: null,
          name: null,
          image: null,
          emailVerified: true,
          createdAt: null,
        }}
      />,
    );

    // The «Розділи» tab renders module-scoped sections only. The
    // default `general` tab would render `GeneralSection`, not
    // `Routine section` / `Finyk section`, so the assertion confirms
    // the inner tab was hydrated from the URL.
    expect(screen.getByText("Routine section")).toBeInTheDocument();
    expect(screen.getByText("Finyk section")).toBeInTheDocument();
    expect(screen.queryByText("General section")).not.toBeInTheDocument();
  });

  it("auto-expands the Дашборд section when navigated via #settings-dashboard", () => {
    // Tap on an inactive Bento card on the Hub dashboard dispatches
    // `HUB_OPEN_SETTINGS_EVENT` which navigates to
    // `/?tab=settings#settings-dashboard`. Без auto-open секція просто
    // ховалась за sticky-хедером і користувач бачив «налаштування взагалі»,
    // а не конкретно тогл-лист модулів дашборда (issue 2026-05-08).
    window.history.replaceState(null, "", "/?tab=settings#settings-dashboard");

    renderWithToast(
      <HubSettingsPage
        user={{
          id: "u1",
          email: null,
          name: null,
          image: null,
          emailVerified: true,
          createdAt: null,
        }}
      />,
    );

    const dashboardToggle = screen.getByRole("button", { name: /Дашборд/ });
    expect(dashboardToggle).toHaveAttribute("aria-expanded", "true");

    const dashboard = document.getElementById("settings-dashboard");
    expect(dashboard).toBeInTheDocument();
    expect(dashboard?.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });
});
