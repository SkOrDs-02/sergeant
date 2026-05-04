/**
 * Persistent bearer-token storage для Capacitor WebView.
 *
 * Зберігає токен у нативному secure-storage із явними hardening-налаштуваннями
 * ([H1](../../../docs/security/hardening/H1-mobile-bearer-storage.md)):
 *
 * - **iOS** → Keychain з `KeychainAccess.afterFirstUnlockThisDeviceOnly`
 *   (доступний тільки після першого unlock-у і **не** мігрує на інший
 *   девайс через iCloud-backup) і `setSynchronize(false)` (іспортуємо із
 *   iCloud Keychain sync — токен **не** з'явиться на іншому пристрої з тим
 *   самим AppleID).
 * - **Android** → AndroidX EncryptedSharedPreferences (AES-GCM, ключ у
 *   AndroidKeyStore). Файл захищений `android:allowBackup="false"` у
 *   `AndroidManifest.xml`, тому `adb backup` нічого не дістане.
 * - **Web** → fallback на `localStorage` (тільки для DevTools-браузера;
 *   у proді браузерний bundle взагалі не імпортує цей модуль — див. нижче).
 *
 * Веб-сторінка всередині WebView НЕ бачить серверні cookie надійно
 * (`SameSite=None; Secure` тримається крихко на колд-старті Android,
 * а на iOS WebView взагалі ріжеться ITP-обмеженнями). Тому shell живе
 * на bearer-токенах: web читає токен зі сховища і додає у
 * `Authorization: Bearer <token>` на кожен запит, сервер (Better Auth
 * `bearer()` плагін) резолвить його у сесію так само, як кукі.
 *
 * **Важливо:** цей файл свідомо дозволяє дизайнеру динамічно-імпортувати
 * його з `apps/web` (`await import('@sergeant/mobile-shell/auth-storage')`).
 * Тільки при цьому умовному шляху (`isCapacitor()`) веб підтягує плагіни
 * у lazy-chunk — браузерний bundle лишається чистим.
 *
 * **Міграція з `@capacitor/preferences`** (для існуючих юзерів, що логінилися
 * до landing-у H1): на першому виклику `getBearerToken()` ми перевіряємо
 * старий ключ `auth.bearer` у `Preferences`, переносимо його у secure-storage
 * та видаляємо звідти. Якщо secure-storage недоступний (тестовий мок,
 * unsupported platform) — повертаємо токен напряму, не порушуючи UX.
 */
import { Preferences } from "@capacitor/preferences";
import {
  KeychainAccess,
  SecureStorage,
} from "@aparajita/capacitor-secure-storage";

/**
 * Ключ у secure-storage. `auth.bearer` — namespaced, щоб уникнути колізій з
 * можливими майбутніми Better-Auth ключами (які краще тримати в одному
 * неймспейсі `auth.*`).
 *
 * NB: secure-storage додає власний префікс (`capacitor-storage_` за
 * замовчуванням), тож реальний key у Keychain — `capacitor-storage_auth.bearer`.
 */
const BEARER_KEY = "auth.bearer";

/**
 * Same key, але у legacy `@capacitor/preferences` (UserDefaults на iOS,
 * SharedPreferences на Android). Читаємо звідти **тільки на міграції**,
 * щоб не втратити сесії юзерів, які логінилися до H1-фіксу.
 */
const LEGACY_BEARER_KEY = "auth.bearer";

/**
 * Налаштовуємо secure-storage **один раз** на першому виклику. Робимо це
 * лазі, щоб тести (які мокують модуль) могли не викликати реального плагіна.
 * Якщо ініціалізація провалиться (нативний плагін не зареєстрований у
 * web-стенді або у тестах) — мовчки ігноруємо, щоб не падати на cold-start.
 */
let configurePromise: Promise<void> | null = null;
function ensureConfigured(): Promise<void> {
  if (configurePromise) return configurePromise;
  configurePromise = (async () => {
    try {
      // iCloud Keychain sync OFF — токен НЕ повинен з'являтись на іншому
      // девайсі з тим самим AppleID.
      await SecureStorage.setSynchronize(false);
      // Default accessibility — `afterFirstUnlockThisDeviceOnly`. Картка H1
      // явно вимагає цей режим; він дозволяє push-handler-ам працювати
      // після перезавантаження телефону (background-flow), але `ThisDeviceOnly`
      // блокує міграцію через encrypted device-backup.
      await SecureStorage.setDefaultKeychainAccess(
        KeychainAccess.afterFirstUnlockThisDeviceOnly,
      );
    } catch {
      // Тихо — у юніт-тестах / web-stub-і це може кинути; не валимо init-flow.
    }
  })();
  return configurePromise;
}

/**
 * Одноразова міграція з `@capacitor/preferences` у secure-storage.
 * Викликається на першому read-у. Якщо в legacy-сховищі є токен — переносимо
 * у secure-storage (зі `setSynchronize(false)` і `afterFirstUnlockThisDeviceOnly`)
 * і видаляємо із legacy. Помилки не пробрасуємо — токен залишиться у legacy
 * і користувач не помітить downgrade.
 */
let migratePromise: Promise<string | null> | null = null;
function migrateLegacyTokenIfPresent(): Promise<string | null> {
  if (migratePromise) return migratePromise;
  migratePromise = (async () => {
    try {
      const { value } = await Preferences.get({ key: LEGACY_BEARER_KEY });
      if (!value) return null;
      try {
        await SecureStorage.set(BEARER_KEY, value);
        await Preferences.remove({ key: LEGACY_BEARER_KEY });
      } catch {
        // Secure-storage недоступний — повертаємо legacy-значення без видалення,
        // щоб юзер продовжив працювати на старому storage-і.
        return value;
      }
      return value;
    } catch {
      return null;
    }
  })();
  return migratePromise;
}

/** Читає збережений bearer-токен або `null`, якщо користувач ще не логінувався. */
export async function getBearerToken(): Promise<string | null> {
  await ensureConfigured();
  const fromSecure = (await SecureStorage.get(BEARER_KEY)) as string | null;
  if (fromSecure !== null) return fromSecure;
  // Перший read після оновлення додатка — токен ще у legacy. Мігруємо.
  return migrateLegacyTokenIfPresent();
}

/** Перезаписує bearer-токен (викликаємо після успішного `sign-in` / `sign-up`). */
export async function setBearerToken(token: string): Promise<void> {
  await ensureConfigured();
  await SecureStorage.set(BEARER_KEY, token);
  // Defensive cleanup на випадок, якщо у legacy-сховищі лежить застарілий токен:
  // повторне видалення безпечне (no-op для відсутнього ключа).
  try {
    await Preferences.remove({ key: LEGACY_BEARER_KEY });
  } catch {
    // ignore — legacy-cleanup не блокує set-flow.
  }
}

/** Видаляє bearer-токен (на `sign-out` або при 401 з невалідним токеном). */
export async function clearBearerToken(): Promise<void> {
  await ensureConfigured();
  await SecureStorage.remove(BEARER_KEY);
  try {
    await Preferences.remove({ key: LEGACY_BEARER_KEY });
  } catch {
    // ignore — legacy-cleanup не блокує clear-flow.
  }
}

/**
 * **Тільки для тестів.** Ресетить лазі-стейт між тестами, щоб
 * `ensureConfigured()` / `migrateLegacyTokenIfPresent()` запускались знову.
 */
export function _resetForTests(): void {
  configurePromise = null;
  migratePromise = null;
}
