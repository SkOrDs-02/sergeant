import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { ApiClient } from "@sergeant/api-client";

type NativePushPlatform = "ios" | "android";

/**
 * Мобільний push-реєстратор.
 *
 * Викликається з `PushRegistrar` відразу після того, як `useUser()`
 * повертає авторизованого користувача. Логіка:
 *
 * 1. Перевіряємо/просимо дозвіл через `expo-notifications`.
 * 2. Отримуємо нативний APNs/FCM токен через `getDevicePushTokenAsync()`
 *    для dev-build / standalone. В Expo Go нативний канал недоступний,
 *    тому fallback — `getExpoPushTokenAsync()` (лише для dev-дебагу, для
 *    прод-пушів сервер має говорити з APNs/FCM напряму, див.
 *    `docs/mobile/overview.md`).
 * 3. Шлемо `api.push.register({ platform, token })` — не прямий `fetch`.
 * 4. На успіх кладемо токен в `AsyncStorage` під ключем, що містить
 *    `userId` (`push:lastToken:<userId>`), щоб не шарашити сервер
 *    повторно на кожен старт — і водночас гарантовано перереєструвати
 *    токен, якщо на тому самому пристрої залогінився інший користувач
 *    (native push токени пер-девайс, а не пер-юзер — без userId-scope
 *    сервер би так і залишив токен привʼязаним до попереднього акаунта).
 */
const STORAGE_KEY_PREFIX = "push:lastToken:";

function storageKey(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export type RegisterPushResult =
  | { status: "registered"; platform: NativePushPlatform; token: string }
  | { status: "skipped"; reason: RegisterPushSkipReason };

export type RegisterPushSkipReason =
  | "permission-denied"
  | "unsupported-platform"
  | "token-unavailable"
  | "already-synced";

export interface RegisterPushOptions {
  /**
   * Якщо true — шле запит навіть коли в `AsyncStorage` той самий токен
   * уже збережений. Корисно для ручного «Повторити реєстрацію».
   */
  force?: boolean;
}

function resolvePlatform(): NativePushPlatform | null {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return null;
}

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

async function ensurePermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  if (current.status === "denied" && !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return (
    next.granted ||
    next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function getNativeToken(): Promise<string | null> {
  if (isExpoGo()) {
    // Expo Go не має entitlements для APNs/FCM. Dev-fallback — Expo
    // push token. Продакшн-сервер очікує native token, тому логуємо
    // попередження.
    console.warn(
      "[registerPush] Running inside Expo Go — falling back to Expo push token. " +
        "Build a dev-client (`eas build --profile development`) to get native " +
        "APNs/FCM tokens for production push.",
    );
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync();
      return expoToken.data ?? null;
    } catch (error) {
      console.warn("[registerPush] getExpoPushTokenAsync failed", error);
      return null;
    }
  }
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    return typeof device.data === "string" ? device.data : null;
  } catch (error) {
    console.warn("[registerPush] getDevicePushTokenAsync failed", error);
    return null;
  }
}

/**
 * Основна точка входу. Поверне `{ status: "registered", ... }` якщо
 * сервер прийняв токен. У разі skip — поверне причину, без кидання
 * помилки (PushRegistrar сам вирішує, чи ретраїти).
 */
export async function registerPush(
  api: ApiClient,
  userId: string,
  { force = false }: RegisterPushOptions = {},
): Promise<RegisterPushResult> {
  const platform = resolvePlatform();
  if (!platform) return { status: "skipped", reason: "unsupported-platform" };

  const allowed = await ensurePermissions();
  if (!allowed) return { status: "skipped", reason: "permission-denied" };

  const token = await getNativeToken();
  if (!token) return { status: "skipped", reason: "token-unavailable" };

  const key = storageKey(userId);
  if (!force) {
    const cached = await AsyncStorage.getItem(key);
    if (cached === token) {
      return { status: "skipped", reason: "already-synced" };
    }
  }

  await api.push.register({ platform, token });
  await AsyncStorage.setItem(key, token);

  return { status: "registered", platform, token };
}

export const __testables = {
  STORAGE_KEY_PREFIX,
  storageKey,
  extractSessionTokenReason: (result: RegisterPushResult) =>
    result.status === "skipped" ? result.reason : null,
};
