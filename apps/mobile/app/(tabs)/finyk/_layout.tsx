/**
 * Finyk tab — nested Stack layout.
 *
 * The Finyk tab hosts five screens (Overview / Transactions / Budgets /
 * Analytics / Assets) as a native Stack, wrapped in a module-level
 * `ModuleErrorBoundary` so a crash inside any Finyk screen shows a
 * contained fallback + retry without taking down the rest of the hub.
 *
 * `headerShown: false` on the Overview (`index`) screen keeps the module
 * entrypoint visually clean (the tab bar already labels the module);
 * the four drill-downs get a native large-title header so a user always
 * has a native back-gesture back to Overview.
 *
 * Route map:
 *   /finyk              → index.tsx           (Overview)
 *   /finyk/transactions → transactions.tsx    (Transactions)
 *   /finyk/budgets      → budgets.tsx         (Budgets)
 *   /finyk/analytics    → analytics.tsx       (Analytics)
 *   /finyk/assets       → assets.tsx          (Assets)
 */
import { Stack, useRouter } from "expo-router";

import ModuleErrorBoundary from "@/core/ModuleErrorBoundary";
import { colors } from "@/theme";

export default function FinykStackLayout() {
  const router = useRouter();

  return (
    <ModuleErrorBoundary
      moduleName="Фінік"
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
        <Stack.Screen name="transactions" options={{ title: "Операції" }} />
        <Stack.Screen name="budgets" options={{ title: "Планування" }} />
        <Stack.Screen name="analytics" options={{ title: "Аналітика" }} />
        <Stack.Screen name="assets" options={{ title: "Активи" }} />
        <Stack.Screen name="tx/[id]" options={{ title: "Транзакція" }} />
      </Stack>
    </ModuleErrorBoundary>
  );
}
