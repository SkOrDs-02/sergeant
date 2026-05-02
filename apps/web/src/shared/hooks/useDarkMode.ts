import { useCallback, useEffect, useState, useMemo } from "react";

const DARK_KEY = "hub_dark_mode_v1";
const SCHEDULE_KEY = "hub_dark_mode_schedule_v1";

export type DarkModeSchedule = "manual" | "system" | "sunset";

interface ScheduleConfig {
  mode: DarkModeSchedule;
  sunsetOffset?: number; // minutes before/after sunset to switch
  sunriseOffset?: number; // minutes before/after sunrise to switch
}

function applyTheme(dark: boolean): void {
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function readScheduleConfig(): ScheduleConfig {
  try {
    const stored = localStorage.getItem(SCHEDULE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return { mode: "manual" };
}

function saveScheduleConfig(config: ScheduleConfig): void {
  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

function readManualDark(): boolean | null {
  try {
    const stored = localStorage.getItem(DARK_KEY);
    if (stored !== null) return stored === "1";
  } catch {
    /* ignore */
  }
  return null;
}

function saveManualDark(dark: boolean): void {
  try {
    localStorage.setItem(DARK_KEY, dark ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Approximate sunset/sunrise based on time of year (Northern Hemisphere, ~50N latitude).
 * Returns hours in 24h format.
 */
function getApproxSunTimes(): { sunrise: number; sunset: number } {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );

  // Simplified calculation for Ukraine (~50N)
  // Summer solstice (day ~172): sunrise ~4:30, sunset ~21:00
  // Winter solstice (day ~355): sunrise ~8:00, sunset ~16:00
  const amplitude = 1.75; // hours variation from equinox
  const offset = Math.cos(((dayOfYear - 172) / 365) * 2 * Math.PI);

  const sunrise = 6.25 - amplitude * offset; // ~4.5 in summer, ~8 in winter
  const sunset = 18.5 + amplitude * offset; // ~20.25 in summer, ~16.75 in winter

  return { sunrise, sunset };
}

function shouldBeDarkForSchedule(config: ScheduleConfig): boolean {
  if (config.mode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  }

  if (config.mode === "sunset") {
    const { sunrise, sunset } = getApproxSunTimes();
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;

    const sunriseOffset = (config.sunriseOffset || 0) / 60;
    const sunsetOffset = (config.sunsetOffset || 0) / 60;

    // Dark if before sunrise or after sunset
    return (
      currentHour < sunrise + sunriseOffset ||
      currentHour >= sunset + sunsetOffset
    );
  }

  // Manual mode
  return readManualDark() ?? false;
}

function computeInitialDark(config: ScheduleConfig): boolean {
  if (config.mode === "manual") {
    return (
      readManualDark() ??
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ??
      false
    );
  }
  return shouldBeDarkForSchedule(config);
}

export interface UseDarkModeReturn {
  dark: boolean;
  toggle: () => void;
  schedule: DarkModeSchedule;
  setSchedule: (schedule: DarkModeSchedule) => void;
  sunTimes: { sunrise: string; sunset: string };
}

export function useDarkMode(): UseDarkModeReturn {
  const [scheduleConfig, setScheduleConfig] =
    useState<ScheduleConfig>(readScheduleConfig);
  const [dark, setDark] = useState<boolean>(() => {
    const d = computeInitialDark(scheduleConfig);
    applyTheme(d);
    return d;
  });

  // Update theme when dark changes
  useEffect(() => {
    applyTheme(dark);
    if (scheduleConfig.mode === "manual") {
      saveManualDark(dark);
    }
  }, [dark, scheduleConfig.mode]);

  // Listen to system preference changes
  useEffect(() => {
    if (scheduleConfig.mode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [scheduleConfig.mode]);

  // Check sunset/sunrise every minute
  useEffect(() => {
    if (scheduleConfig.mode !== "sunset") return;

    const check = () => {
      const shouldBeDark = shouldBeDarkForSchedule(scheduleConfig);
      setDark(shouldBeDark);
    };

    check(); // Initial check
    const interval = setInterval(check, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [scheduleConfig]);

  const toggle = useCallback(() => {
    if (scheduleConfig.mode !== "manual") {
      // Switch to manual mode when toggling
      const newConfig = { ...scheduleConfig, mode: "manual" as const };
      setScheduleConfig(newConfig);
      saveScheduleConfig(newConfig);
    }
    setDark((d) => !d);
  }, [scheduleConfig]);

  const setSchedule = useCallback(
    (mode: DarkModeSchedule) => {
      const newConfig = { ...scheduleConfig, mode };
      setScheduleConfig(newConfig);
      saveScheduleConfig(newConfig);

      // Immediately apply the new schedule
      if (mode !== "manual") {
        setDark(shouldBeDarkForSchedule(newConfig));
      }
    },
    [scheduleConfig],
  );

  const sunTimes = useMemo(() => {
    const { sunrise, sunset } = getApproxSunTimes();
    const formatTime = (hours: number) => {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };
    return { sunrise: formatTime(sunrise), sunset: formatTime(sunset) };
  }, []);

  return {
    dark,
    toggle,
    schedule: scheduleConfig.mode,
    setSchedule,
    sunTimes,
  };
}
