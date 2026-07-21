/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@shared/hooks/useToast";
import type { OnboardingOutcomeCopy } from "@sergeant/shared";

const firstActionMocks = vi.hoisted(() => ({
  picks: [] as string[],
  goals: {} as Record<string, unknown>,
  clearFirstActionPending: vi.fn(),
}));

vi.mock("./vibePicks", async () => {
  const actual =
    await vi.importActual<typeof import("./vibePicks")>("./vibePicks");
  return {
    ...actual,
    getVibePicks: () => firstActionMocks.picks,
    clearFirstActionPending: () => firstActionMocks.clearFirstActionPending(),
  };
});

vi.mock("./PresetSheet", () => ({
  getPresetModule: (moduleId: string | null | undefined) =>
    moduleId ? { title: moduleId } : null,
  PresetSheet: ({
    open,
    moduleId,
    onClose,
    onPick,
  }: {
    open: boolean;
    moduleId: string | null;
    onClose: () => void;
    onPick?: (result: {
      moduleId: string | null;
      presetId: string;
      persisted: boolean;
    }) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={`preset-${moduleId}`}>
        <button
          type="button"
          onClick={() =>
            onPick?.({ moduleId, presetId: "quick", persisted: true })
          }
        >
          Persist preset
        </button>
        <button
          type="button"
          onClick={() =>
            onPick?.({ moduleId, presetId: "quick", persisted: false })
          }
        >
          Navigate preset
        </button>
        <button type="button" onClick={onClose}>
          Close preset
        </button>
      </div>
    ) : null,
}));

vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    getOnboardingGoals: () => firstActionMocks.goals,
    rankFirstActionCandidates: (picks: string[]) => {
      const all = ["routine", "finyk", "nutrition", "fizruk"];
      const primary = picks[0] ?? "routine";
      return {
        primary,
        others: (picks.length > 1 ? picks : all).filter((id) => id !== primary),
        reason: picks.length > 1 ? "multi-goal-vibe" : "single-goal",
      };
    },
  };
});

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticTap: vi.fn(),
  hapticSuccess: vi.fn(),
}));

import { trackEvent } from "../observability/analytics";
import { FirstActionHeroCard } from "./FirstActionSheet";
import { FirstRunHintBanner } from "./FirstRunHintBanner";
import { GoalFirstScreen } from "./GoalFirstScreen";
import { ModuleChecklist } from "./ModuleChecklist";
import { ReEngagementCard } from "./ReEngagementCard";

describe("FirstActionHeroCard extended coverage", () => {
  beforeEach(() => {
    localStorage.clear();
    firstActionMocks.picks = [];
    firstActionMocks.goals = {};
    firstActionMocks.clearFirstActionPending.mockClear();
    vi.mocked(trackEvent).mockClear();
  });

  afterEach(() => cleanup());

  it("opens a module preset from the no-picks branch and clears after persisted pick", () => {
    const onDismiss = vi.fn();
    render(<FirstActionHeroCard onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: /Фінік/ }));
    expect(
      screen.getByRole("dialog", { name: "preset-finyk" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Persist preset" }));

    expect(firstActionMocks.clearFirstActionPending).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the first-action card visible when a non-persisted preset navigates away", () => {
    const onDismiss = vi.fn();
    firstActionMocks.picks = ["routine", "finyk"];
    render(<FirstActionHeroCard onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: /Фінік/ }));
    fireEvent.click(screen.getByRole("button", { name: "Navigate preset" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("З чого хочеш почати?")).toBeInTheDocument();
    expect(firstActionMocks.clearFirstActionPending).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders the single-pick primary CTA with goal-aware copy and alternate chips", () => {
    firstActionMocks.picks = ["nutrition"];
    firstActionMocks.goals = { nutritionGoal: "lose" };
    render(<FirstActionHeroCard />);

    expect(screen.getByText("Запиши перший прийом їжі")).toBeInTheDocument();
    expect(
      screen.getByText("Схуднути — залогай перший прийом їжі."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Інший модуль" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Фінік$/ }));
    expect(
      screen.getByRole("dialog", { name: "preset-finyk" }),
    ).toBeInTheDocument();
  });

  it("dismisses the card from the close affordance", () => {
    const onDismiss = vi.fn();
    firstActionMocks.picks = ["routine"];
    render(<FirstActionHeroCard onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Сховати" }));

    expect(firstActionMocks.clearFirstActionPending).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("ModuleChecklist extended coverage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("collapses, expands, fires step actions, and dismisses", () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <ModuleChecklist moduleId="finyk" onAction={onAction} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Фінік/ }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Фінік/ }));
    const addExpense = screen.getByRole("checkbox", {
      name: "Додати першу витрату",
    });
    fireEvent.click(addExpense);

    expect(onAction).toHaveBeenCalledWith("add_expense");
    expect(addExpense).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Сховати чекліст" }));
    expect(screen.queryByText("Фінік: перші кроки")).not.toBeInTheDocument();
  });

  it("auto-hides shortly after the final step is completed", () => {
    render(
      <ToastProvider>
        <ModuleChecklist moduleId="routine" />
      </ToastProvider>,
    );

    const steps = screen.getAllByRole("checkbox");
    for (const step of steps) {
      fireEvent.click(step);
    }

    expect(screen.getByText("Рутина: Перші кроки")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("Рутина: Перші кроки")).not.toBeInTheDocument();
  });
});

describe("FirstRunHintBanner", () => {
  afterEach(() => cleanup());

  it("renders variant metadata, custom CTA copy, and dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <FirstRunHintBanner
        variant="nutrition"
        title="Ціль живе тут"
        description="Постав початкову калорійність у меню."
        ctaLabel="Добре"
        onDismiss={onDismiss}
        className="test-banner"
      />,
    );

    expect(screen.getByRole("status")).toHaveAttribute(
      "data-variant",
      "nutrition",
    );
    expect(screen.getByText("Ціль живе тут")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добре" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses the default CTA label for every supported variant", () => {
    for (const variant of ["finyk", "routine"] as const) {
      const { unmount } = render(
        <FirstRunHintBanner
          variant={variant}
          title={`Title ${variant}`}
          description={`Description ${variant}`}
          onDismiss={vi.fn()}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Зрозуміло" }),
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe("GoalFirstScreen", () => {
  afterEach(() => cleanup());

  it("tracks and forwards the selected outcome/module", () => {
    const onChoose = vi.fn();
    const onSkip = vi.fn();
    render(<GoalFirstScreen onChoose={onChoose} onSkip={onSkip} />);

    const firstOutcome = screen.getAllByTestId(/^goal-first-outcome-/)[0];
    if (!firstOutcome) throw new Error("Expected at least one outcome option");
    fireEvent.click(firstOutcome);
    fireEvent.click(screen.getByTestId("goal-first-skip"));

    const firstCall = onChoose.mock.calls[0] as
      [string, OnboardingOutcomeCopy["module"]] | undefined;
    expect(firstCall?.[0]).toBeTruthy();
    expect(["finyk", "fizruk", "routine", "nutrition"]).toContain(
      firstCall?.[1],
    );
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackEvent)).toHaveBeenCalled();
  });

  it("renders skip and blocks outcome taps while busy", () => {
    const onChoose = vi.fn();
    const onSkip = vi.fn();
    render(<GoalFirstScreen onChoose={onChoose} onSkip={onSkip} busy />);

    const firstOutcome = screen.getAllByTestId(/^goal-first-outcome-/)[0];
    if (!firstOutcome) throw new Error("Expected at least one outcome option");
    fireEvent.click(firstOutcome);
    fireEvent.click(screen.getByTestId("goal-first-skip"));

    expect(onChoose).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.getByTestId("goal-first-skip")).toBeDisabled();
    expect(firstOutcome).toHaveAttribute("aria-disabled", "true");
  });
});

describe("ReEngagementCard actions", () => {
  afterEach(() => cleanup());

  it("fires continue and dismiss callbacks from the CTAs", () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ReEngagementCard
        daysInactive={8}
        onContinue={onContinue}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Продовжити/ }));
    fireEvent.click(screen.getByRole("button", { name: "Пізніше" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
