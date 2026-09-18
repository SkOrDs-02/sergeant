import { StyleSheet, Text, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { colors, radius, spacing } from "@/theme";

type Props = {
  title: string;
  /** Optional trailing detail (e.g. "ID: 123") printed under the title. */
  detail?: string;
  /**
   * Short human-readable description of which later phase of the RN
   * migration will replace this stub with a real screen. Rendered
   * verbatim inside the info card.
   */
  followUp: string;
  /**
   * When set, renders a primary CTA that navigates to this destination
   * instead of only the "назад на хаб" fallback. Useful for food-* /
   * workout-* stubs whose module root already exists.
   */
  primaryAction?: {
    label: string;
    href: Href;
  };
};

/**
 * Shared placeholder for deep-link targets that do not yet have a real
 * screen in the mobile app (e.g. `sergeant://food/recipe/{id}`).
 *
 * Lives outside `ModuleStub` because deep-link stubs:
 *  - render a module-agnostic `Stack.Screen` title (they are nested
 *    under whatever folder the route sits in);
 *  - always offer a one-tap "назад на хаб" fallback so a user who
 *    landed here from an Android shortcut / push-notification deep
 *    link is never dead-ended;
 *  - optionally expose a primary CTA back to the module root (the
 *    recipe stub → `/nutrition`, the transaction stub → `/finyk`).
 *
 * Replaced screen-by-screen as the corresponding phase of
 * `docs/engineering/mobile/react-native-migration.md` lands real UI.
 */
export function DeepLinkPlaceholder({
  title,
  detail,
  followUp,
  primaryAction,
}: Props) {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title, headerShown: true }} />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Скоро</Text>
          <Text style={styles.cardBody}>{followUp}</Text>
        </View>
        <View style={styles.actions}>
          {primaryAction ? (
            <Button
              onPress={() => router.replace(primaryAction.href)}
              variant="primary"
            >
              {primaryAction.label}
            </Button>
          ) : null}
          <Button onPress={() => router.replace("/(tabs)")} variant="ghost">
            На хаб
          </Button>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  detail: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.md,
  },
});
