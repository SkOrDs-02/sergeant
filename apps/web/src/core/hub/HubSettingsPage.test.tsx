/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubSettingsPage } from "./HubSettingsPage";

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
    render(
      <HubSettingsPage
        syncing={false}
        onSync={vi.fn()}
        onPull={vi.fn()}
        user={{ id: "u1" }}
      />,
    );

    const general = document.getElementById("settings-general");

    expect(general).toBeInTheDocument();
    expect(general).toHaveAttribute(
      "data-search-keywords",
      expect.stringContaining("sync cloud backup"),
    );
  });

  it("reveals and scrolls to a hash-linked settings section", () => {
    window.history.replaceState(null, "", "/?tab=settings#settings-finyk");

    render(
      <HubSettingsPage
        syncing={false}
        onSync={vi.fn()}
        onPull={vi.fn()}
        user={{ id: "u1" }}
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
});
