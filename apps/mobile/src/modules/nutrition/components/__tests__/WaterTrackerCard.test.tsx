import { fireEvent, render } from "@testing-library/react-native";

import { WaterTrackerCard } from "../WaterTrackerCard";

jest.mock("../../hooks/useWaterTracker", () => ({
  useWaterTracker: jest.fn(),
}));

import { useWaterTracker } from "../../hooks/useWaterTracker";

const mockedWater = useWaterTracker as jest.MockedFunction<
  typeof useWaterTracker
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WaterTrackerCard", () => {
  it("adds quick amounts and renders progress text", () => {
    const add = jest.fn();
    mockedWater.mockReturnValue({ todayMl: 500, add, reset: jest.fn() });

    const { getByTestId, getByText } = render(
      <WaterTrackerCard goalMl={2000} testID="water-card" />,
    );

    expect(getByText("500 мл / 2.0 л")).toBeTruthy();
    fireEvent.press(getByTestId("water-card-add-300"));
    expect(add).toHaveBeenCalledWith(300);
  });

  it("requires a second tap before resetting water", () => {
    const reset = jest.fn();
    mockedWater.mockReturnValue({ todayMl: 2100, add: jest.fn(), reset });

    const { getByTestId, getByText } = render(
      <WaterTrackerCard goalMl={2000} testID="water-card" />,
    );

    expect(getByText("2.1 л / 2.0 л ✓")).toBeTruthy();
    const resetButton = getByTestId("water-card-reset");
    fireEvent.press(resetButton);
    expect(reset).not.toHaveBeenCalled();
    expect(getByText("Скинути?")).toBeTruthy();

    fireEvent.press(resetButton);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("supports water tracking without a daily goal", () => {
    mockedWater.mockReturnValue({
      todayMl: 0,
      add: jest.fn(),
      reset: jest.fn(),
    });

    const { getByText, queryByTestId } = render(
      <WaterTrackerCard goalMl={0} testID="water-card" />,
    );

    expect(getByText("0 мл")).toBeTruthy();
    expect(queryByTestId("water-card-reset")).toBeNull();
  });
});
