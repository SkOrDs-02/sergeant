/**
 * Native push subscription adapter для Capacitor WebView.
 *
 * Це єдине місце у workspace, де `@capacitor/push-notifications` і
 * `@capacitor/preferences` імпортуються **compile-time**. Веб-код
 * (`apps/web`) ніколи не тягне цей модуль напряму — він доступний
 * виключно через динамічний `import("@sergeant/mobile-shell/pushNative")`
 * у гейті `apps/web/src/shared/lib/adapters/pushNative.ts`, який в свою чергу
 * викликається тільки під guard-ом `isCapacitor()`. Завдяки цьому Rollup
 * виносить FCM/APNs-рантайм у окремий async chunk, який браузерні
 * користувачі ніколи не завантажують (див. `vite.config.js`, блок
 * `manualChunks`, catch-all для `@capacitor/*`).
 *
 * Чому listener-и треба **явно прибирати** на `unsubscribeNativePush()`:
 *   - `PushNotifications.addListener("registration", ...)` на Android
 *     зберігає посилання на JS-callback у нативному Bridge; між сесіями
 *     WebView (cold-start, HMR у LiveReload) вони акумулюються і
 *     `register()` починає резолвити resolve-и з попередніх mount-ів.
 *   - `removeAllListeners()` — офіційний API плагіна (`@since 1.0.0`)
 *     для очищення, еквівалент web-side `off()`-ів. Після нього
 *     `unregister()` вже не тригерить фантомні `registration`-колбеки.
 *
 * Чому `subscribeNativePush()` сам додає `registration` / `registrationError`
 * listener-и, а не реєструється глобально у `index.ts`:
 *   - Ми не хочемо тримати пам'ять під колбеки, поки юзер не натисне
 *     "увімкнути сповіщення" — це сотні KB нативного bridge-коду на
 *     iOS, який зайвий без згоди користувача.
 *   - Listener-и — локальні до одного виклику `register()` (resolve/reject
 *     Promise-а), після чого їх треба прибрати, щоб не ловити наступний
 *     `registration` (наприклад, якщо користувач перевідкрив додаток
 *     і ОС перевидала токен).
 *
 * Чому ми кешуємо opaque token у `@capacitor/preferences`:
 *   - Для `unsubscribeNativePush()` нам треба той самий токен, що ми
 *     відіслали на сервер, інакше `push_devices` soft-delete не знайде
 *     запис. Але native-`register()` після першої успішної реєстрації
 *     може не тригерити `registration` подію повторно — сховище у
 *     Keychain / EncryptedSharedPreferences є єдиним джерелом правди
 *     між cold-start-ами WebView.
 *   - Той же патерн, що у `auth-storage.ts`: namespaced ключ,
 *     get/set/clear. Веб-сторона синхронно не читає це сховище —
 *     через `@sergeant/mobile-shell/pushNative` gate.
 */
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  PushNotifications,
  type RegistrationError,
  type Token,
} from "@capacitor/push-notifications";

/**
 * Вузький union, симетричний `PushRegisterRequest["platform"]` у
 * `@sergeant/api-client`. `"web"` тут свідомо відсутній — native-шлях
 * завжди або iOS, або Android.
 */
export type NativePushPlatform = "ios" | "android";

/**
 * Результат успішної нативної реєстрації push-пристрою. `token` — opaque
 * APNs hex (iOS) або FCM registration token (Android), сервер трактує
 * його непрозоро і зберігає у `push_devices` (див. `apps/server/src/routes/push.ts`).
 */
export interface NativePushSubscription {
  platform: NativePushPlatform;
  token: string;
}

/**
 * Ключ у KV-сховищі для останнього отриманого native push-токена.
 * `push.native.token` — namespaced у тому ж `push.*`-префіксі, що й
 * майбутні push-налаштування (напр. локальні preference-и відображення).
 */
const NATIVE_PUSH_TOKEN_KEY = "push.native.token";

/**
 * Повертає `"ios"` або `"android"` для native WebView, `null` — якщо
 * plugin викликано не з native-контексту (захист для тестів / помилкового
 * прямого імпорту з веба). Рефлектує `Capacitor.getPlatform()`, а не
 * `process.platform`, щоб робилось виключно на runtime.
 */
function detectNativePlatform(): NativePushPlatform | null {
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") return platform;
  return null;
}

/**
 * Знімає всі push-listener-и, ігноруючи помилки плагіна. Спільна утиліта
 * для `subscribeNativePush` (clean-up перед новою реєстрацією, щоб старі
 * resolve-и з попередніх спроб не злетіли на поточний Promise) і для
 * `unsubscribeNativePush`.
 */
async function safeRemoveAllListeners(): Promise<void> {
  try {
    await PushNotifications.removeAllListeners();
  } catch {
    // Плагін на web-платформі кидає "not implemented" — це ок: ми
    // явно не очікуємо, що нас викличуть поза native, але на
    // мокнутому рантаймі (unit-test) не хочемо валити flow.
  }
}

/**
 * Запитує дозвіл на push, реєструє пристрій в FCM (Android) / APNs (iOS)
 * і резолвиться, коли плагін повідомить `"registration"` з токеном.
 *
 * Поведінка:
 *   1. `requestPermissions()` — якщо юзер відмовив, повертаємо
 *      rejection з `"push-permission-denied"`. Calling-hook мапить це
 *      у UI-повідомлення (без toast-а з тех. помилкою).
 *   2. Ставимо одноразові listener-и на `"registration"` і
 *      `"registrationError"` (resolve/reject першого спрацьованого),
 *      після resolve/reject прибираємо ОБИДВА, щоб не реагувати на
 *      повторні події ОС.
 *   3. `register()` — дозволяє плагіну почати реєстрацію у FCM/APNs.
 *   4. На resolve зберігаємо token у `@capacitor/preferences`, щоб
 *      `unsubscribeNativePush()` потім знав, який токен слати на
 *      `/api/v1/push/unregister`.
 *
 * НЕ використовує `Notification.requestPermission()` / Service Worker —
 * native-гілка повністю ортогональна до Web Push, і SW-реєстрації у
 * WebView на iOS взагалі немає.
 */
export async function subscribeNativePush(): Promise<NativePushSubscription> {
  const platform = detectNativePlatform();
  if (!platform) {
    throw new Error("push-native-unavailable");
  }

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    throw new Error("push-permission-denied");
  }

  // Очищаємо хвости попередніх реєстрацій — на Android listener-и
  // персистяться між mount-ами WebView і можуть резолвити наш Promise
  // старим токеном ще до того, як `register()` зробить нову ітерацію.
  await safeRemoveAllListeners();

  const token = await new Promise<string>((resolve, reject) => {
    let registrationHandle: PluginListenerHandle | undefined;
    let errorHandle: PluginListenerHandle | undefined;
    let settled = false;

    const cleanup = async (): Promise<void> => {
      try {
        await registrationHandle?.remove();
      } catch {
        // handle.remove() може бути недоступним у старіших версіях
        // плагіна — fallback на global removeAllListeners().
      }
      try {
        await errorHandle?.remove();
      } catch {
        /* noop — див. коментар вище */
      }
      await safeRemoveAllListeners();
    };

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      void cleanup().finally(fn);
    };

    void PushNotifications.addListener("registration", (t: Token) => {
      settle(() => {
        if (typeof t.value === "string" && t.value.length > 0) {
          resolve(t.value);
        } else {
          reject(new Error("push-registration-empty-token"));
        }
      });
    })
      .then((h) => {
        registrationHandle = h;
      })
      .catch((err) => {
        settle(() => reject(err as Error));
      });

    void PushNotifications.addListener(
      "registrationError",
      (e: RegistrationError) => {
        settle(() => reject(new Error(e.error || "push-registration-error")));
      },
    )
      .then((h) => {
        errorHandle = h;
      })
      .catch((err) => {
        settle(() => reject(err as Error));
      });

    // `register()` повертає одразу; реальний результат приходить через
    // listener вище. Якщо саме цей виклик провалився синхронно —
    // мапимо це у reject Promise-а.
    void PushNotifications.register().catch((err: unknown) => {
      settle(() =>
        reject(err instanceof Error ? err : new Error("push-register-failed")),
      );
    });
  });

  await setStoredNativePushToken(token);
  return { platform, token };
}

/**
 * Знімає push-реєстрацію: прибирає listener-и, викликає `unregister()`
 * (на Android чистить FCM token у Firebase, на iOS — APNs registration),
 * чистить локальний кеш токена. Мовчки ковтає будь-які помилки
 * (idempotent): якщо плагін недоступний або вже без реєстрації, UI все
 * одно має перейти у стан "виключено".
 *
 * Повертає кешований токен (який був в `@capacitor/preferences` до
 * чистки), щоб calling-hook міг відправити `/api/v1/push/unregister`
 * з правильним ідентифікатором.
 */
export async function unsubscribeNativePush(): Promise<string | null> {
  const cached = await getStoredNativePushToken();

  await safeRemoveAllListeners();

  try {
    await PushNotifications.unregister();
  } catch {
    // На web-платформі або у тестах плагін кидає "not implemented";
    // не критично — state-вихід все одно проганяємо, щоб UI не застряг
    // у "увімкнено" після fail-у native-шару.
  }

  await clearStoredNativePushToken();
  return cached;
}

/**
 * Читає збережений native push-токен або `null`, якщо ще не
 * реєструвалися (або після `clearStoredNativePushToken`).
 */
export async function getStoredNativePushToken(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: NATIVE_PUSH_TOKEN_KEY });
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Зберігає останній отриманий native push-токен у безпечне сховище
 * (Keychain iOS / EncryptedSharedPreferences Android).
 */
export async function setStoredNativePushToken(token: string): Promise<void> {
  try {
    await Preferences.set({ key: NATIVE_PUSH_TOKEN_KEY, value: token });
  } catch {
    // Збій збереження не ламає user-flow: у найгіршому випадку
    // на наступному unsubscribe ми просто не матимемо опорного
    // токена і серверний запис буде почищено cron-ом неактивних.
  }
}

/** Видаляє кешований native push-токен (на `unsubscribe` або 401 з сервера). */
export async function clearStoredNativePushToken(): Promise<void> {
  try {
    await Preferences.remove({ key: NATIVE_PUSH_TOKEN_KEY });
  } catch {
    // Symmetric з set: fallback — токен перезапишеться при наступній
    // успішній реєстрації.
  }
}
