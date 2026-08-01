import { useCallback, useEffect, useState } from "react";
import { meApi, type UserPreferences } from "@shared/api";

/**
 * Один булевий прапорець із `/api/me/preferences` з оптимістичним записом.
 *
 * Чому серверне сховище, а не localStorage: цей прапорець читає СЕРВЕРНИЙ
 * шедулер (`lib/jobs/sergeantNudge.ts`), який працює тоді, коли жодного
 * клієнта немає. Прапорець у браузері він би не побачив.
 *
 * ponytail: `PrivacySection` містить свою копію цього циклу — вона старша за
 * цей хук і має власний набір тестів на ту копію. Зводити їх в одне варто,
 * але окремим PR-ом, а не всередині фічі.
 */

type BooleanPreferenceKey = {
  [K in keyof UserPreferences]: UserPreferences[K] extends boolean ? K : never;
}[keyof UserPreferences];

export interface ServerPreferenceState {
  value: boolean;
  /** `false`, поки сервер не відповів або відповів помилкою. */
  loaded: boolean;
  /** Непорожній рядок = показати користувачу, що збереження не відбулось. */
  error: string | null;
  saving: boolean;
  set: (next: boolean) => Promise<void>;
}

export function useServerPreference(
  key: BooleanPreferenceKey,
  copy: { saveError: string; authRequired: string },
): ServerPreferenceState {
  const [value, setValue] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    meApi
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setValue(prefs[key] === true);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Гість або збій мережі. Не помилка збереження — тумблер просто
        // нема куди писати, і копія має пояснити саме це.
        setLoaded(false);
        setError(copy.authRequired);
      });
    return () => {
      cancelled = true;
    };
  }, [key, copy.authRequired]);

  const set = useCallback(
    async (next: boolean) => {
      setError(null);
      setSaving(true);
      const previous = value;
      setValue(next);
      try {
        const saved = await meApi.updatePreferences({ [key]: next });
        setValue(saved[key] === true);
        setLoaded(true);
      } catch {
        // Відкат: інакше тумблер показує стан, якого на сервері немає, і
        // юзер вважає канал увімкненим, поки той мовчить.
        setValue(previous);
        setError(copy.saveError);
      } finally {
        setSaving(false);
      }
    },
    [key, value, copy.saveError],
  );

  return { value, loaded, error, saving, set };
}
