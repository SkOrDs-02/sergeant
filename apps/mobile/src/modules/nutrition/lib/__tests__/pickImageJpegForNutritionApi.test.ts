/**
 * Coverage for the permission-denial paths in
 * `pickImageJpegForNutritionApi.ts`.
 *
 * Why test only the denial paths: the happy path involves
 * `expo-image-manipulator` + `expo-file-system` (native modules with no
 * pure-JS fallback). Exercising those would require a much heavier mock
 * setup that's already covered by the AddMealSheet integration tests.
 * Here we focus on the regression the T4 mobile QA audit surfaced:
 *
 * - `MediaTypeOptions.Images` (deprecated in expo-image-picker 16) is
 *   no longer used; the helper passes `['images']`.
 * - When the OS returns `granted: false` AND `canAskAgain: false` we
 *   surface a native `Alert` with a `Linking.openSettings()` CTA.
 * - When the OS can still ask (first launch / Android rationale) we
 *   keep the inline error string so the calling sheet renders it
 *   without the modal interruption.
 */

import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";

import {
  captureResizeAndReadBase64Jpeg,
  pickResizeAndReadBase64Jpeg,
} from "../pickImageJpegForNutritionApi";

jest.mock("expo-image-picker", () => ({
  __esModule: true,
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  // Intentionally NOT exporting `MediaTypeOptions` so that any future
  // regression that reaches back to the deprecated enum trips a
  // `Cannot read properties of undefined (reading 'Images')` at test
  // time.
}));

jest.mock("expo-image-manipulator", () => ({
  __esModule: true,
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));

jest.mock("expo-file-system", () => ({
  __esModule: true,
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

const mockedRequestMedia =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockedRequestCamera =
  ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const mockedLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockedAlert = jest.spyOn(Alert, "alert");
const mockedOpenSettings = jest
  .spyOn(Linking, "openSettings")
  .mockResolvedValue();

beforeEach(() => {
  mockedRequestMedia.mockReset();
  mockedRequestCamera.mockReset();
  mockedLaunchLibrary.mockReset();
  mockedAlert.mockReset();
  mockedOpenSettings.mockClear();
});

describe("pickResizeAndReadBase64Jpeg — permission gating", () => {
  it("returns an error AND opens the openSettings alert when canAskAgain is false", async () => {
    mockedRequestMedia.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: "denied",
    });

    const result = await pickResizeAndReadBase64Jpeg();

    expect(result.status).toBe("error");
    expect(mockedAlert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = mockedAlert.mock.calls[0]!;
    expect(title).toBe("Доступ до фото");
    const openSettingsButton = (
      buttons as Array<{ text: string; onPress?: () => void }>
    )?.find((b) => b.text === "Відкрити налаштування");
    expect(openSettingsButton).toBeDefined();
    // Simulate the user tapping "Відкрити налаштування".
    openSettingsButton!.onPress?.();
    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("returns an error but does NOT open the alert when canAskAgain is true", async () => {
    mockedRequestMedia.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: "undetermined",
    });

    const result = await pickResizeAndReadBase64Jpeg();

    expect(result.status).toBe("error");
    expect(mockedAlert).not.toHaveBeenCalled();
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });

  it("passes the non-deprecated `mediaTypes: ['images']` shape to launchImageLibraryAsync", async () => {
    mockedRequestMedia.mockResolvedValueOnce({
      granted: true,
      canAskAgain: true,
      status: "granted",
    });
    mockedLaunchLibrary.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    await pickResizeAndReadBase64Jpeg();

    expect(mockedLaunchLibrary).toHaveBeenCalledTimes(1);
    const [opts] = mockedLaunchLibrary.mock.calls[0] as [
      { mediaTypes: unknown },
    ];
    expect(opts.mediaTypes).toEqual(["images"]);
  });
});

describe("captureResizeAndReadBase64Jpeg — permission gating", () => {
  it("returns an error AND opens the openSettings alert when canAskAgain is false", async () => {
    mockedRequestCamera.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: "denied",
    });

    const result = await captureResizeAndReadBase64Jpeg();

    expect(result.status).toBe("error");
    expect(mockedAlert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = mockedAlert.mock.calls[0]!;
    expect(title).toBe("Доступ до камери");
    const openSettingsButton = (
      buttons as Array<{ text: string; onPress?: () => void }>
    )?.find((b) => b.text === "Відкрити налаштування");
    openSettingsButton!.onPress?.();
    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("returns an error but does NOT open the alert when canAskAgain is true", async () => {
    mockedRequestCamera.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: "undetermined",
    });

    const result = await captureResizeAndReadBase64Jpeg();

    expect(result.status).toBe("error");
    expect(mockedAlert).not.toHaveBeenCalled();
    expect(mockedOpenSettings).not.toHaveBeenCalled();
  });
});
