/**
 * useTheme — uniform 3-mode theme controller.
 *
 * State machine: `light` | `dark` | `hc`.
 *
 * Class-on-html contract (single source of truth for the theme.css vars):
 *   - `light`  → `<html>` має жодного theme-класу (`dark` off, `hc` off).
 *   - `dark`   → `<html class="dark">`.
 *   - `hc`     → `<html class="hc [dark]">`. HC залишається light/dark
 *                відповідно до системної переваги, але семантичні токени
 *                переключаються на AAA-leaning набір через `html.hc { ... }`.
 *
 * Авто-режим (`system`), що live-слідував за `prefers-color-scheme`, прибрано
 * на прохання власника (2026-08-18): три явні теми замість чотирьох. Системні
 * переваги тепер читаються РІВНО ОДИН РАЗ — на першому завантаженні, коли
 * вибору ще нема (`readInitialChoice`): OS з high-contrast дає `hc`, темна OS
 * дає `dark`. Так слабкозорий користувач і далі приходить у AAA-набір, не
 * шукаючи перемикач, але після першого ж явного вибору система вже нічого не
 * перевизначає. Збережений legacy-`system` мігрується тим самим правилом.
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
  safeReadStringLSDurable,
  safeWriteStringLSDurable,
  webKVStore,
} from "@shared/lib/storage/storage";

export type ThemeChoice = "light" | "dark" | "hc";

const STORAGE_KEY = "hub_theme_v2";
const LEGACY_DARK_KEY = "hub_dark_mode_v1";
const LEGACY_SCHEDULE_KEY = "hub_dark_mode_schedule_v1";
/** Retired 4th mode — kept only to migrate an already-persisted value. */
const RETIRED_SYSTEM_CHOICE = "system";

const VALID_CHOICES: readonly ThemeChoice[] = ["light", "dark", "hc"] as const;

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

const CONTRAST_QUERY = "(prefers-contrast: more), (forced-colors: active)";

function readSystemPrefersContrast(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(CONTRAST_QUERY).matches;
}

/**
 * Первинний вибір із системних переваг — єдине місце, де OS диктує тему.
 * Викликається лише коли в сховищі нема валідного вибору (або лежить
 * legacy-`system`).
 */
function choiceFromSystem(): ThemeChoice {
  if (readSystemPrefersContrast()) return "hc";
  return readSystemPrefersDark() ? "dark" : "light";
}

function migrateLegacyChoice(): ThemeChoice | null {
  // Legacy schedule "system" → тепер це разовий знімок OS, а не режим.
  const schedule = safeReadStringLS(LEGACY_SCHEDULE_KEY);
  if (schedule && schedule.includes(`"mode":"${RETIRED_SYSTEM_CHOICE}"`)) {
    return choiceFromSystem();
  }
  // Older string-encoded boolean ("0"/"1" or "true"/"false").
  const dark = safeReadStringLS(LEGACY_DARK_KEY);
  if (dark === "1" || dark === "true") return "dark";
  if (dark === "0" || dark === "false") return "light";
  return null;
}

function readInitialChoice(): ThemeChoice {
  // `…Durable` prefers the synchronous localStorage mirror so a choice whose
  // fire-and-forget SQLite write-back was lost to a reload race is still
  // recovered — without it, the lost write silently degraded to the OS
  // fallback below, flipping `<html>` to `.dark` on a dark-OS device and
  // turning the chosen light/HC theme invisible (text-text → near-white over
  // light surfaces). See storage.ts § Boot-critical durable helpers.
  const raw = safeReadStringLSDurable(STORAGE_KEY);
  if (isThemeChoice(raw)) return raw;
  if (raw === RETIRED_SYSTEM_CHOICE) return choiceFromSystem();
  const legacy = migrateLegacyChoice();
  return legacy ?? choiceFromSystem();
}

function writeChoice(choice: ThemeChoice): void {
  // Durable write: active store (SQLite warm-cache) + synchronous localStorage
  // mirror. The mirror is what the next boot's warm-cache seed re-reads if the
  // async SQLite upsert hasn't flushed yet. Raw string value (no JSON.stringify)
  // keeps the cross-tab `storage` event payload in the same format.
  safeWriteStringLSDurable(STORAGE_KEY, choice);
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
  return { isDark: choice === "dark", isHighContrast: false };
}

/**
 * Browser-chrome `theme-color` for each resolved theme. Must track the
 * `--c-bg` values in `src/styles/theme.css` (`:root` #ecebe7 / `.dark`
 * #14100e). `html.hc` / `html.hc.dark` layer AAA-leaning text/border
 * tokens on top but do not override `--c-bg`, so HC uses the same bg as
 * its underlying light/dark tier — no separate HC entry needed here.
 */
const THEME_COLOR_BY_MODE = {
  light: "#ecebe7",
  dark: "#14100e",
} as const;

function applyResolvedTheme({ isDark, isHighContrast }: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.classList.toggle("hc", isHighContrast);

  // Keep the OS status-bar / title-bar in sync with the *resolved* theme.
  // The static `<meta name="theme-color" media="...">` pair in index.html
  // only covers the pre-JS default (before this hook mounts) and tracks
  // `prefers-color-scheme` — it never learns about an explicit in-app
  // light/dark/hc pick that diverges from the OS setting. Overwrite every
  // matching meta once resolved so both the light- and dark-media
  // variants agree, regardless of which one the browser would otherwise
  // pick.
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (metas.length === 0) return;
  const color = isDark ? THEME_COLOR_BY_MODE.dark : THEME_COLOR_BY_MODE.light;
  metas.forEach((meta) => meta.setAttribute("content", color));
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
 * Theming hook for light/dark + high-contrast modes.
 *
 * Owns the `dark` and `hc` classes on `<html>`. Subscribes to the system
 * color-scheme media query (HC picks its light/dark base from it) and to
 * cross-tab storage events so the UI stays in sync when the choice changes
 * in another tab.
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

  useEffect(() => {
    choiceRef.current = choice;
  }, [choice]);

  const resolved = useMemo(
    () => resolveTheme(choice, systemPrefersDark),
    [choice, systemPrefersDark],
  );

  // Reactively apply classes whenever the resolution changes.
  useEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  // iOS can restore an installed PWA from the back-forward cache without
  // remounting React. Re-assert the persisted choice on `pageshow` (and when
  // the tab becomes visible) so the UI radio state cannot say "dark" while
  // `<html>` has silently lost its `.dark` class during suspension.
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const restore = () => {
      const persisted = readInitialChoice();
      const prefersDark = readSystemPrefersDark();
      choiceRef.current = persisted;
      setChoiceState(persisted);
      setSystemPrefersDark(prefersDark);
      applyResolvedTheme(resolveTheme(persisted, prefersDark));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") restore();
    };
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // System color-scheme: subscribe once. Consumed only by the `hc` choice,
  // which layers AAA tokens over the OS-level light/dark preference.
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
        // Storage cleared — fall back to the system-derived default.
        const fallback = choiceFromSystem();
        if (choiceRef.current !== fallback) setChoiceState(fallback);
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
  hc: "Висока контрастність",
};

/**
 * Short label variant for compact UI (e.g. tooltip).
 */
export const THEME_CHOICE_SHORT_LABELS: Record<ThemeChoice, string> = {
  light: "Світла",
  dark: "Темна",
  hc: "Контраст",
};

export const THEME_CHOICE_ICONS: Record<
  ThemeChoice,
  "sun" | "moon" | "contrast"
> = {
  light: "sun",
  dark: "moon",
  hc: "contrast",
};

export const THEME_CHOICES: readonly ThemeChoice[] = VALID_CHOICES;
