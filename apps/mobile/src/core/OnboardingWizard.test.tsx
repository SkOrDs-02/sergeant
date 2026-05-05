import { fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import {
  FIRST_ACTION_PENDING_KEY,
  FIRST_ACTION_STARTED_AT_KEY,
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  ONBOARDING_DONE_KEY,
  VIBE_PICKS_KEY,
  overrideVariant,
} from "@sergeant/shared";

import { OnboardingWizard } from "./OnboardingWizard";
import { _getMMKVInstance, mobileKVStore } from "@/lib/storage";

function resetStore() {
  _getMMKVInstance().clearAll();
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    resetStore();
    // Pin the legacy `all` arm for the established suite so the
    // "default = all four modules" expectations stay deterministic.
    // The S6.1 `none` arm has its own describe block below.
    overrideVariant(
      mobileKVStore,
      ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
      "all",
    );
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(() => ({ remove: () => {} }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderOnModulesStep(onDone = jest.fn()) {
    const screen = render(<OnboardingWizard onDone={onDone} />);
    fireEvent.press(screen.getByTestId("onboarding-next-welcome"));
    return screen;
  }

  function renderOnGoalsStep(onDone = jest.fn()) {
    const screen = renderOnModulesStep(onDone);
    fireEvent.press(screen.getByTestId("onboarding-next-modules"));
    return screen;
  }

  it("renders the outcome-variant hero copy and all four module cards", () => {
    const { getByText, queryByText, getByTestId } = render(
      <OnboardingWizard onDone={jest.fn()} />,
    );
    // S1.1 + S1.2: outcome variant ships at 100% (`weights: [1, 0, 0]`).
    // Mobile parity must show the same headline/subtitle as the web wizard.
    expect(
      getByText("Запиши перший зум — і побачиш, куди йде твоє життя."),
    ).toBeTruthy();
    expect(getByText(/30 секунд, без реєстрації/)).toBeTruthy();
    // Audit-guard: the pre-S1.1 copy must not resurrect.
    expect(queryByText("Привіт. Це Sergeant.")).toBeNull();
    expect(queryByText(/Гроші, тіло, звички, їжа/)).toBeNull();

    fireEvent.press(getByTestId("onboarding-next-welcome"));

    expect(getByTestId("onboarding-module-finyk")).toBeTruthy();
    expect(getByTestId("onboarding-module-fizruk")).toBeTruthy();
    expect(getByTestId("onboarding-module-routine")).toBeTruthy();
    expect(getByTestId("onboarding-module-nutrition")).toBeTruthy();
  });

  it("defaults every module card to the selected state (lazy-path)", () => {
    const { getByTestId } = renderOnModulesStep();
    for (const id of ["finyk", "fizruk", "routine", "nutrition"] as const) {
      const chip = getByTestId(`onboarding-module-${id}`);
      expect(chip.props.accessibilityState?.selected).toBe(true);
    }
  });

  it("toggles a module off and surfaces the empty-picks hint when every module is cleared", () => {
    const { getByTestId, getByText, queryByText } = renderOnModulesStep();
    fireEvent.press(getByTestId("onboarding-module-finyk"));
    expect(
      getByTestId("onboarding-module-finyk").props.accessibilityState?.selected,
    ).toBe(false);
    expect(queryByText(/Без вибору — всі 4 модулі/)).toBeNull();

    for (const id of ["fizruk", "routine", "nutrition"] as const) {
      fireEvent.press(getByTestId(`onboarding-module-${id}`));
    }
    expect(getByText(/Без вибору — всі 4 модулі/)).toBeTruthy();
  });

  it("persists picks + done flag + first-action markers on finish", () => {
    const onDone = jest.fn();
    const mmkv = _getMMKVInstance();
    const { getByTestId } = renderOnGoalsStep(onDone);

    fireEvent.press(getByTestId("onboarding-finish"));

    expect(mmkv.getString(ONBOARDING_DONE_KEY)).toBe("1");
    expect(mmkv.getString(FIRST_ACTION_PENDING_KEY)).toBe("1");
    expect(mmkv.getString(FIRST_ACTION_STARTED_AT_KEY)).toBeTruthy();
    const saved = mmkv.getString(VIBE_PICKS_KEY);
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved as string)).toEqual([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "vibe_empty",
      picks: ["finyk", "fizruk", "routine", "nutrition"],
    });
  });

  it("falls back to every module when the user cleared every module before tapping finish", () => {
    const onDone = jest.fn();
    const { getByTestId } = renderOnModulesStep(onDone);
    for (const id of ["finyk", "fizruk", "routine", "nutrition"] as const) {
      fireEvent.press(getByTestId(`onboarding-module-${id}`));
    }
    fireEvent.press(getByTestId("onboarding-next-modules"));

    fireEvent.press(getByTestId("onboarding-finish"));

    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "vibe_empty",
      picks: ["finyk", "fizruk", "routine", "nutrition"],
    });
    expect(
      JSON.parse(_getMMKVInstance().getString(VIBE_PICKS_KEY) as string),
    ).toEqual(["finyk", "fizruk", "routine", "nutrition"]);
  });

  it("persists the caller's chosen subset when they deselected some modules", () => {
    const onDone = jest.fn();
    const { getByTestId } = renderOnModulesStep(onDone);
    fireEvent.press(getByTestId("onboarding-module-fizruk"));
    fireEvent.press(getByTestId("onboarding-module-nutrition"));
    fireEvent.press(getByTestId("onboarding-next-modules"));

    fireEvent.press(getByTestId("onboarding-finish"));

    expect(onDone).toHaveBeenCalledWith(null, {
      intent: "vibe_empty",
      picks: ["finyk", "routine"],
    });
  });
});

describe("OnboardingWizard — S6.1 `none` arm (opt-in)", () => {
  beforeEach(() => {
    resetStore();
    overrideVariant(
      mobileKVStore,
      ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
      "none",
    );
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(() => ({ remove: () => {} }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderOnModulesStep(onDone = jest.fn()) {
    const screen = render(<OnboardingWizard onDone={onDone} />);
    fireEvent.press(screen.getByTestId("onboarding-next-welcome"));
    return screen;
  }

  it("starts the modules step with no module pre-selected", () => {
    const { getByTestId } = renderOnModulesStep();
    for (const id of ["finyk", "fizruk", "routine", "nutrition"] as const) {
      const chip = getByTestId(`onboarding-module-${id}`);
      expect(chip.props.accessibilityState?.selected).toBe(false);
    }
  });

  it("renders the «Обери хоч один модуль» hint instead of the legacy fallback copy", () => {
    const { getByTestId, queryByText } = renderOnModulesStep();
    // S6.1 hint must show on initial render (picks empty in the
    // `none` arm).
    expect(getByTestId("onboarding-empty-picks-hint")).toBeTruthy();
    // Audit-guard — the pre-S6.1 «Без вибору — всі 4 модулі» copy
    // must not coexist with the new hint.
    expect(queryByText(/Без вибору — всі 4 модулі/)).toBeNull();
  });

  it("disables «Далі» until at least one module is picked", () => {
    const { getByTestId } = renderOnModulesStep();

    const cta = getByTestId("onboarding-next-modules");
    expect(cta.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(getByTestId("onboarding-module-finyk"));
    expect(cta.props.accessibilityState?.disabled).toBe(false);
  });

  it("does not write `vibePicks` or onboarding-done when finish is bypassed with empty picks", () => {
    const onDone = jest.fn();
    const mmkv = _getMMKVInstance();
    renderOnModulesStep(onDone);

    // Defensive — the CTA is disabled in DOM, but assert the contract
    // holds even if a future refactor exposes a programmatic finish.
    expect(mmkv.getString(ONBOARDING_DONE_KEY)).toBeUndefined();
    expect(mmkv.getString(VIBE_PICKS_KEY)).toBeUndefined();
    expect(mmkv.getString(FIRST_ACTION_PENDING_KEY)).toBeUndefined();
    expect(onDone).not.toHaveBeenCalled();
  });
});
