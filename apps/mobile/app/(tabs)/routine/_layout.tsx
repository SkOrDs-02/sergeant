/**
 * Routine tab — nested Stack layout.
 *
 * Tabs previously rendered `RoutineApp` directly from a flat
 * `routine.tsx`. Moving to a folder lets deep links like
 * `sergeant://routine/habit/{id}` push a dedicated stack screen on
 * top of the routine hub without losing the bottom tab bar. See
 * `docs/mobile/overview.md` (Deep links) and
 * `docs/mobile/react-native-migration.md` § 6.3.
 */
import { Stack, useRouter } from "expo-router";

import ModuleErrorBoundary from "@/core/ModuleErrorBoundary";
import { colors } from "@/theme";

export default function RoutineStackLayout() {
  const router = useRouter();
  return (
    <ModuleErrorBoundary
      moduleName="Рутина"
      onBackToHub={() => {
        router.replace("/");
      }}
    >
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.accent,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
          animationDuration: 250,
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false, animation: "fade" }}
        />
        <Stack.Screen name="habit/[id]" options={{ title: "Звичка" }} />
      </Stack>
    </ModuleErrorBoundary>
  );
}
