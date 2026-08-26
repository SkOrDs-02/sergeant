/**
 * Fallback Expo Router screen for `sergeant://auth/callback?token=…`.
 *
 * Better Auth's `expoClient` plugin already owns the primary callback
 * flow: it opens the auth URL in a browser tab (WebBrowser.openAuthSessionAsync)
 * and consumes the redirected `sergeant://auth/callback?token=…` URL
 * inside its own `Linking` handler, writing the session token into
 * `expo-secure-store`. See `src/auth/authClient.ts` and `docs/mobile/overview.md`.
 *
 * However, if the OS ever cold-launches the app directly into this
 * route (for example: user taps a reset-password email link after
 * force-quitting the app), Expo Router must have a screen to render.
 * Otherwise `_layout.tsx` would log a "No screen matches" warning and
 * Expo Router would fall through to `+not-found`.
 *
 * This component therefore:
 *   1. Reads the `token` query param just for debug visibility.
 *   2. Redirects the user to the hub after a tick — by the time the
 *      hub mounts, `expoClient` has already consumed the token and
 *      `useUser()` will reflect the freshly-authenticated session.
 *
 * The deep-link hook in `useDeepLinks.ts` intentionally does NOT push
 * this route; it passes the auth-callback through untouched so Better
 * Auth's internal listener is the one that reacts. This screen is the
 * cold-start safety net.
 */
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { colors, spacing } from "@/theme";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/");
    }, 250);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ title: "Авторизація", headerShown: false }} />
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.title}>Завершую вхід…</Text>
        {token ? (
          <Text
            style={styles.hint}
            accessibilityLabel="auth-callback-token-present"
          >
            Сесія відновлюється
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
