// Web Push (VAPID + `PushManager`) — весь код, який:
//  - використовується лише у веб-рантаймі (Chrome/Firefox/Edge/Safari PWA);
//  - у Capacitor-shell-і мертвий, бо native WebView ігнорує Service
//    Worker і push-реєстрація йде через `@capacitor/push-notifications`
//    (FCM/APNs) у `@shared/lib/pushNative`.
//
// Ізоляція у власний модуль дає `usePushNotifications.ts` можливість
// підтягувати цей шматок через `import()` **лише на веб-білді**. Разом
// з build-time прапором `VITE_TARGET=capacitor` (див. `vite.config.js`)
// Rollup DCE-виносить `import("./usePushNotifications.webpush")` з
// capacitor-білда повністю — і окремий async-chunk у
// `apps/server/dist/assets/` для shell-а не емітиться.

/**
 * Конвертує URL-safe base64 (як у VAPID public key) у `Uint8Array` —
 * формат, який очікує `PushSubscriptionOptions.applicationServerKey`
 * (`BufferSource`). Окрема функція тримається тут, а не у `@shared/lib`,
 * щоб не тягнути її у main bundle ні для shell, ні для web (у web вона
 * вантажиться async-ом разом з рештою web-push флоу).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export interface WebPushSubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Виконує `navigator.serviceWorker.ready` + `pushManager.subscribe()` з
 * VAPID-ключем і повертає нормалізований payload (`endpoint` +
 * `keys.{p256dh, auth}`) для `PushRegisterRequest`.
 *
 * Кидає, якщо subscription прийшов без endpoint або ключів —
 * `api.push.register` з `platform: "web"` без них не пройде zod-валідацію.
 */
export async function subscribeToWebPush(
  publicKey: string,
): Promise<WebPushSubscriptionPayload> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  // `PushSubscription.toJSON()` повертає `{ endpoint, keys: { p256dh, auth } }`
  // (RFC 8030). Мапимо у `PushRegisterRequest`-форму без зайвих полів.
  const json = sub.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing endpoint or keys");
  }
  return { endpoint, p256dh, auth };
}

/**
 * Шукає активний `PushSubscription` у `pushManager` і, якщо знайдено,
 * викликає `unsubscribe()`. Повертає `endpoint` розписаної підписки
 * (або `null`), щоб хук міг послати серверний `api.push.unregister` з
 * правильним ключем — і тільки після того, як локальний unsubscribe
 * вже гарантовано пройшов.
 */
export async function unsubscribeFromWebPush(): Promise<string | null> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
