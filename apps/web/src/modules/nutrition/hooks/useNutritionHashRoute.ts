import { useEffect, useState } from "react";
import {
  parseNutritionHash,
  setNutritionHash,
  type NutritionPage,
  type PantrySubTab,
  type MenuSubTab,
} from "../lib/nutritionRouter";

export interface UseNutritionHashRouteResult {
  activePage: NutritionPage;
  setActivePage: (page: NutritionPage) => void;
  setActivePageAndHash: (page: NutritionPage, subTab?: string) => void;
  /** Current sub-tab parsed from hash (e.g. `#pantry/shopping`). */
  pantrySubTab: PantrySubTab;
  menuSubTab: MenuSubTab;
  setPantrySubTab: (sub: PantrySubTab) => void;
  setMenuSubTab: (sub: MenuSubTab) => void;
}

export function useNutritionHashRoute(): UseNutritionHashRouteResult {
  const initial = parseNutritionHash();
  const [activePage, setActivePage] = useState<NutritionPage>(
    () => initial.page,
  );
  const [pantrySubTab, setPantrySubTabState] = useState<PantrySubTab>(() =>
    initial.page === "pantry" && initial.subTab
      ? (initial.subTab as PantrySubTab)
      : "items",
  );
  const [menuSubTab, setMenuSubTabState] = useState<MenuSubTab>(() =>
    initial.page === "menu" && initial.subTab
      ? (initial.subTab as MenuSubTab)
      : "plan",
  );

  useEffect(() => {
    // One-time normalization on mount: handle legacy routes
    // (`#products`, `#plan`, `#recipes`, `#shop`) by rewriting the URL in
    // place. The state already holds the correct page because
    // parseNutritionHash resolves the redirect.
    const init = parseNutritionHash();
    if (init.redirectFrom) setNutritionHash(init.page, init.subTab);

    const onHash = () => {
      const p = parseNutritionHash();
      setActivePage(p.page);
      if (p.page === "pantry" && p.subTab) {
        setPantrySubTabState(p.subTab as PantrySubTab);
      }
      if (p.page === "menu" && p.subTab) {
        setMenuSubTabState(p.subTab as MenuSubTab);
      }
      if (p.redirectFrom) setNutritionHash(p.page, p.subTab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setActivePageAndHash = (page: NutritionPage, subTab?: string) => {
    setActivePage(page);
    setNutritionHash(page, subTab);
  };

  const setPantrySubTab = (sub: PantrySubTab) => {
    setPantrySubTabState(sub);
    setNutritionHash("pantry", sub === "items" ? undefined : sub);
  };

  const setMenuSubTab = (sub: MenuSubTab) => {
    setMenuSubTabState(sub);
    setNutritionHash("menu", sub === "plan" ? undefined : sub);
  };

  return {
    activePage,
    setActivePage,
    setActivePageAndHash,
    pantrySubTab,
    menuSubTab,
    setPantrySubTab,
    setMenuSubTab,
  };
}
