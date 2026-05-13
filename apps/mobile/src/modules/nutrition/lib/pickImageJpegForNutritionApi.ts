import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

export type PickImageJpegResult =
  | { status: "ok"; base64: string; mimeType: "image/jpeg" }
  | { status: "cancel" }
  | { status: "error"; message: string };

/**
 * On iOS once the user denies a permission the system dialog never
 * fires again — every subsequent `requestPermissionsAsync` returns
 * `granted: false, canAskAgain: false` silently. The web fallback toast
 * left users stuck with no way to recover. This helper surfaces a
 * native `Alert` with a `Linking.openSettings()` CTA whenever
 * `canAskAgain` is false so the user can flip the toggle in iOS / Android
 * Settings and retry. When the OS can still ask (first launch, or
 * Android with `shouldShowRequestPermissionRationale === true`) we keep
 * the original "toast"-style error so the calling sheet renders its
 * inline message instead.
 */
function buildPermissionDeniedResult(
  canAskAgain: boolean,
  message: string,
  alertTitle: string,
): PickImageJpegResult {
  if (!canAskAgain) {
    // Fire-and-forget — the alert lives on the native UI thread and the
    // caller already returns synchronously to its own error path. We
    // can't `await` user choice because `Alert.alert` is not promised.
    Alert.alert(
      alertTitle,
      message,
      [
        { text: "Скасувати", style: "cancel" },
        {
          text: "Відкрити налаштування",
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ],
      { cancelable: true },
    );
  }
  return { status: "error", message };
}

async function readUriAsJpegBase64(uri: string): Promise<PickImageJpegResult> {
  const manip = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
  );
  const b64 = await FileSystem.readAsStringAsync(manip.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!b64) {
    return { status: "error", message: "Не вдалося прочитати зображення." };
  }
  if (b64.length > 5_500_000) {
    return {
      status: "error",
      message:
        "Фото ще завелике після стиснення. Оберіть знімок меншої роздільної здатності.",
    };
  }
  return { status: "ok", base64: b64, mimeType: "image/jpeg" };
}

/**
 * Галерея → стиснення (max ~1.2k px) → base64 для POST /api/nutrition/analyze-photo.
 *
 * Якщо користувач відхилив дозвіл і `canAskAgain` тепер false, показуємо
 * нативний `Alert` з кнопкою «Відкрити налаштування» через
 * `Linking.openSettings()` — без цього на iOS неможливо повернутися в
 * системний діалог.
 */
export async function pickResizeAndReadBase64Jpeg(): Promise<PickImageJpegResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return buildPermissionDeniedResult(
      perm.canAskAgain,
      "Потрібен доступ до фото. Дозвольте додатку відкрити фотогалерею у налаштуваннях.",
      "Доступ до фото",
    );
  }
  const pick = await ImagePicker.launchImageLibraryAsync({
    // `MediaTypeOptions.Images` was deprecated in expo-image-picker 16
    // (Expo SDK 52) in favour of the string-array shape. Using the
    // legacy enum logs a deprecation warning on every press and is
    // scheduled for removal in SDK 53.
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.85,
  });
  if (pick.canceled || !pick.assets?.[0]) {
    return { status: "cancel" };
  }
  return readUriAsJpegBase64(pick.assets[0].uri);
}

/**
 * Камера → той самий pipeline JPEG/base64, що й галерея.
 *
 * Якщо користувач відхилив дозвіл і `canAskAgain` тепер false, показуємо
 * нативний `Alert` з кнопкою «Відкрити налаштування» через
 * `Linking.openSettings()`.
 */
export async function captureResizeAndReadBase64Jpeg(): Promise<PickImageJpegResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return buildPermissionDeniedResult(
      perm.canAskAgain,
      "Потрібен доступ до камери. Дозвольте додатку використовувати камеру у налаштуваннях.",
      "Доступ до камери",
    );
  }
  const shot = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.85,
  });
  if (shot.canceled || !shot.assets?.[0]) {
    return { status: "cancel" };
  }
  return readUriAsJpegBase64(shot.assets[0].uri);
}
