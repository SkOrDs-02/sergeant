import { useCallback, useState } from "react";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  REST_CATEGORY_LABELS,
  REST_DEFAULTS,
  getRestCategory,
} from "@sergeant/fizruk-domain";
import { RestSettingsSchema } from "./useRestSettings.schema";

export { REST_CATEGORY_LABELS, REST_DEFAULTS, getRestCategory };

const KEY = STORAGE_KEYS.FIZRUK_REST_SETTINGS;

/**
 * Hook that provides user-configurable default rest durations per exercise type.
 * Settings are stored in localStorage.
 */
export function useRestSettings() {
  const [settings, setSettings] = useState(() => {
    const parsed = safeReadLSValidated(KEY, RestSettingsSchema, {});
    return { ...REST_DEFAULTS, ...parsed };
  });

  const persist = useCallback((next) => {
    setSettings(next);
    safeWriteLS(KEY, next);
  }, []);

  const updateSetting = useCallback(
    (category, sec) => {
      persist({ ...settings, [category]: Number(sec) });
    },
    [settings, persist],
  );

  const getDefaultForGroup = useCallback(
    (primaryGroup) => {
      const cat = getRestCategory(primaryGroup);
      return settings[cat] ?? REST_DEFAULTS[cat];
    },
    [settings],
  );

  return { settings, updateSetting, getDefaultForGroup };
}
