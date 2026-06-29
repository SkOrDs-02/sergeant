import { fireEvent, render } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockReplace = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({ id: "habit-42" }));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: () => null,
  },
  router: {
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
  },
  useRouter: () => ({
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock("@/core/hub/HubReports", () => ({
  HubReports: ({ onClose }: { onClose: () => void }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { Pressable, Text } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(
      Pressable,
      { testID: "hub-reports-route-surface", onPress: onClose },
      React.createElement(Text, null, "Hub reports"),
    );
  },
}));

jest.mock("@/modules/nutrition/components/NutritionBarcodeScanScreen", () => ({
  NutritionBarcodeScanScreen: () => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(View, {
      testID: "nutrition-barcode-route-surface",
    });
  },
}));

jest.mock("@/components/DeepLinkPlaceholder", () => ({
  DeepLinkPlaceholder: ({
    title,
    detail,
    primaryAction,
  }: {
    title: string;
    detail?: string;
    primaryAction?: { href: string };
  }) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const { Text, View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(
      View,
      { testID: "routine-habit-detail-placeholder" },
      React.createElement(Text, null, title),
      detail ? React.createElement(Text, null, detail) : null,
      primaryAction
        ? React.createElement(Text, null, primaryAction.href)
        : null,
    );
  },
}));

import HubReportsRoute from "../../app/hub-reports";
import NutritionScanRoute from "../../app/(tabs)/nutrition/scan";
import HabitDetailRoute from "../../app/(tabs)/routine/habit/[id]";
import { router } from "expo-router";

describe("mobile route surfaces", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockCanGoBack.mockReset().mockReturnValue(true);
    mockReplace.mockClear();
    mockUseLocalSearchParams.mockReset().mockReturnValue({ id: "habit-42" });
    Object.assign(router, {
      back: mockBack,
      canGoBack: mockCanGoBack,
      replace: mockReplace,
    });
  });

  it("wires hub reports close to router back or tabs fallback", () => {
    const { getByTestId, rerender } = render(<HubReportsRoute />);

    fireEvent.press(getByTestId("hub-reports-route-surface"));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValue(false);
    rerender(<HubReportsRoute />);
    fireEvent.press(getByTestId("hub-reports-route-surface"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("renders the nutrition barcode scan route surface", () => {
    const { getByTestId } = render(<NutritionScanRoute />);

    expect(getByTestId("nutrition-barcode-route-surface")).toBeTruthy();
  });

  it("renders the routine habit detail placeholder with the deep-link id", () => {
    const { getByText, getByTestId } = render(<HabitDetailRoute />);

    expect(getByTestId("routine-habit-detail-placeholder")).toBeTruthy();
    expect(getByText("ID: habit-42")).toBeTruthy();
    expect(getByText("/(tabs)/routine")).toBeTruthy();
  });
});
