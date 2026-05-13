import "../global.css";

import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiClientProvider } from "@sergeant/api-client/react";

import { apiClient } from "@/api/apiClient";
import { installE2EAuthMock } from "@/auth/e2eAuthMock";
import { ErrorBoundary as RootErrorBoundary } from "@/core/ErrorBoundary";
import { SegmentErrorBoundary } from "@/core/SegmentErrorBoundary";
import { SyncStatusOverlay } from "@/core/SyncStatusOverlay";
import { useBackToExit } from "@/core/useBackToExit";
import { bootSyncEngineWriter } from "@/core/syncEngine/singleton";
import { ColorSchemeBridge } from "@/core/theme/ColorSchemeBridge";
import { AnalyticsIdentityBridge } from "@/features/analytics/AnalyticsIdentityBridge";
import { PushRegistrar } from "@/features/push/PushRegistrar";
// Registers the mobile `expo-haptics`-based adapter on the shared
// haptic contract (`@sergeant/shared`). Import for side effects only.
import "@/lib/haptic";
// Registers the mobile `expo-file-system` + `expo-sharing` adapter on the
// shared file-download contract (`@sergeant/shared`). Import for side effects only.
import "@/lib/fileDownload";
// Registers the mobile `expo-document-picker` + `expo-file-system` adapter on
// the shared file-import contract (`@sergeant/shared`). Import for side effects only.
import "@/lib/fileImport";
// Registers the mobile `Keyboard.addListener`-based adapter on the shared
// visual-keyboard-inset contract (`@sergeant/shared`). Import for side
// effects only.
import "@/hooks/useVisualKeyboardInset";
import { captureError, initObservability } from "@/lib/observability";
import { IdentityBridge } from "@/observability/IdentityBridge";
import { initPostHog } from "@/lib/observability/posthog";
import { bootstrapEncryptedStorage } from "@/lib/storageEncryption";
import { bootstrapMobileKvStore } from "@/core/db/kvStoreBoot";
import { useDeepLinks } from "@/lib/useDeepLinks";
import { QueryProvider } from "@/providers/QueryProvider";
import { ToastContainer, ToastProvider } from "@/components/ui/Toast";

// Hold the native splash screen up until storage encryption bootstrap
// finishes. Without this gate the React tree mounts against the
// plaintext MMKV instance for a few frames and CloudSync / module
// stores would race the swap. We `.catch` any rejection because the
// API is stable enough that an exception here is itself a bug.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already prevented or platform doesn't support it — non-fatal */
});

// E2E mock-auth fetch interceptor — активний лише за
// `EXPO_PUBLIC_E2E_REAL_AUTH=1`. У production-білдах виклик
// перетворюється на ранній `return false` (Metro інлайнить
// `process.env.EXPO_PUBLIC_*` на bundle-time). Встановлюємо ДО монтажу
// React-дерева, щоб `useUser` під `ApiClientProvider` ніколи не побачив
// живого `/api/v1/me` — інакше у тестах без бекенда `useUser` лагав би
// 30 секунд на network timeout перед редиректом на sign-in.
installE2EAuthMock();

/**
 * Inner shell — mounted below the providers so `useDeepLinks` runs
 * inside `<Stack>`'s navigation context. See `src/lib/useDeepLinks.ts`
 * for why the hook must not fire before Expo Router boots.
 */
function RootShell() {
  useDeepLinks();
  // Android hardware-back parity with the Capacitor shell
  // (`apps/mobile-shell/src/index.ts:435`): first tap at the root
  // surfaces a localised toast; the second tap inside
  // `BACK_TO_EXIT_WINDOW_MS` exits. No-op on iOS / web.
  useBackToExit();

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(auth)"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="settings"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="assistant"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="hub-chat"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="hub-search"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <SyncStatusOverlay />
    </View>
  );
}

function DynamicStatusBar() {
  const { colorScheme } = useColorScheme();
  // In dark mode the status bar content must be light (white text/icons),
  // in light mode it must be dark (dark text/icons).
  return <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />;
}

export default function RootLayout() {
  // We render `null` (keeping the native splash visible) until the
  // encryption bootstrap completes. This guarantees that no provider
  // below — `QueryProvider`, `CloudSyncProvider`, module stores —
  // touches MMKV before `_setMMKVInstance()` has swapped in the
  // encrypted handle.
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    // Sentry init only — it never touches MMKV. PostHog is delayed
    // until `bootstrapEncryptedStorage` resolves below (see the next
    // effect) so `loadOrCreateAnonId` reads / writes its persisted
    // `distinct_id` through the encrypted MMKV instance rather than
    // the legacy plaintext one. Initialising PostHog here would race
    // the encryption swap — and because `initPostHog()` is idempotent
    // (first call wins), the first write would land on plaintext and
    // subsequent calls become no-ops.
    initObservability();
  }, []);

  useEffect(() => {
    let cancelled = false;
    bootstrapEncryptedStorage()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "fallback") {
          // Keep the app usable but flag the failure so we notice in
          // Sentry. The plaintext instance is already active, so
          // storage helpers still work.
          captureError(result.error, {
            scope: "storage-encryption-bootstrap",
            reason: result.reason,
          });
        }
        // Bring up PostHog only after MMKV has settled on its final
        // (encrypted) instance — `initPostHog` reads / writes a
        // persisted `distinct_id` through the same store, so racing
        // it with the bootstrap would land the id on the plaintext
        // legacy instance and effectively reset attribution on every
        // cold start.
        void initPostHog();
      })
      .catch((error) => {
        // Should never happen — `bootstrapEncryptedStorage` returns a
        // fallback result instead of throwing — but we belt-and-brace
        // it so a regression here can never wedge the splash screen.
        if (!cancelled) {
          captureError(error, { scope: "storage-encryption-bootstrap" });
        }
      })
      .finally(() => {
        if (cancelled) return;
        setStorageReady(true);
        SplashScreen.hideAsync().catch(() => {
          /* race with auto-hide — non-fatal */
        });
        // SQLite-backed kv_store warm-cache bootstrap (PR #065).
        // Fire-and-forget — failures leave `kvStoreBoot.loaded = false`
        // and `mobileKVStore` falls back to MMKV. Must run after
        // encrypted storage bootstrap so the MMKV→kv_store one-time
        // migration reads from the encrypted instance.
        void bootstrapMobileKvStore({
          onError: (stage, err) => {
            captureError(err, {
              scope: "kv-store-bootstrap",
              stage,
            });
          },
        });
        // Sync v2 writer-runtime boot. Fire-and-forget — the
        // singleton internally `.catch`-es boot failures and routes
        // them through `captureException`, so a missing SQLite
        // handle (e.g. simulator without the native module) cannot
        // break the React tree. Mirrors `apps/web/src/main.tsx`
        // where `bootSyncEngineWriter` runs after storage migrations.
        // See `apps/mobile/src/core/syncEngine/singleton.ts`.
        void bootSyncEngineWriter({ captureException: captureError });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    // The boundary sits *inside* `GestureHandlerRootView` so the
    // gesture-handler root is always mounted (a throw inside the
    // providers below must not detach RNGH from the native side —
    // otherwise the fallback's own `<Button>` press wouldn't work).
    // Every other provider is below the boundary so a render-time
    // throw in `QueryProvider`'s persister rehydration, the
    // `ApiClientProvider`, or one of the side-effect bridges
    // (`IdentityBridge`, `PushRegistrar`, …) is caught and routed
    // through `captureError` instead of bubbling to Expo Router's
    // red-box / a native crash.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootErrorBoundary>
          <QueryProvider>
            <ApiClientProvider client={apiClient}>
              <IdentityBridge />
              <ToastProvider>
                <ColorSchemeBridge />
                <DynamicStatusBar />
                <RootShell />
                <ToastContainer />
                <PushRegistrar />
                <AnalyticsIdentityBridge />
              </ToastProvider>
            </ApiClientProvider>
          </QueryProvider>
        </RootErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Expo Router segment-level error boundary.
 *
 * Expo Router uses the named `ErrorBoundary` export from a layout
 * file (`docs.expo.dev/router/error-handling/`) to render a fallback
 * when *route children* throw during render. This is a different
 * surface from the in-tree class boundary above:
 *
 * - The class boundary in `RootLayout` catches throws from the
 *   providers (`QueryProvider`, `ApiClientProvider`, etc).
 * - This named export catches throws from the screens declared inside
 *   `<Stack>` (`(tabs)`, `(auth)`, `settings`, `assistant`, …).
 *
 * Together they form a defence-in-depth pair so no render-time error
 * inside the mobile tree reaches Expo Router's default red-box.
 *
 * The actual fallback markup lives in `SegmentErrorBoundary` so it can
 * be unit-tested without dragging the entire mobile provider stack
 * into Jest.
 */
export const ErrorBoundary = SegmentErrorBoundary;
