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
import { SyncStatusOverlay } from "@/core/SyncStatusOverlay";
import { ColorSchemeBridge } from "@/core/theme/ColorSchemeBridge";
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
import { bootstrapEncryptedStorage } from "@/lib/storageEncryption";
import { useDeepLinks } from "@/lib/useDeepLinks";
import { QueryProvider } from "@/providers/QueryProvider";
import { CloudSyncProvider } from "@/sync";
import { ToastContainer, ToastProvider } from "@/components/ui/Toast";

// Hold the native splash screen up until storage encryption bootstrap
// finishes. Without this gate the React tree mounts against the
// plaintext MMKV instance for a few frames and CloudSync / module
// stores would race the swap. We `.catch` any rejection because the
// API is stable enough that an exception here is itself a bug.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* already prevented or platform doesn't support it — non-fatal */
});

/**
 * Inner shell — mounted below the providers so `useDeepLinks` runs
 * inside `<Stack>`'s navigation context. See `src/lib/useDeepLinks.ts`
 * for why the hook must not fire before Expo Router boots.
 */
function RootShell() {
  useDeepLinks();

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
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!storageReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <ApiClientProvider client={apiClient}>
            <CloudSyncProvider>
              <ToastProvider>
                <ColorSchemeBridge />
                <DynamicStatusBar />
                <RootShell />
                <ToastContainer />
                <PushRegistrar />
              </ToastProvider>
            </CloudSyncProvider>
          </ApiClientProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
