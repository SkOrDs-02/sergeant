import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import { NutritionBarcodeScanScreen } from "../NutritionBarcodeScanScreen";
import { emitNutritionScanPrefill } from "../../lib/nutritionScanBridge";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockLookup = jest.fn();
const mockRequestPermission = jest.fn();
let mockPermission: { granted: boolean; canAskAgain?: boolean } | null = {
  granted: true,
};
let mockParams: { returnTo?: string } = {};
let mockCameraProps: { onBarcodeScanned?: (event: { data: string }) => void } =
  {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("expo-camera", () => ({
  CameraView: (props: {
    onBarcodeScanned?: (event: { data: string }) => void;
  }) => {
    mockCameraProps = props;
    const React = jest.requireActual<typeof import("react")>("react");
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return React.createElement(View, { testID: "mock-camera-view" });
  },
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
}));

jest.mock("../../hooks/useBarcodeProductLookup", () => ({
  useBarcodeProductLookup: () => mockLookup,
}));

jest.mock("../../lib/nutritionScanBridge", () => ({
  emitNutritionScanPrefill: jest.fn(),
}));

jest.mock("@sergeant/shared", () => ({
  ...jest.requireActual("@sergeant/shared"),
  hapticSuccess: jest.fn(),
}));

jest.mock("react-native/Libraries/Linking/Linking", () => ({
  openSettings: jest.fn(() => Promise.resolve()),
}));

const mockedOpenSettings = Linking.openSettings as unknown as jest.Mock;
const mockedEmitPrefill = emitNutritionScanPrefill as jest.Mock;

const milkProduct = {
  name: "Milk",
  brand: "Test",
  servingSize: null,
  servingGrams: 250,
  kcal_100g: 100,
  protein_100g: 3,
  fat_100g: 3.5,
  carbs_100g: 5,
  source: "off",
};

describe("NutritionBarcodeScanScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockLookup.mockReset();
    mockRequestPermission.mockClear();
    mockedOpenSettings.mockClear();
    mockedEmitPrefill.mockClear();
    mockPermission = { granted: true };
    mockParams = {};
    mockCameraProps = {};
  });

  it("opens OS settings when camera permission cannot be requested again", () => {
    mockPermission = { granted: false, canAskAgain: false };
    const { getByText } = render(<NutritionBarcodeScanScreen />);

    fireEvent.press(getByText("Відкрити налаштування"));

    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("looks up a scanned barcode and shows a product preview", async () => {
    mockLookup.mockResolvedValueOnce(milkProduct);
    const { findByText, getByTestId, getByText } = render(
      <NutritionBarcodeScanScreen />,
    );

    expect(getByTestId("mock-camera-view")).toBeTruthy();

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: "4820001234567" });
    });

    expect(await findByText("Milk Test")).toBeTruthy();
    expect(getByText(/250 ккал/)).toBeTruthy();

    fireEvent.press(getByText("До Харчування"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/nutrition");
  });

  it("emits add-meal prefill and goes back when returnTo=addMeal", async () => {
    mockParams = { returnTo: "addMeal" };
    mockLookup.mockResolvedValueOnce(milkProduct);
    render(<NutritionBarcodeScanScreen />);

    await act(async () => {
      mockCameraProps.onBarcodeScanned?.({ data: "4820001234567" });
    });

    await waitFor(() => {
      expect(mockedEmitPrefill).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Milk Test",
          kcal: "250",
          barcode: "4820001234567",
        }),
      );
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
