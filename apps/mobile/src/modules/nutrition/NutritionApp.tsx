/**
 * Sergeant Nutrition — NutritionApp shell (React Native)
 *
 * Mobile port of `apps/web/src/modules/nutrition/NutritionApp.tsx`.
 *
 * Зараз:
 *  - bottom-nav: `dashboard` / `log` / `water` / `shopping`.
 *  - `Dashboard` / `Log` / `Water` / `Shopping` — див. `pages/`.
 *  - `AddMealSheet` + `nutrition/scan` (штрихкод), pantry, збережені рецепти, `recipe/[id]`, `recipe/form`.
 * Далі: photo-AI, паритет AI-рецептів з web.
 *
 * Persistence: активна вкладка — `STORAGE_KEYS.NUTRITION_MAIN_TAB` (MMKV).
 */
import { useCallback, useState } from "react";
import { View } from "react-native";

import { STORAGE_KEYS } from "@sergeant/shared";
import { router } from "expo-router";

import ModuleErrorBoundary from "@/core/ModuleErrorBoundary";
import { safeReadStringLS, safeWriteLS } from "@/lib/storage";

import {
  NutritionBottomNav,
  type NutritionMainTab,
} from "./components/NutritionBottomNav";
import { useNutritionDualWriteBoot } from "./hooks/useNutritionDualWriteBoot";
import { Dashboard } from "./pages/Dashboard";
import { Log } from "./pages/Log";
import { Shopping } from "./pages/Shopping";
import { Water } from "./pages/Water";

const TAB_PERSIST_KEY = STORAGE_KEYS.NUTRITION_MAIN_TAB;

function isNutritionMainTab(value: unknown): value is NutritionMainTab {
  return (
    value === "dashboard" ||
    value === "log" ||
    value === "water" ||
    value === "shopping"
  );
}

function readPersistedTab(): NutritionMainTab {
  const raw = safeReadStringLS(TAB_PERSIST_KEY);
  return isNutritionMainTab(raw) ? raw : "dashboard";
}

function NutritionShell() {
  const [mainTab, setMainTab] = useState<NutritionMainTab>(readPersistedTab);

  // Stage 4 PR #032: install the dual-write context once the user is
  // known and the flag is on. Without this the `triggerNutritionDualWrite`
  // calls from `nutritionStore.ts` and `recipeBookStore.ts` early-out at
  // the `isNutritionDualWriteRegistered()` gate, leaving SQLite empty.
  useNutritionDualWriteBoot();

  const handleSelectTab = useCallback((next: NutritionMainTab) => {
    setMainTab(next);
    safeWriteLS(TAB_PERSIST_KEY, next);
  }, []);

  return (
    <View className="flex-1 bg-cream-50" testID="nutrition-shell">
      <View className="flex-1">
        {mainTab === "dashboard" ? (
          <Dashboard testID="nutrition-dashboard" />
        ) : null}
        {mainTab === "log" ? <Log testID="nutrition-log" /> : null}
        {mainTab === "water" ? <Water testID="nutrition-water" /> : null}
        {mainTab === "shopping" ? (
          <Shopping testID="nutrition-shopping" />
        ) : null}
      </View>

      <NutritionBottomNav
        mainTab={mainTab}
        onSelectTab={handleSelectTab}
        testID="nutrition-bottom-nav"
      />
    </View>
  );
}

/**
 * NutritionApp — public entry для модуля Харчування (mobile).
 *
 * Wrap у `ModuleErrorBoundary` — якщо краш в будь-якій вкладці, він
 * ізольований у Nutrition-табі. `onBackToHub` веде на Hub-таб (`/`)
 * через `expo-router` — mirror web-поведінки.
 */
export function NutritionApp() {
  const handleBackToHub = useCallback(() => {
    try {
      router.replace("/");
    } catch {
      /* noop — best-effort navigation after module crash */
    }
  }, []);

  return (
    <ModuleErrorBoundary moduleName="Харчування" onBackToHub={handleBackToHub}>
      <NutritionShell />
    </ModuleErrorBoundary>
  );
}

export default NutritionApp;
