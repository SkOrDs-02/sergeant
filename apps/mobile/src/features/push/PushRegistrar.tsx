import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";

import { useApiClient, useUser } from "@sergeant/api-client/react";

import { createModuleStorage, safeReadStringLS } from "@/lib/storage";

import { registerPush } from "./registerPush";

// Dev-only smoke check that verifies the MMKV-backed storage adapter is
// reachable from the RN runtime. Removed once real callers (Phase 3)
// start using the adapter.
const SMOKE_KEY = "sergeant.mobile.storage.smoke";
const smokeStorage = createModuleStorage({ name: "storageSmoke" });

function runStorageSmokeCheck(): void {
  if (!__DEV__) return;
  try {
    const payload = { t: Date.now() };
    smokeStorage.writeJSON(SMOKE_KEY, payload);
    const roundTripped = smokeStorage.readJSON<typeof payload>(SMOKE_KEY);
    const raw = safeReadStringLS(SMOKE_KEY);
    console.info(
      "[storage] MMKV round-trip ok:",
      roundTripped?.t === payload.t,
      "raw bytes:",
      raw?.length ?? 0,
    );
    smokeStorage.removeItem(SMOKE_KEY);
  } catch (error) {
    console.warn("[storage] MMKV smoke check failed", error);
  }
}

/**
 * No-UI компонент, що монтується у root-дереві (`app/_layout.tsx`) і
 * відповідає за передачу native push-токена на сервер після логіну.
 *
 * Чому useUser, а не окремий гуард зверху: root `_layout.tsx` у expo-
 * router живе над групами `(auth)` та `(tabs)`, тож ми не можемо
 * рендерити `PushRegistrar` «фізично всередині authenticated-гілки» без
 * дублювання провайдерів. Замість цього компонент сам перевіряє статус
 * через `useUser()` і запускає `registerPush` лише коли зʼявляється
 * активний `data.user`. Після sign-out (`data.user === null`) прапорець
 * скидається, тому наступний логін знову тригерить реєстрацію (з
 * AsyncStorage-кешем у `registerPush`).
 *
 * Помилки ловимо і логуємо — пуші це побічна фіча, не ламаємо UI.
 */
export function PushRegistrar() {
  const api = useApiClient();
  const { data } = useUser();
  const userId = data?.user?.id ?? null;

  const inFlightRef = useRef(false);
  const lastRegisteredUserRef = useRef<string | null>(null);

  useEffect(() => {
    runStorageSmokeCheck();
  }, []);

  useEffect(() => {
    if (!userId) {
      lastRegisteredUserRef.current = null;
      return;
    }
    if (lastRegisteredUserRef.current === userId || inFlightRef.current) return;
    inFlightRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const result = await registerPush(api, userId);
        if (cancelled) return;
        lastRegisteredUserRef.current = userId;
        if (result.status === "registered") {
          console.info(
            `[PushRegistrar] registered ${result.platform} push token`,
          );
        } else {
          console.info(`[PushRegistrar] skipped: ${result.reason}`);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[PushRegistrar] failed to register push token", error);
        }
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, userId]);

  // Native push tokens rotate without warning — FCM rotates on app
  // reinstall, data clear, or OEM-specific lifecycle events; Apple
  // rotates the APNs device token on restore/reinstall. Without a
  // listener, a rotated token is only re-registered after the next
  // sign-out + sign-in cycle, leaving the server with a stale push
  // target that silently fails to deliver. `addPushTokenListener`
  // fires on every rotation; we re-run `registerPush` with `force:
  // true` so the `already-synced` short-circuit doesn't suppress the
  // re-registration (the cached AsyncStorage token will be stale).
  useEffect(() => {
    if (!userId) return;
    const sub = Notifications.addPushTokenListener(() => {
      void (async () => {
        try {
          const result = await registerPush(api, userId, { force: true });
          if (result.status === "registered") {
            console.info(
              `[PushRegistrar] re-registered ${result.platform} push token after rotation`,
            );
          } else {
            console.info(
              `[PushRegistrar] post-rotation register skipped: ${result.reason}`,
            );
          }
        } catch (error) {
          console.warn(
            "[PushRegistrar] failed to re-register push token after rotation",
            error,
          );
        }
      })();
    });
    return () => {
      sub.remove();
    };
  }, [api, userId]);

  return null;
}
