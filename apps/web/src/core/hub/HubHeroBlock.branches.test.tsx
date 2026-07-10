/** @vitest-environment jsdom */
/**
 * Branch coverage for HubHeroBlock — re-engagement override, onboarding
 * hero resolver branches, and post-entry preview/outcome paths.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HubHeroBlock } from "./HubHeroBlock";

vi.mock("../lib/featureFlags", () => ({
  useFlag: () => false,
}));

vi.mock("../insights/TodayFocusCard", () => ({
  TodayFocusCard: () => <div data-testid="today-focus" />,
}));
vi.mock("../onboarding/SoftAuthPromptCard", () => ({
  SoftAuthPromptCard: () => <div data-testid="soft-auth" />,
}));
vi.mock("../onboarding/FirstActionSheet", () => ({
  FirstActionHeroCard: () => <div data-testid="first-action" />,
}));
vi.mock("../onboarding/ReEngagementCard", () => ({
  ReEngagementCard: () => <div data-testid="reengagement" />,
}));
vi.mock("../onboarding/ModuleChecklist", () => ({
  ModuleChecklist: () => <div data-testid="module-checklist" />,
}));
vi.mock("../onboarding/OnboardingProgress", () => ({
  OnboardingProgress: () => <div data-testid="onboarding-progress" />,
}));
vi.mock("./CrossModulePreview", () => ({
  CrossModulePreview: () => <div data-testid="cross-preview" />,
}));
vi.mock("./OutcomeCard", () => ({
  OutcomeCard: () => <div data-testid="outcome-card" />,
}));
vi.mock("./ValueProgressBar", () => ({
  ValueProgressBar: () => <div data-testid="value-bar" />,
}));
vi.mock("./dashboard/dashboardCards", () => ({
  StreakIndicator: () => <div data-testid="streak" />,
}));

function baseProps(
  overrides: Partial<Parameters<typeof HubHeroBlock>[0]> = {},
): Parameters<typeof HubHeroBlock>[0] {
  return {
    onOpenModule: vi.fn(),
    onShowAuth: vi.fn(),
    user: null,
    hasRealEntry: false,
    sessionDays: 1,
    entryCount: 0,
    onboardingState: {
      showFirstAction: false,
      showSoftAuth: false,
      dismissFirstAction: vi.fn(),
      dismissSoftAuth: vi.fn(),
    } as never,
    reengagement: { show: false, daysInactive: 0 },
    dismissReengagement: vi.fn(),
    crossModulePreviewSource: null,
    dismissCrossModulePreview: vi.fn(),
    focus: null,
    dismiss: vi.fn(),
    primaryModule: undefined,
    showChecklist: false,
    activeModules: ["finyk"],
    goals: [] as never,
    hasValueBar: false,
    ...overrides,
  };
}

describe("HubHeroBlock", () => {
  afterEach(() => cleanup());

  it("replaces the hero stack with re-engagement when inactive days trigger", () => {
    render(
      <HubHeroBlock
        {...baseProps({
          reengagement: { show: true, daysInactive: 5 },
        })}
      />,
    );
    expect(screen.getByTestId("reengagement")).toBeInTheDocument();
    expect(screen.queryByTestId("today-focus")).not.toBeInTheDocument();
  });

  it("shows the first-action hero during onboarding", () => {
    render(
      <HubHeroBlock
        {...baseProps({
          onboardingState: {
            showFirstAction: true,
            showSoftAuth: false,
            dismissFirstAction: vi.fn(),
            dismissSoftAuth: vi.fn(),
          } as never,
        })}
      />,
    );
    expect(screen.getByTestId("first-action")).toBeInTheDocument();
  });

  it("shows soft-auth prompt when first action is dismissed but auth is due", () => {
    render(
      <HubHeroBlock
        {...baseProps({
          onboardingState: {
            showFirstAction: false,
            showSoftAuth: true,
            dismissFirstAction: vi.fn(),
            dismissSoftAuth: vi.fn(),
          } as never,
        })}
      />,
    );
    expect(screen.getByTestId("soft-auth")).toBeInTheDocument();
  });

  it("renders onboarding progress before the first real entry", () => {
    render(<HubHeroBlock {...baseProps()} />);
    expect(screen.getByTestId("onboarding-progress")).toBeInTheDocument();
  });

  it("shows cross-module preview after the first real entry", () => {
    render(
      <HubHeroBlock
        {...baseProps({
          hasRealEntry: true,
          crossModulePreviewSource: "finyk",
        })}
      />,
    );
    expect(screen.getByTestId("cross-preview")).toBeInTheDocument();
  });
});
