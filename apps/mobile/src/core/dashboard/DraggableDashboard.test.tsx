import { fireEvent, render } from "@testing-library/react-native";

import { DraggableDashboard, computeDropIndex } from "./DraggableDashboard";

jest.mock("@sergeant/shared", () => ({
  ...jest.requireActual("@sergeant/shared"),
  hapticSuccess: jest.fn(),
  hapticTap: jest.fn(),
}));

jest.mock("@/lib/storage", () => ({
  safeReadLS: jest.fn((key: string, fallback: unknown) =>
    key === "dashboard_drag_coach_seen" ? true : fallback,
  ),
  safeWriteLS: jest.fn(),
}));

describe("DraggableDashboard", () => {
  it("computes drop indices across variable row heights", () => {
    expect(computeDropIndex(0, 10, [80, 100, 80])).toBe(0);
    expect(computeDropIndex(0, 60, [80, 100, 80])).toBe(1);
    expect(computeDropIndex(0, 170, [80, 100, 80])).toBe(2);
    expect(computeDropIndex(2, -60, [80, 100, 80])).toBe(1);
    expect(computeDropIndex(2, -160, [80, 100, 80])).toBe(0);
    expect(computeDropIndex(9, 100, [80, 100, 80])).toBe(9);
  });

  it("renders module rows and opens a module on short press", () => {
    const onOpenModule = jest.fn();
    const { getByTestId } = render(
      <DraggableDashboard
        modules={["finyk", "fizruk", "routine"]}
        onOpenModule={onOpenModule}
        onReorder={jest.fn()}
        testID="dashboard-module-row"
      />,
    );

    fireEvent.press(getByTestId("dashboard-module-row-finyk"));

    expect(onOpenModule).toHaveBeenCalledWith("finyk");
    expect(getByTestId("dashboard-module-row-fizruk")).toBeTruthy();
  });
});
