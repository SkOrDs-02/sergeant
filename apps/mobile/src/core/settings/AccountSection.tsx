/**
 * Sergeant Hub-core — AccountSection (React Native)
 *
 * Houses the account-level actions that used to live on the welcome
 * scaffold in `(tabs)/index.tsx` before the dashboard port:
 *
 *  - Sign-out (clears Better Auth session + react-query cache).
 *  - DEV-only "send test push" button — guarded by `__DEV__` so it
 *    is dead-code-eliminated from production bundles.
 *
 * The web counterpart exposes these via the app shell (sign-out is
 * on the header menu; dev-only push test does not exist on web).
 * Moving them here keeps the dashboard focused on module status and
 * mirrors iOS / Android system-settings conventions.
 */

import { Alert, Pressable, Text, View } from "react-native";

import { usePushTest } from "@sergeant/api-client/react";
import { useQueryClient } from "@tanstack/react-query";

import { signOut } from "@/auth/authClient";

import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

function DevPushTestButton() {
  const pushTest = usePushTest({
    onError: (err) => {
      Alert.alert("Push test failed", err.message);
    },
    onSuccess: (summary) => {
      Alert.alert(
        "Push test sent",
        `ios=${summary.delivered.ios} android=${summary.delivered.android} web=${summary.delivered.web}` +
          (summary.errors.length ? `\nerrors: ${summary.errors.length}` : ""),
      );
    },
  });

  return (
    <SettingsSubGroup title="DEV">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Надіслати тестовий push"
        onPress={() => pushTest.mutate({ title: "Sergeant", body: "It works" })}
        disabled={pushTest.isPending}
        className="items-center rounded-xl border border-cream-300 bg-cream-50 px-4 py-3 active:opacity-80"
        testID="account-dev-push-test"
      >
        <Text className="text-sm font-semibold text-fg">
          {pushTest.isPending ? "Надсилаю…" : "DEV: надіслати тестовий пуш"}
        </Text>
      </Pressable>
      <View>
        <Text className="text-[11px] leading-snug text-fg-subtle">
          Видно лише у dev-збірках. Швидко перевірити, чи приходять сповіщення —
          не виходячи з головної.
        </Text>
      </View>
    </SettingsSubGroup>
  );
}

export function AccountSection() {
  const queryClient = useQueryClient();

  // `useUser()` is react-query-backed and does not re-render in
  // response to Better Auth SecureStore mutations. Clearing the full
  // cache on sign-out forces the `(tabs)/_layout.tsx` guard to see
  // `data.user === null` and redirect into `(auth)/sign-in`.
  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      queryClient.clear();
    }
  };

  return (
    <SettingsGroup title="Акаунт" emoji="👤">
      <SettingsSubGroup title="Сесія">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Вийти з акаунта"
          onPress={handleSignOut}
          className="items-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 active:opacity-80"
          testID="account-sign-out"
        >
          <Text className="text-sm font-semibold text-rose-600">Вийти</Text>
        </Pressable>
      </SettingsSubGroup>

      {__DEV__ ? <DevPushTestButton /> : null}
    </SettingsGroup>
  );
}
