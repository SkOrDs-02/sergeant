import { useCallback, useState } from "react";
import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  REST_CATEGORY_LABELS,
  REST_DEFAULTS,
  getRestCategory,
} from "@sergeant/fizruk-domain";
import {
  RestSettingsSchema,
  type RestSettings,
} from "./useRestSettings.schema";

export { REST_CATEGORY_LABELS, REST_DEFAULTS, getRestCategory };

const KEY = STORAGE_KEYS.FIZRUK_REST_SETTINGS;

type MergedSettings = Record<keyof typeof REST_DEFAULTS, number>;
type PersistedSettings = MergedSettings & {
  byExercise: Record<string, number>;
  /**
   * Фз-1 (OD-28): тримати екран увімкненим під час активної сесії. Живе
   * поруч із пресетами відпочинку, бо це теж налаштування пристрою на час
   * тренування. За замовчуванням увімкнено: тумблер існує, щоб вимкнути.
   */
  keepScreenOn: boolean;
};

/**
 * Hook that provides user-configurable default rest durations per exercise type.
 * Settings are stored in localStorage.
 */
export function useRestSettings() {
  const [settings, setSettings] = useState<PersistedSettings>(() => {
    const parsed = safeReadLSValidated(
      KEY,
      RestSettingsSchema,
      {} as RestSettings,
    );
    const merged = { ...REST_DEFAULTS, ...parsed };
    const categories = Object.fromEntries(
      Object.keys(REST_DEFAULTS).map((k) => [
        k,
        merged[k as keyof typeof REST_DEFAULTS] ??
          REST_DEFAULTS[k as keyof typeof REST_DEFAULTS],
      ]),
    ) as MergedSettings;
    return {
      ...categories,
      byExercise: parsed.byExercise ?? {},
      keepScreenOn: parsed.keepScreenOn ?? true,
    };
  });

  const persist = useCallback((next: PersistedSettings) => {
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

  const getDefaultForExercise = useCallback(
    (exerciseId: string, primaryGroup: string) =>
      settings.byExercise[exerciseId] ?? getDefaultForGroup(primaryGroup),
    [getDefaultForGroup, settings.byExercise],
  );

  const setDefaultForExercise = useCallback(
    (exerciseId: string, sec: number) => {
      persist({
        ...settings,
        byExercise: { ...settings.byExercise, [exerciseId]: Number(sec) },
      });
    },
    [persist, settings],
  );

  const setKeepScreenOn = useCallback(
    (on: boolean) => {
      persist({ ...settings, keepScreenOn: on });
    },
    [persist, settings],
  );

  return {
    settings,
    keepScreenOn: settings.keepScreenOn,
    setKeepScreenOn,
    updateSetting,
    getDefaultForGroup,
    getDefaultForExercise,
    setDefaultForExercise,
  };
}
