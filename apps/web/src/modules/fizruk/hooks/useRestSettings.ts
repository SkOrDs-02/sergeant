import { useCallback, useState } from "react";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  REST_CATEGORY_LABELS,
  REST_DEFAULTS,
  getRestCategory,
} from "@sergeant/fizruk-domain";
import { RestSettingsSchema, type RestSettings } from "./useRestSettings.schema";

export { REST_CATEGORY_LABELS, REST_DEFAULTS, getRestCategory };

const KEY = STORAGE_KEYS.FIZRUK_REST_SETTINGS;

type MergedSettings = typeof REST_DEFAULTS;

/**
 * Hook that provides user-configurable default rest durations per exercise type.
 * Settings are stored in localStorage.
 */
export function useRestSettings() {
  const [settings, setSettings] = useState<MergedSettings>(() => {
    const parsed = safeReadLSValidated(KEY, RestSettingsSchema, {} as RestSettings);
    return { ...REST_DEFAULTS, ...parsed };
  });

  const persist = useCallback((next: MergedSettings) => {
    setSettings(next);
    safeWriteLS(KEY, next);
  }, []);

  const updateSetting = useCallback(
    (category: keyof MergedSettings, sec: number) => {
      persist({ ...settings, [category]: Number(sec) });
    },
    [settings, persist],
  );

  const getDefaultForGroup = useCallback(
    (primaryGroup: string) => {
      const cat = getRestCategory(primaryGroup);
      return settings[cat] ?? REST_DEFAULTS[cat];
    },
    [settings],
  );

  return { settings, updateSetting, getDefaultForGroup };
}
