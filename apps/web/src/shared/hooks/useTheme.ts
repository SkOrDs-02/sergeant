/**
 * useTheme — uniform 4-mode theme controller.
 *
 * State machine: `light` | `dark` | `system` | `hc`.
 *
 * Class-on-html contract (single source of truth for the theme.css vars):
 *   - `light`  → `<html>` має жодного theme-класу (`dark` off, `hc` off).
 *   - `dark`   → `<html class="dark">`.
 *   - `system` → клас `dark` слідує за `matchMedia('(prefers-color-scheme: dark)')`.
 *   - `hc`     → `<html class="hc [dark]">`. HC залишається light/dark
 *                відповідно до системної переваги, але семантичні токени
 *                переключаються на AAA-leaning набір через `html.hc { ... }`.
 *
 * Persistence: вибір зберігається в `hub_theme_v2` (рядок). Зміни в
 * іншій вкладці прилітають через `webKVStore.onChange` (DOM `storage`-
 * event), і UI оновлюється реактивно. Якщо запис відсутній — робиться
 * однократна best-effort міграція з legacy ключів (`hub_dark_mode_v1`,
 * `hub_dark_mode_schedule_v1`).
 *
 * Не змішуй з `useDarkMode` — `useTheme` володіє класами на `<html>`.
 * Mount `useTheme` (або `<ThemeSwitcher />`) лише один раз у точці входу
 * (наразі: `core/App.tsx`), щоб не було двох write-conflict-ів.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  safeReadStringLS,
  safeWriteLS,
  webKVStore,
} from "@shared/lib/storage/storage";

export type ThemeChoice = "light" | "dark" | "system" | "hc";

const STORAGE_KEY = "hub_theme_v2";
const LEGACY_DARK_KEY = "hub_dark_mode_v1";
const LEGACY_SCHEDULE_KEY = "hub_dark_mode_schedule_v1";

const VALID_CHOICES: readonly ThemeChoice[] = [
  "light",
  "dark",
  "system",
  "hc",
] as const;

function isThemeChoice(value: unknown): value is ThemeChoice {
  return (
    typeof value === "string" &&
    (VALID_CHOICES as readonly string[]).includes(value)
  );
}

function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function migrateLegacyChoice(): ThemeChoice | null {
  // Legacy schedule "system" → `system` mode wins over the boolean.
  const schedule = safeReadStringLS(LEGACY_SCHEDULE_KEY);
  if (schedule && schedule.includes('"mode":"system"')) return "system";
  // Older string-encoded boolean ("0"/"1" or "true"/"false").
  const dark = safeReadStringLS(LEGACY_DARK_KEY);
  if (dark === "1" || dark === "true") return "dark";
  if (dark === "0" || dark === "false") return "light";
  return null;
}

function readInitialChoice(): ThemeChoice {
  const raw = safeReadStringLS(STORAGE_KEY);
  if (isThemeChoice(raw)) return raw;
  const legacy = migrateLegacyChoice();
  return legacy ?? "system";
}

function writeChoice(choice: ThemeChoice): void {
  // `safeWriteLS` для рядка обходить JSON.stringify і пише raw value
  // (див. storage.ts) — крос-табний `storage` event у такому ж форматі.
  safeWriteLS(STORAGE_KEY, choice);
}

interface ResolvedTheme {
  /** Whether the dark class is active on `<html>`. */
  isDark: boolean;
  /** Whether the high-contrast class is active on `<html>`. */
  isHighContrast: boolean;
}

function resolveTheme(
  choice: ThemeChoice,
  systemPrefersDark: boolean,
): ResolvedTheme {
  // HC follows the system color-scheme so AAA-leaning users on a dark
  // OS get HC-dark and vice versa. The hc class is additive — it does
  // NOT replace `dark`, only layers AAA-leaning token overrides on top.
  if (choice === "hc") {
    return { isDark: systemPrefersDark, isHighContrast: true };
  }
  if (choice === "system") {
    return { isDark: systemPrefersDark, isHighContrast: false };
  }
  return { isDark: choice === "dark", isHighContrast: false };
}

function applyResolvedTheme({ isDark, isHighContrast }: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.classList.toggle("hc", isHighContrast);
}

export interface UseThemeReturn {
  /** User-facing choice persisted in localStorage. */
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
  /** Whether the `dark` class is currently active on `<html>`. */
  isDark: boolean;
  /** Whether the `hc` class is currently active on `<html>`. */
  isHighContrast: boolean;
  /** Live value of `prefers-color-scheme: dark`. */
  systemPrefersDark: boolean;
}

/**
 * Theming hook for light/dark/system + high-contrast modes.
 *
 * Owns the `dark` and `hc` classes on `<html>`. Subscribes to the system
 * color-scheme media query (for `system` and `hc`) and to cross-tab
 * storage events so the UI stays in sync when the choice changes in
 * another tab.
 */
export function useTheme(): UseThemeReturn {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    const initial = readInitialChoice();
    // Apply synchronously so the first paint already matches the persisted
    // choice (avoids a flash of light theme when reload-ing into dark).
    applyResolvedTheme(resolveTheme(initial, readSystemPrefersDark()));
    return initial;
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    readSystemPrefersDark,
  );

  // Keep an up-to-date snapshot for callbacks that mustn't re-create on
  // every render of `setChoice` (storage / mq listeners).
  const choiceRef = useRef(choice);
  choiceRef.current = choice;

  const resolved = useMemo(
    () => resolveTheme(choice, systemPrefersDark),
    [choice, systemPrefersDark],
  );

  // Reactively apply classes whenever the resolution changes.
  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  // System color-scheme: subscribe once. Used for `system` and `hc`
  // modes (HC follows OS-level light/dark preference).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    // `addEventListener` is Safari ≥ 14; on older browsers fall back to
    // the deprecated `addListener` so the hook still works headlessly.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Cross-tab sync: `webKVStore.onChange` rides on the DOM `storage` event
  // for the LS fallback and on `BroadcastChannel("kv-store")` for the
  // SQLite-warm-cache backend (`storage.ts`).
  useEffect(() => {
    const unsubscribe = webKVStore.onChange(STORAGE_KEY, (next) => {
      if (next === null) {
        // Storage cleared — fall back to the default.
        if (choiceRef.current !== "system") setChoiceState("system");
        return;
      }
      if (isThemeChoice(next) && next !== choiceRef.current) {
        setChoiceState(next);
      }
    });
    return unsubscribe;
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    writeChoice(next);
  }, []);

  return {
    choice,
    setChoice,
    isDark: resolved.isDark,
    isHighContrast: resolved.isHighContrast,
    systemPrefersDark,
  };
}

/**
 * Static label for a theme choice (Ukrainian, UI-facing).
 *
 * Co-located with the hook so `ThemeSwitcher` and the DesignShowcase
 * preview render identical labels without re-importing the strings
 * from `messages` (theming is core-design chrome, not feature copy).
 */
export const THEME_CHOICE_LABELS: Record<ThemeChoice, string> = {
  light: "Світла",
  dark: "Темна",
  system: "Системна",
  hc: "Висока контрастність",
};

/**
 * Short label variant for compact UI (e.g. tooltip).
 */
export const THEME_CHOICE_SHORT_LABELS: Record<ThemeChoice, string> = {
  light: "Світла",
  dark: "Темна",
  system: "Як у системі",
  hc: "Контраст",
};

export const THEME_CHOICE_ICONS: Record<
  ThemeChoice,
  "sun" | "moon" | "monitor" | "contrast"
> = {
  light: "sun",
  dark: "moon",
  system: "monitor",
  hc: "contrast",
};

export const THEME_CHOICES: readonly ThemeChoice[] = VALID_CHOICES;
