// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { HubHeroBlock } from "./HubHeroBlock";
import { hasViewedFinykAnalytics } from "../onboarding/useChecklistSignals";

const { flagMock, openActionMock } = vi.hoisted(() => ({
  flagMock: vi.fn(),
  openActionMock: vi.fn(),
}));

vi.mock("../lib/featureFlags", () => ({ useFlag: flagMock }));
vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModuleWithAction: openActionMock,
}));
vi.mock("../insights/TodayFocusCard", () => ({
  TodayFocusCard: ({ onAction }: { onAction: (module: string) => void }) => (
    <button type="button" onClick={() => onAction("routine")}>
      today focus
    </button>
  ),
}));
vi.mock("../onboarding/SoftAuthPromptCard", () => ({
  SoftAuthPromptCard: ({ onOpenAuth }: { onOpenAuth: () => void }) => (
    <button type="button" onClick={onOpenAuth}>
      soft auth
    </button>
  ),
}));
vi.mock("../onboarding/FirstActionSheet", () => ({
  FirstActionHeroCard: ({ onDismiss }: { onDismiss: () => void }) => (
    <button type="button" onClick={onDismiss}>
      first action
    </button>
  ),
}));
vi.mock("../onboarding/ReEngagementCard", () => ({
  ReEngagementCard: ({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>
      reengagement
    </button>
  ),
}));
vi.mock("../onboarding/ModuleChecklist", () => ({
  ModuleChecklist: ({ onAction }: { onAction: (action: string) => void }) => (
    <>
      <button type="button" onClick={() => onAction("log")}>
        checklist
      </button>
      <button type="button" onClick={() => onAction("view_analytics")}>
        checklist-view-analytics
      </button>
    </>
  ),
}));
vi.mock("../onboarding/OnboardingProgress", () => ({
  OnboardingProgress: () => <div>onboarding progress</div>,
}));
vi.mock("./OutcomeCard", () => ({
  OutcomeCard: ({
    onOpenModule,
  }: {
    onOpenModule: (module: string) => void;
  }) => (
    <button type="button" onClick={() => onOpenModule("finyk")}>
      outcome card
    </button>
  ),
}));
vi.mock("./ValueProgressBar", () => ({
  ValueProgressBar: () => <div>value bar</div>,
}));
vi.mock("./dashboard/dashboardCards", () => ({
  StreakIndicator: () => <div>streak</div>,
}));
vi.mock("./CrossModulePreview", () => ({
  CrossModulePreview: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      cross preview
    </button>
  ),
}));

type HubHeroProps = ComponentProps<typeof HubHeroBlock>;

const defaultOnboardingState: HubHeroProps["onboardingState"] = {
  hero: null,
  reason: "none",
  candidates: [],
  showFirstAction: false,
  showSoftAuth: false,
  showTodayFocus: false,
  showReengagement: false,
  dismissFirstAction: vi.fn(),
  dismissSoftAuth: vi.fn(),
};

function renderHero(overrides: Partial<HubHeroProps> = {}) {
  const props: HubHeroProps = {
    onOpenModule: vi.fn(),
    onShowAuth: vi.fn(),
    user: null,
    hasRealEntry: false,
    sessionDays: 2,
    entryCount: 1,
    onboardingState: defaultOnboardingState,
    reengagement: { show: false, daysInactive: 0 },
    dismissReengagement: vi.fn(),
    crossModulePreviewSource: null,
    dismissCrossModulePreview: vi.fn(),
    focus: null,
    dismiss: vi.fn(),
    primaryModule: undefined,
    showChecklist: false,
    activeModules: [],
    goals: {
      finykBudget: null,
      fizrukWeeklyGoal: null,
      routineFirstHabit: null,
      nutritionGoal: null,
    },
    hasValueBar: false,
    ...overrides,
  };
  return { ...render(<HubHeroBlock {...props} />), props };
}

describe("HubHeroBlock", () => {
  // `markFinykAnalyticsViewed` пише в localStorage, а не в мок, тож без
  // очистки прапорець протікав би між тестами й робив перевірки
  // залежними від порядку виконання.
  beforeEach(() => {
    localStorage.clear();
  });

  it("gives re-engagement priority over every other hero", () => {
    flagMock.mockReturnValue(true);
    const { props } = renderHero({
      reengagement: { show: true, daysInactive: 14 },
      onboardingState: {
        ...defaultOnboardingState,
        showFirstAction: true,
      },
    });

    expect(screen.getByText("reengagement")).toBeInTheDocument();
    expect(screen.queryByText("first action")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("reengagement"));
    expect(props.dismissReengagement).toHaveBeenCalled();
  });

  it.each([
    ["first action", { showFirstAction: true, showSoftAuth: false }],
    ["soft auth", { showFirstAction: false, showSoftAuth: true }],
    ["today focus", { showFirstAction: false, showSoftAuth: false }],
  ])("selects the %s hero", (label, state) => {
    renderHero({
      onboardingState: {
        ...defaultOnboardingState,
        ...state,
      },
    });
    expect(screen.getByText(label)).toBeInTheDocument();
    if (label === "today focus") {
      expect(screen.getByText("streak")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("streak")).not.toBeInTheDocument();
    }
  });

  it("renders the enabled outcome card and forwards module actions", () => {
    flagMock.mockReturnValue(true);
    const { props } = renderHero({ primaryModule: "nutrition" });
    fireEvent.click(screen.getByText("outcome card"));
    expect(props.onOpenModule).toHaveBeenCalledWith("finyk");
    expect(screen.queryByText("value bar")).not.toBeInTheDocument();
  });

  it("selects the value bar or onboarding progress fallback", () => {
    flagMock.mockReturnValue(false);
    const valueBar = renderHero({ hasValueBar: true });
    expect(screen.getByText("value bar")).toBeInTheDocument();
    valueBar.unmount();

    renderHero({ hasValueBar: false });
    expect(screen.getByText("onboarding progress")).toBeInTheDocument();
  });

  it("forwards checklist actions and renders the cross-module preview", () => {
    const { props } = renderHero({
      hasRealEntry: true,
      crossModulePreviewSource: "finyk",
      showChecklist: true,
      primaryModule: "routine",
    });
    fireEvent.click(screen.getByText("checklist"));
    expect(openActionMock).toHaveBeenCalledWith("routine", "log");
    expect(hasViewedFinykAnalytics()).toBe(false);
    fireEvent.click(screen.getByText("cross preview"));
    expect(props.dismissCrossModulePreview).toHaveBeenCalled();
  });

  // Цей тест раніше стверджував ПРОТИЛЕЖНЕ — що тап ставить відмітку, —
  // і був неправильний разом із кодом. Диспатч `view_analytics` не
  // відкриває аналітику: `useAppEffects` передає далі лише `module`, тож
  // Фінік стає на дефолтній сторінці (огляд). Відмітка ж засувалась
  // НАЗАВЖДИ, тобто чекліст зараховував крок, якого не було, — рівно той
  // дефект, що його F3 закривав (знахідка рев'ю до PR #1106). Тепер
  // відмітку ставить сам екран аналітики на маунті; тут перевіряємо, що
  // тап цього НЕ робить.
  it("does not mark analytics viewed on tap — navigation alone is not proof", () => {
    // Модуль `useChecklistSignals` НЕ мокаємо навмисно: перевіряти, що
    // викликали стаб, означало б перевіряти власну підміну. Тут читається
    // справжній наслідок — той самий предикат, яким чекліст потім
    // визначає, чи крок виконано.
    expect(hasViewedFinykAnalytics()).toBe(false);
    renderHero({ showChecklist: true, primaryModule: "finyk" });
    fireEvent.click(screen.getByText("checklist-view-analytics"));
    expect(hasViewedFinykAnalytics()).toBe(false);
    // Навігація при цьому таки диспатчиться — тап лишається навігацією.
    expect(openActionMock).toHaveBeenCalledWith("finyk", "view_analytics");
  });

  it("does not mark analytics viewed for view_analytics on a non-finyk module", () => {
    renderHero({ showChecklist: true, primaryModule: "routine" });
    fireEvent.click(screen.getByText("checklist-view-analytics"));
    expect(hasViewedFinykAnalytics()).toBe(false);
    expect(openActionMock).toHaveBeenCalledWith("routine", "view_analytics");
  });
});
