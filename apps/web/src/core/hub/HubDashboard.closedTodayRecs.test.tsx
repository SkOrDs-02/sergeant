// @vitest-environment jsdom
/**
 * Проводка рекомендацій у «Закрито сьогодні».
 *
 * Баг: `HubDashboard` віддавав у купу `[focus, ...rest]` — рекомендації ПІСЛЯ
 * фільтра відкинутих. Сховав картку `budget_over_*` («✕») — вона зникала зі
 * списку, і рядок Фініка казав «перевищень немає» поруч із реально
 * перевищеним лімітом. Купа має отримувати ВСІ активні рекомендації
 * (`allRecs`), а не те, що лишилось на екрані.
 *
 * Усе, крім самої проводки, замінено заглушками: логіку правила «закрито»
 * покривають `now/*.test.ts`, тут лише те, що саме HubDashboard передає в проп.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Rec } from "@sergeant/shared";

const mocks = vi.hoisted(() => ({
  closedPileProps: [] as Array<{ recs: readonly Rec[] }>,
  state: {} as Record<string, unknown>,
}));

vi.mock("./useHubDashboardState", () => ({
  useHubDashboardState: () => mocks.state,
}));
vi.mock("./now/ClosedTodayPile", () => ({
  ClosedTodayPile: (props: { recs: readonly Rec[] }) => {
    mocks.closedPileProps.push(props);
    return <div data-testid="closed-pile" />;
  },
}));
vi.mock("./now/NowPile", () => ({ NowPile: () => null }));
vi.mock("./HubHeroBlock", () => ({ HubHeroBlock: () => null }));
vi.mock("./HubInsightsBlock", () => ({
  HubInsightsBlock: () => null,
  HUB_INSIGHTS_OPEN_STORAGE_KEY: "sergeant:hub.insights.open",
}));
vi.mock("./dashboard/dashboardCards", () => ({
  StaggerChild: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  MotivationalFooter: () => null,
}));
vi.mock("@shared/components/layout/ModuleRail", () => ({
  ModuleRail: () => null,
}));
vi.mock("../onboarding/FirstEntryCelebrationModal", () => ({
  FirstEntryCelebrationModal: () => null,
}));
vi.mock("../security/PrivacyLockBanner", () => ({
  PrivacyLockBanner: () => null,
}));
vi.mock("../auth/AuthContext", () => ({ useAuthOptional: () => null }));

const { HubDashboard } = await import("./HubDashboard");

const OVER = {
  id: "budget_over_food",
  module: "finyk",
  priority: 90,
  icon: "alert",
  title: "Продукти: перевищено на 62%",
  body: "",
  action: "finyk",
} as Rec;

afterEach(() => {
  cleanup();
  mocks.closedPileProps.length = 0;
});

describe("HubDashboard → ClosedTodayPile", () => {
  it("віддає купі всі активні рекомендації, навіть коли картку перевищення сховали", () => {
    mocks.state = {
      hasRealEntry: true,
      activeModules: ["finyk"],
      storageBump: 0,
      reengagement: { show: false },
      celebration: {
        open: false,
        close: () => {},
        ttvMs: null,
        moduleId: null,
      },
      // Картку `budget_over_food` сховали: у `focus`/`rest` її вже немає...
      focus: null,
      rest: [],
      // ...але перевищення активне, і купа має про це знати.
      allRecs: [OVER],
    };

    render(
      <HubDashboard onOpenModule={vi.fn()} user={null} onShowAuth={vi.fn()} />,
    );

    const last = mocks.closedPileProps.at(-1);
    expect(last?.recs.map((r) => r.id)).toEqual(["budget_over_food"]);
  });
});
