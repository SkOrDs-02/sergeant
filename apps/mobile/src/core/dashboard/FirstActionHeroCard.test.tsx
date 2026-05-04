import { fireEvent, render } from "@testing-library/react-native";

import {
  FIRST_ACTION_PENDING_KEY,
  ONBOARDING_GOALS_KEY,
  VIBE_PICKS_KEY,
} from "@sergeant/shared";

import { FirstActionHeroCard } from "./FirstActionHeroCard";
import { _getMMKVInstance } from "@/lib/storage";

function resetStore() {
  const mmkv = _getMMKVInstance();
  mmkv.clearAll();
}

function seedPicks(picks: string[]) {
  const mmkv = _getMMKVInstance();
  mmkv.set(VIBE_PICKS_KEY, JSON.stringify(picks));
}

function seedGoals(goals: Record<string, unknown>) {
  const mmkv = _getMMKVInstance();
  mmkv.set(ONBOARDING_GOALS_KEY, JSON.stringify(goals));
}

describe("FirstActionHeroCard", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the routine primary when picks include routine", () => {
    seedPicks(["routine", "finyk"]);
    const { getByText } = render(<FirstActionHeroCard onAction={jest.fn()} />);
    expect(getByText(/Створи першу звичку/)).toBeTruthy();
  });

  it("falls back to routine when no picks are persisted", () => {
    const { getByText } = render(<FirstActionHeroCard onAction={jest.fn()} />);
    expect(getByText(/Створи першу звичку/)).toBeTruthy();
  });

  it("strips nutrition from the picks before choosing primary", () => {
    // With only nutrition picked, the default [routine, finyk, fizruk]
    // kicks in and routine becomes the primary.
    seedPicks(["nutrition"]);
    const { getByText } = render(<FirstActionHeroCard onAction={jest.fn()} />);
    expect(getByText(/Створи першу звичку/)).toBeTruthy();
  });

  it("fires onAction(primary) and onPicked(via primary) on primary press", () => {
    seedPicks(["finyk", "fizruk"]);
    const onAction = jest.fn();
    const onPicked = jest.fn();
    const { getByTestId } = render(
      <FirstActionHeroCard onAction={onAction} onPicked={onPicked} />,
    );

    fireEvent.press(getByTestId("first-action-primary"));
    expect(onAction).toHaveBeenCalledWith("finyk");
    expect(onPicked).toHaveBeenCalledWith({
      module: "finyk",
      via: "primary",
    });
  });

  it("clears the pending flag and fires onDismiss on dismiss press", () => {
    const mmkv = _getMMKVInstance();
    mmkv.set(FIRST_ACTION_PENDING_KEY, "1");
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <FirstActionHeroCard onAction={jest.fn()} onDismiss={onDismiss} />,
    );

    fireEvent.press(getByTestId("first-action-dismiss"));
    expect(mmkv.getString(FIRST_ACTION_PENDING_KEY)).toBeUndefined();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("fires onShown once on mount with resolved primary", () => {
    seedPicks(["fizruk"]);
    const onShown = jest.fn();
    render(<FirstActionHeroCard onAction={jest.fn()} onShown={onShown} />);
    expect(onShown).toHaveBeenCalledWith({
      primary: "fizruk",
      picks: ["fizruk"],
    });
  });

  it("renders alt-module chip row inline (no expand) and routes with via=chip", () => {
    // S2.3 mobile parity: the legacy «Інший модуль» expand toggle is gone;
    // alt-module chips are always visible, mirroring the web refactor.
    seedPicks(["routine", "finyk"]);
    const onAction = jest.fn();
    const onPicked = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <FirstActionHeroCard onAction={onAction} onPicked={onPicked} />,
    );

    expect(queryByTestId("first-action-expand")).toBeNull();
    expect(getByTestId("first-action-alt-finyk")).toBeTruthy();

    fireEvent.press(getByTestId("first-action-alt-finyk"));

    expect(onAction).toHaveBeenCalledWith("finyk");
    expect(onPicked).toHaveBeenCalledWith({
      module: "finyk",
      via: "chip",
    });
  });

  it("hides the alt-chip row when only one module is picked", () => {
    seedPicks(["routine"]);
    const { queryByTestId } = render(
      <FirstActionHeroCard onAction={jest.fn()} />,
    );
    expect(queryByTestId("first-action-alt-finyk")).toBeNull();
    expect(queryByTestId("first-action-alt-fizruk")).toBeNull();
  });

  describe("goal-aware primary (S2.1)", () => {
    it("promotes finyk when finykBudget is set", () => {
      seedPicks(["routine", "finyk", "fizruk"]);
      seedGoals({ finykBudget: 30000 });

      const { getByText } = render(
        <FirstActionHeroCard onAction={jest.fn()} />,
      );
      expect(getByText(/Додай першу витрату/)).toBeTruthy();
    });

    it("promotes fizruk when fizrukWeeklyGoal is set and finyk has no goal", () => {
      seedPicks(["routine", "finyk", "fizruk"]);
      seedGoals({ fizrukWeeklyGoal: 3 });

      const { getByText } = render(
        <FirstActionHeroCard onAction={jest.fn()} />,
      );
      expect(getByText(/Увімкни розминку/)).toBeTruthy();
    });

    it("falls back to static priority when no goals are set", () => {
      seedPicks(["finyk", "fizruk"]);

      const { getByText } = render(
        <FirstActionHeroCard onAction={jest.fn()} />,
      );
      // No goals → finyk wins by static priority over fizruk.
      expect(getByText(/Додай першу витрату/)).toBeTruthy();
    });

    it("ignores nutritionGoal because nutrition is filtered out of mobile picks", () => {
      // Mobile strips nutrition before picking primary (Phase 7 gate),
      // so nutritionGoal should never elevate nutrition above other modules.
      seedPicks(["routine", "fizruk", "nutrition"]);
      seedGoals({ nutritionGoal: "lose" });

      const { getByText } = render(
        <FirstActionHeroCard onAction={jest.fn()} />,
      );
      expect(getByText(/Створи першу звичку/)).toBeTruthy();
    });
  });
});
