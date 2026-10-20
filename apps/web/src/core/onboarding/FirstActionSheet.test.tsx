// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FirstActionHeroCard } from "./FirstActionSheet";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { isFirstActionPending, markFirstActionPending } from "./vibePicks";

const presetMock = vi.hoisted(() => ({ moduleId: null as string | null }));
vi.mock("./PresetSheet", () => ({
  getPresetModule: (id: string | null) => (id ? { id } : null),
  PresetSheet: ({
    open,
    moduleId,
    onClose,
    onPick,
  }: {
    open: boolean;
    moduleId: string | null;
    onClose: () => void;
    onPick: (result: { persisted: boolean }) => void;
  }) => {
    presetMock.moduleId = moduleId;
    return open ? (
      <div role="dialog" aria-label="preset-sheet">
        <button type="button" onClick={onClose}>
          close-preset
        </button>
        <button type="button" onClick={() => onPick({ persisted: true })}>
          save-preset
        </button>
        <button type="button" onClick={() => onPick({ persisted: false })}>
          navigate-preset
        </button>
      </div>
    ) : null;
  },
}));

vi.mock("../observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../observability/analytics")
  >("../observability/analytics");
  return {
    ...actual,
    trackEvent: vi.fn(),
  };
});

const VIBE_PICKS_KEY = "hub_onboarding_vibes_v1";

describe("FirstActionHeroCard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(trackEvent).mockClear();
  });

  it("asks the user to choose when no modules were picked", () => {
    render(<FirstActionHeroCard />);

    expect(screen.getByText("Перший запис")).toBeInTheDocument();
    expect(
      screen.getByText(/Routine не відкриється автоматично/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Рутина/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Фінік/ })).toBeInTheDocument();
    expect(
      vi
        .mocked(trackEvent)
        .mock.calls.some(
          ([event]) => event === ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_SHOWN,
        ),
    ).toBe(false);
  });

  it("keeps picked modules equal when several modules were picked", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["routine", "finyk"]));

    render(<FirstActionHeroCard />);

    expect(screen.getByText("Перший запис")).toBeInTheDocument();
    expect(screen.getByText(/порядок не важить/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Фінік/ })).toBeInTheDocument();
  });

  it("opens a module preset and dismisses after the preset writes real data", () => {
    const onDismiss = vi.fn();
    markFirstActionPending();
    render(<FirstActionHeroCard onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Фінік/ }));
    expect(
      screen.getByRole("dialog", { name: "preset-sheet" }),
    ).toBeInTheDocument();
    expect(presetMock.moduleId).toBe("finyk");
    fireEvent.click(screen.getByRole("button", { name: "save-preset" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(isFirstActionPending()).toBe(false);
  });

  it("leaves onboarding pending when a preset only navigates to a full module form", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["routine"]));
    const onDismiss = vi.fn();
    markFirstActionPending();
    render(<FirstActionHeroCard onDismiss={onDismiss} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Створи першу звичку/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "navigate-preset" }));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(isFirstActionPending()).toBe(true);
  });

  it("ranks a single selected module from its goal and tracks primary selection", () => {
    localStorage.setItem(VIBE_PICKS_KEY, JSON.stringify(["finyk"]));
    localStorage.setItem(
      "hub_onboarding_goals_v1",
      JSON.stringify({ finykBudget: 12500 }),
    );
    render(<FirstActionHeroCard />);
    expect(screen.getByText(/Встанови бюджет/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Додай першу витрату/ }),
    );
    expect(presetMock.moduleId).toBe("finyk");
    expect(
      vi
        .mocked(trackEvent)
        .mock.calls.some(
          ([event, properties]) =>
            event === ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED &&
            (properties as { via?: string }).via === "primary",
        ),
    ).toBe(true);
  });
});
