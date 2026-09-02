/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HubBannerBudgetProvider,
  useHubBannerSlot,
  type HubBannerId,
} from "./bannerBudget";

function Banner({ id, wants = true }: { id: HubBannerId; wants?: boolean }) {
  const visible = useHubBannerSlot(id, wants);
  if (!visible) return null;
  return <div data-testid={`banner-${id}`}>{id}</div>;
}

describe("HubBannerBudgetProvider", () => {
  it("показує не більше двох банерів, за пріоритетом, незалежно від порядку в дереві", () => {
    render(
      <HubBannerBudgetProvider>
        <Banner id="dailyNudge" />
        <Banner id="localOnlyData" />
        <Banner id="privacyLock" />
        <Banner id="softAuth" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.getByTestId("banner-localOnlyData")).toBeInTheDocument();
    expect(screen.getByTestId("banner-softAuth")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-privacyLock")).toBeNull();
    expect(screen.queryByTestId("banner-dailyNudge")).toBeNull();
  });

  it("звільнене місце дістається наступному за пріоритетом", () => {
    const { rerender } = render(
      <HubBannerBudgetProvider>
        <Banner id="localOnlyData" />
        <Banner id="softAuth" />
        <Banner id="privacyLock" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.queryByTestId("banner-privacyLock")).toBeNull();

    rerender(
      <HubBannerBudgetProvider>
        <Banner id="localOnlyData" />
        <Banner id="softAuth" wants={false} />
        <Banner id="privacyLock" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.queryByTestId("banner-softAuth")).toBeNull();
    expect(screen.getByTestId("banner-privacyLock")).toBeInTheDocument();
  });

  it("банер, який сам не хоче показуватись, місця не займає", () => {
    render(
      <HubBannerBudgetProvider>
        <Banner id="localOnlyData" wants={false} />
        <Banner id="demoMode" wants={false} />
        <Banner id="privacyLock" />
        <Banner id="dailyNudge" />
        <Banner id="reengagement" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.getByTestId("banner-privacyLock")).toBeInTheDocument();
    expect(screen.getByTestId("banner-dailyNudge")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-reengagement")).toBeNull();
  });

  it("стелю можна змінити через `max`", () => {
    render(
      <HubBannerBudgetProvider max={1}>
        <Banner id="softAuth" />
        <Banner id="localOnlyData" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.getByTestId("banner-localOnlyData")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-softAuth")).toBeNull();
  });

  it("без провайдера хук не обмежує нічого", () => {
    render(
      <>
        <Banner id="dailyNudge" />
        <Banner id="reengagement" />
        <Banner id="privacyLock" />
      </>,
    );
    expect(screen.getByTestId("banner-dailyNudge")).toBeInTheDocument();
    expect(screen.getByTestId("banner-reengagement")).toBeInTheDocument();
    expect(screen.getByTestId("banner-privacyLock")).toBeInTheDocument();
  });
});
