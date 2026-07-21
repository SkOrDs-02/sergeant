/**
 * Render + interaction coverage for the Fizruk rest timer overlay.
 */
import { AccessibilityInfo, Animated } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { RestTimerOverlay } from "../RestTimerOverlay";

describe("RestTimerOverlay", () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation(() => ({ remove: jest.fn() }) as never);
    jest.spyOn(Animated, "timing").mockImplementation(((
      _: Animated.Value,
      config: Animated.TimingAnimationConfig,
    ) => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
      _config: config,
    })) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders nothing and resets progress when there is no timer", () => {
    const onCancel = jest.fn();

    const { toJSON } = render(
      <RestTimerOverlay restTimer={null} onCancel={onCancel} />,
    );

    expect(toJSON()).toBeNull();
    expect(Animated.timing).not.toHaveBeenCalled();
  });

  it("shows the countdown, accessibility label, and cancel action", () => {
    const onCancel = jest.fn();

    render(
      <RestTimerOverlay
        restTimer={{ total: 120, remaining: 65 }}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Відпочинок")).toBeTruthy();
    expect(screen.getByText("01:05")).toBeTruthy();
    expect(
      screen.getByLabelText("Відпочинок, залишилось 65 секунд"),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Скасувати таймер відпочинку"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(Animated.timing).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({
        toValue: 65 / 120,
        duration: 900,
        useNativeDriver: false,
      }),
    );
  });

  it("uses the urgent visual path for the final ten seconds", () => {
    render(
      <RestTimerOverlay
        restTimer={{ total: 30, remaining: 8 }}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText("00:08")).toBeTruthy();
    expect(Animated.timing).toHaveBeenCalledWith(
      expect.any(Animated.Value),
      expect.objectContaining({ toValue: 8 / 30 }),
    );
  });
});
