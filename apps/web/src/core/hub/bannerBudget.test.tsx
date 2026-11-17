/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HUB_BANNER_PRIORITY,
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
        <Banner id="crossModulePreview" />
        <Banner id="privacyLock" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.getByTestId("banner-localOnlyData")).toBeInTheDocument();
    expect(screen.getByTestId("banner-privacyLock")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-dailyNudge")).toBeNull();
    expect(screen.queryByTestId("banner-crossModulePreview")).toBeNull();
  });

  it("звільнене місце дістається наступному за пріоритетом", () => {
    const { rerender } = render(
      <HubBannerBudgetProvider>
        <Banner id="localOnlyData" />
        <Banner id="privacyLock" />
        <Banner id="dailyNudge" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.queryByTestId("banner-dailyNudge")).toBeNull();

    rerender(
      <HubBannerBudgetProvider>
        <Banner id="localOnlyData" />
        <Banner id="privacyLock" wants={false} />
        <Banner id="dailyNudge" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.queryByTestId("banner-privacyLock")).toBeNull();
    expect(screen.getByTestId("banner-dailyNudge")).toBeInTheDocument();
  });

  it("банер, який сам не хоче показуватись, місця не займає", () => {
    render(
      <HubBannerBudgetProvider>
        <Banner id="localOnlyData" wants={false} />
        <Banner id="demoMode" wants={false} />
        <Banner id="privacyLock" />
        <Banner id="dailyNudge" />
        <Banner id="crossModulePreview" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.getByTestId("banner-privacyLock")).toBeInTheDocument();
    expect(screen.getByTestId("banner-dailyNudge")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-crossModulePreview")).toBeNull();
  });

  it("стелю можна змінити через `max`", () => {
    render(
      <HubBannerBudgetProvider max={1}>
        <Banner id="dailyNudge" />
        <Banner id="localOnlyData" />
      </HubBannerBudgetProvider>,
    );
    expect(screen.getByTestId("banner-localOnlyData")).toBeInTheDocument();
    expect(screen.queryByTestId("banner-dailyNudge")).toBeNull();
  });

  // PR-H1 (2026-09-13): `reengagement` ЗАМІНЮЄ hero (`HubHeroBlock`), а не
  // додається поруч, тож не має брати участь у бюджеті банерів — інакше
  // насичений бюджет (localOnlyData + privacyLock) лишав hero-смугу
  // порожньою для анонімного юзера з блокуванням застосунку, який
  // повернувся після паузи. Поведінку самої картки перевіряє
  // `ReEngagementCard.test.tsx`.
  it("PR-H1: `reengagement` більше не бере участі в бюджеті банерів", () => {
    expect(Object.keys(HUB_BANNER_PRIORITY)).not.toContain("reengagement");
  });

  // Рішення власника 2026-11-17: `SoftAuthPromptCard` знято разом зі слотом;
  // латентний ризик «soft-auth hero займає слот бюджету» (аудит, хвиля 4)
  // зник разом із ним.
  it("`softAuth` більше не має слота в бюджеті банерів", () => {
    expect(Object.keys(HUB_BANNER_PRIORITY)).not.toContain("softAuth");
  });

  it("без провайдера хук не обмежує нічого", () => {
    render(
      <>
        <Banner id="dailyNudge" />
        <Banner id="crossModulePreview" />
        <Banner id="privacyLock" />
      </>,
    );
    expect(screen.getByTestId("banner-dailyNudge")).toBeInTheDocument();
    expect(screen.getByTestId("banner-crossModulePreview")).toBeInTheDocument();
    expect(screen.getByTestId("banner-privacyLock")).toBeInTheDocument();
  });
});
