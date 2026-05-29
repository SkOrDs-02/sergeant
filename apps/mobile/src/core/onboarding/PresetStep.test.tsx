import { fireEvent, render } from "@testing-library/react-native";

import { PresetStep } from "./PresetStep";

const applyPreset = jest.fn();
const writePresetPrefill = jest.fn();
const trackEvent = jest.fn();

jest.mock("./presetApply", () => ({
  applyPreset: (...args: unknown[]) => applyPreset(...args),
}));

jest.mock("./presetPrefill", () => ({
  writePresetPrefill: (...args: unknown[]) => writePresetPrefill(...args),
}));

jest.mock("@/lib/analytics", () => ({
  ANALYTICS_EVENTS: {
    FTUX_PRESET_SHEET_SHOWN: "ftux_preset_sheet_shown",
    FTUX_PRESET_PICKED: "ftux_preset_picked",
    FTUX_PRESET_CUSTOM: "ftux_preset_custom",
  },
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

describe("PresetStep", () => {
  beforeEach(() => {
    applyPreset.mockClear();
    writePresetPrefill.mockClear();
    trackEvent.mockClear();
  });

  it("fires the shown event with preset count on open", () => {
    render(
      <PresetStep
        open
        moduleId="routine"
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />,
    );
    expect(trackEvent).toHaveBeenCalledWith("ftux_preset_sheet_shown", {
      module: "routine",
      presetCount: 3,
    });
  });

  it("writes a routine preset directly and reports persisted=true (no navigate)", () => {
    const onNavigate = jest.fn();
    const onPick = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <PresetStep
        open
        moduleId="routine"
        onClose={onClose}
        onNavigate={onNavigate}
        onPick={onPick}
      />,
    );

    fireEvent.press(getByTestId("preset-item-water"));

    expect(applyPreset).toHaveBeenCalledWith("routine", {
      name: "Випити воду",
      emoji: "💧",
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(writePresetPrefill).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith({
      moduleId: "routine",
      presetId: "water",
      persisted: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stages a finyk prefill and navigates into the add-expense sheet", () => {
    const onNavigate = jest.fn();
    const onPick = jest.fn();
    const { getByTestId } = render(
      <PresetStep
        open
        moduleId="finyk"
        onClose={jest.fn()}
        onNavigate={onNavigate}
        onPick={onPick}
      />,
    );

    fireEvent.press(getByTestId("preset-item-coffee"));

    expect(writePresetPrefill).toHaveBeenCalledWith("finyk", {
      description: "Кава",
      category: "їжа",
    });
    expect(onNavigate).toHaveBeenCalledWith("finyk", "add_expense");
    expect(applyPreset).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith({
      moduleId: "finyk",
      presetId: "coffee",
      persisted: false,
    });
  });

  it("renders only the fallback CTA for empty-preset modules (fizruk)", () => {
    const onNavigate = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <PresetStep
        open
        moduleId="fizruk"
        onClose={jest.fn()}
        onNavigate={onNavigate}
      />,
    );

    expect(queryByTestId("preset-item-coffee")).toBeNull();
    fireEvent.press(getByTestId("preset-fallback"));

    // Fallback clears any stale prefill, then routes into the add-flow.
    expect(writePresetPrefill).toHaveBeenCalledWith("fizruk", null);
    expect(onNavigate).toHaveBeenCalledWith("fizruk", "start_workout");
    expect(trackEvent).toHaveBeenCalledWith("ftux_preset_custom", {
      module: "fizruk",
      via: "fallback",
    });
  });
});
