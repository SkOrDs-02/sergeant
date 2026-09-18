/**
 * ColorSchemeBridge — keeps NativeWind's runtime `colorScheme` in sync
 * with the user's "Темна тема" preference (persisted in MMKV under the
 * shared `STORAGE_KEYS.HUB_PREFS` slice).
 *
 * Mounted once near the root of the app (see `apps/mobile/app/_layout.tsx`).
 * Subscribes to MMKV writes through `useLocalStorage`, so a toggle from
 * `GeneralSection` (or a future cloud-sync pull) re-tints semantic-token
 * surfaces without remounting the tree.
 *
 * Tri-state mapping mirrors the web `useHubPref("dark")` semantics:
 *
 *   prefs.darkMode === true   → "dark"
 *   prefs.darkMode === false  → "light"
 *   prefs.darkMode missing    → "system" (follow OS scheme)
 *
 * Required Tailwind config: `darkMode: "class"` in
 * `apps/mobile/tailwind.config.js` so NativeWind honours imperative
 * `colorScheme.set()` calls instead of locking on `Appearance` alone.
 */
import { useEffect, useMemo } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme } from "nativewind";
import { STORAGE_KEYS } from "@sergeant/shared";

import { useLocalStorage } from "@/lib/storage";

interface HubPrefs {
  darkMode?: boolean;
}

export type ThemeMode = "light" | "dark" | "system";
type Scheme = "dark" | "light" | "system";

function resolveScheme(prefs: HubPrefs): Scheme {
  if (prefs.darkMode === true) return "dark";
  if (prefs.darkMode === false) return "light";
  return "system";
}

function prefsToMode(prefs: HubPrefs): ThemeMode {
  if (prefs.darkMode === true) return "dark";
  if (prefs.darkMode === false) return "light";
  return "system";
}

/**
 * Hook to manage theme mode with full control.
 * Returns current mode, resolved scheme, and setter function.
 */
export function useThemeMode() {
  const systemScheme = useSystemColorScheme();
  const [prefs, setPrefs] = useLocalStorage<HubPrefs>(
    STORAGE_KEYS.HUB_PREFS,
    {},
  );

  const mode = prefsToMode(prefs);
  const resolvedScheme = mode === "system" ? (systemScheme ?? "light") : mode;
  const isDark = resolvedScheme === "dark";

  const setTheme = useMemo(
    () => (newMode: ThemeMode) => {
      setPrefs((prev) => ({
        ...prev,
        darkMode:
          newMode === "dark" ? true : newMode === "light" ? false : undefined,
      }));
    },
    [setPrefs],
  );

  return {
    /** Current user preference: "light" | "dark" | "system" */
    mode,
    /** Resolved scheme after applying system preference: "light" | "dark" */
    resolvedScheme,
    /** Update theme preference */
    setTheme,
    /** Convenience boolean for dark mode checks */
    isDark,
  };
}

export function ColorSchemeBridge(): null {
  const [prefs] = useLocalStorage<HubPrefs>(STORAGE_KEYS.HUB_PREFS, {});

  useEffect(() => {
    colorScheme.set(resolveScheme(prefs));
    // Only the tri-state pref drives the colour scheme — other HubPrefs
    // fields (`showCoach`, `showHints`, …) must not retrigger a setter
    // that NativeWind treats as a fresh `colorScheme.set` event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.darkMode]);

  return null;
}
