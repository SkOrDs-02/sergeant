import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePushRegister, usePushUnregister } from "@sergeant/api-client/react";
import type { PushRegisterRequest } from "@sergeant/api-client";
import { getPlatform, isCapacitor } from "@sergeant/shared";
import { isApiError, pushApi } from "@shared/api";
import { pushKeys } from "@shared/lib/api/queryKeys";
import {
  safeReadStringLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import {
  getStoredNativePushToken,
  subscribeNativePush,
  unsubscribeNativePush,
} from "@shared/lib/adapters/pushNative";

const PUSH_SUB_KEY = "hub_push_subscribed";

// Весь web-push флоу (`urlBase64ToUint8Array` + `pushManager.subscribe/
// getSubscription`) ізольований у `./usePushNotifications.webpush.ts`
// і підтягується динамічним `import()` нижче. У capacitor-білді
// `import.meta.env.VITE_TARGET === "capacitor"` (інлайниться через
// `define` у `apps/web/vite.config.js`) => ранній `return` робить увесь
// web-branch + `import()` мертвим, Rollup DCE викидає цей chunk з
// shell-бандла повністю. У web-білді chunk емітиться окремо і
// вантажиться лише коли користувач реально клацне "увімкнути push".
type WebPushModule = typeof import("./usePushNotifications.webpush");
let webPushModulePromise: Promise<WebPushModule> | null = null;
function loadWebPushModule(): Promise<WebPushModule> {
  if (!webPushModulePromise) {
    webPushModulePromise = import("./usePushNotifications.webpush");
  }
  return webPushModulePromise;
}

function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Високорівневий feature-detect для UI-тоглу: на native WebView (Capacitor)
 * ми завжди показуємо перемикач — дозволи й токен отримуються через
 * `@capacitor/push-notifications` незалежно від наявності Web Push API.
 * На вебі тримаємо старий detect (SW + PushManager + Notification).
 */
function isPushSupported(): boolean {
  return isCapacitor() || isWebPushSupported();
}

/**
 * Читає `Notification.permission` лише коли Notification API справді
 * доступне. На Capacitor-only WebView глобалу може не бути — у такому
 * разі `"default"` сигналізує UI, що реальний стан буде відомий у
 * мідл-процесі `subscribe()` (native permission prompt плагіна).
 */
function readInitialPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

export interface UsePushNotificationsResult {
  supported: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

// Ключ `pushKeys.vapid` — сервер не ротує VAPID public key, тож кешуємо
// назавжди (Infinity/Infinity). Зайвий мережевий похід перед кожним
// натисканням "увімкнути сповіщення" був помітний на слабкому 3G.

/**
 * Хук для управління Web Push підпискою.
 *
 * Мутації (subscribe/unsubscribe) йдуть через `useMutation`, щоб:
 *  - `isPending` замінив рукописний `loading`-стейт;
 *  - `onError` централізовано логував помилку без try/finally-шуму;
 *  - інвалідація `pushKeys.status` після successful підписки дозволяла
 *    іншим місцям (напр., налаштування модулів) спостерігати стан без
 *    CustomEvent-ів.
 *
 * Локальна `subscribed`-мітка в localStorage — оптимістичний кеш для
 * першого рендеру, щоб UI не мерехтів між "не підписано" і "підписано".
 * Доступ через `safeReadStringLS`/`safeWriteLS`/`safeRemoveLS`, щоб quota /
 * private-mode крахи не валили хук на маунт.
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const supported = isPushSupported();
  const native = isCapacitor();
  const queryClient = useQueryClient();
  // `usePushRegister`/`usePushUnregister` — канонічні хуки уніфікованого
  // push-API (`@sergeant/api-client`). Вони задають `mutationKey`
  // (`apiMutationKeys.push.register/unregister`), тож сторонні компоненти
  // можуть через `useIsMutating` спостерігати стан без дублікату `useState`.
  const pushRegister = usePushRegister();
  const pushUnregister = usePushUnregister();

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (!supported) return "denied";
    return readInitialPermission();
  });
  const [subscribed, setSubscribed] = useState<boolean>(
    () => safeReadStringLS(PUSH_SUB_KEY) === "1",
  );

  useEffect(() => {
    // Native-гілка тримає permission-стан всередині плагіна — читати
    // `Notification.permission` у WebView некоректно (web API тут може
    // взагалі не відображати APNs/FCM-дозвіл).
    if (!supported || native) return;
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, [supported, native]);

  // Prefetch VAPID на маунт — коли користувач натисне "увімкнути",
  // ключ вже буде в кеші й ми одразу підемо у pushManager.subscribe.
  // Native-гілка VAPID не використовує (FCM/APNs token-и opaque), тож
  // ранній похід за ключем був би зайвим мережевим трафіком у shell-і.
  const vapidQuery = useQuery({
    queryKey: pushKeys.vapid,
    queryFn: () => pushApi.getVapidPublic(),
    enabled: supported && !native,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!supported) return;

      // Native-гілка: `@capacitor/push-notifications` сам керує
      // дозволом/реєстрацією у FCM/APNs, Web Push API (SW + VAPID) тут
      // не чіпаємо.
      if (native) {
        const result = await subscribeNativePush();
        if (!result) return;
        setPermission("granted");
        const payload: PushRegisterRequest = {
          platform: result.platform,
          token: result.token,
        };
        await pushRegister.mutateAsync(payload);
        safeWriteLS(PUSH_SUB_KEY, "1");
        setSubscribed(true);
        queryClient.invalidateQueries({ queryKey: pushKeys.status });
        return;
      }

      // Build-time guard: у capacitor-білді `VITE_TARGET` інлайниться у
      // `"capacitor"` і Rollup викидає все, що нижче, як unreachable —
      // включно з `import("./usePushNotifications.webpush")`. Runtime
      // `native`-гілку вище вже обробили, тож сюди у shell не
      // дістанемось, але явний `return` потрібен саме для DCE.
      if (import.meta.env.VITE_TARGET === "capacitor") return;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const vapid =
        vapidQuery.data ??
        (await queryClient.fetchQuery({
          queryKey: pushKeys.vapid,
          queryFn: () => pushApi.getVapidPublic(),
          staleTime: Infinity,
          gcTime: Infinity,
        }));
      const publicKey = vapid?.publicKey;
      if (!publicKey) throw new Error("VAPID not configured");

      const { subscribeToWebPush } = await loadWebPushModule();
      const { endpoint, p256dh, auth } = await subscribeToWebPush(publicKey);
      const payload: PushRegisterRequest = {
        platform: "web",
        token: endpoint,
        keys: { p256dh, auth },
      };
      await pushRegister.mutateAsync(payload);

      safeWriteLS(PUSH_SUB_KEY, "1");
      setSubscribed(true);
      queryClient.invalidateQueries({ queryKey: pushKeys.status });
    },
    onError: (e) => {
      const message = isApiError(e)
        ? e.serverMessage || `Server error ${e.status}`
        : (e as Error).message;
      console.warn("[push] subscribe failed:", message);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!supported) return;

      // Native-гілка: беремо кешований токен (якщо користувач уже
      // реєструвався у попередній сесії — `pushManager` у WebView
      // до нього не дотягнеться), прибираємо listener-и + викликаємо
      // `unregister()` через native gate, потім шлемо серверний
      // анрег. Web Push гілку сюди не тягнемо.
      if (native) {
        const cachedBefore = await getStoredNativePushToken();
        const cleared = await unsubscribeNativePush();
        const token = cleared ?? cachedBefore;
        // `getPlatform()` з `@sergeant/shared` повертає `"ios"`|`"android"`|`"web"`;
        // ми вже у `native`-гілці, тож web тут не трапляється, але підстраховуємось
        // fallback-ом на `android` (основний target FCM-реєстрацій).
        const detected = getPlatform();
        const platform = detected === "ios" ? "ios" : "android";
        if (token) {
          await pushUnregister
            .mutateAsync({ platform, token })
            .catch((err: unknown) => {
              // best-effort — локально вже розписалися, але хочемо бачити
              // серверні збої у Sentry/DevTools замість глухого silent fail.
              console.warn(
                "[push] native unregister failed (best-effort)",
                err,
              );
            });
        }
        safeRemoveLS(PUSH_SUB_KEY);
        setSubscribed(false);
        queryClient.invalidateQueries({ queryKey: pushKeys.status });
        return;
      }

      // Аналогічний build-time guard — у capacitor-білді web-гілка мертва
      // і `loadWebPushModule()` разом з нею DCE-виноситься.
      if (import.meta.env.VITE_TARGET === "capacitor") {
        safeRemoveLS(PUSH_SUB_KEY);
        setSubscribed(false);
        queryClient.invalidateQueries({ queryKey: pushKeys.status });
        return;
      }

      const { unsubscribeFromWebPush } = await loadWebPushModule();
      const endpoint = await unsubscribeFromWebPush();
      if (endpoint) {
        // Серверний анрег — best-effort: якщо сервер недоступний, локально
        // ми все одно розписалися (запис у БД зачистить cron або наступна
        // вдала підписка). Використовуємо уніфікований
        // `api.push.unregister` — через `apiMutationKeys.push.unregister`
        // трекається як окрема мутація в devtools.
        await pushUnregister
          .mutateAsync({ platform: "web", endpoint })
          .catch((err: unknown) => {
            console.warn("[push] web unregister failed (best-effort)", err);
          });
      }
      safeRemoveLS(PUSH_SUB_KEY);
      setSubscribed(false);
      queryClient.invalidateQueries({ queryKey: pushKeys.status });
    },
    onError: (e) => {
      const message = isApiError(e)
        ? e.serverMessage || `Server error ${e.status}`
        : (e as Error).message;
      console.warn("[push] unsubscribe failed:", message);
    },
  });

  const subscribe = useCallback(async (): Promise<void> => {
    if (subscribeMutation.isPending || unsubscribeMutation.isPending) return;
    await subscribeMutation.mutateAsync();
  }, [subscribeMutation, unsubscribeMutation.isPending]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (subscribeMutation.isPending || unsubscribeMutation.isPending) return;
    await unsubscribeMutation.mutateAsync();
  }, [subscribeMutation.isPending, unsubscribeMutation]);

  return {
    supported,
    permission,
    subscribed,
    loading: subscribeMutation.isPending || unsubscribeMutation.isPending,
    subscribe,
    unsubscribe,
  };
}
