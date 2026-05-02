/**
 * Nutrition tab — nested Stack layout.
 * `index` — `NutritionApp`; `scan` — штрихкоди; `pantry` — комора;
 * `saved-recipes` — збережені рецепти; `recipe/[id]` — картка; `recipe/form` — створення/редагування.
 */
import { Stack, useRouter } from "expo-router";

import ModuleErrorBoundary from "@/core/ModuleErrorBoundary";
import { colors } from "@/theme";

export default function NutritionStackLayout() {
  const router = useRouter();
  return (
    <ModuleErrorBoundary
      moduleName="Харчування"
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
        <Stack.Screen name="scan" options={{ title: "Сканер" }} />
        <Stack.Screen
          name="pantry"
          options={{ title: "Комора", headerShown: false }}
        />
        <Stack.Screen
          name="saved-recipes"
          options={{ title: "Рецепти", headerShown: false }}
        />
        <Stack.Screen
          name="recipe/form"
          options={{ title: "Рецепт", headerShown: false }}
        />
        <Stack.Screen
          name="recipe/[id]"
          options={{ title: "Рецепт", headerShown: false }}
        />
      </Stack>
    </ModuleErrorBoundary>
  );
}
