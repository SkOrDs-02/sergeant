import { messages } from "@shared/i18n/uk";
import { SettingsSubGroup, ToggleRow } from "./SettingsPrimitives";

const copy = messages.sergeant;
import type { ServerPreferenceState } from "./useServerPreference";

/**
 * Тумблер push про операції Monobank (спека
 * notifications-quiet-hours-and-device-time, О-2). Значення живе на сервері:
 * його читає вебхук Monobank, коли жодного клієнта немає. За замовчуванням
 * увімкнений (так поводився вебхук до тумблера); у тихі години push не йде.
 *
 * Рендериться лише тоді, коли сервер знає поле: старий сервер відхилив би
 * патч, і тумблер нічого б не зберіг.
 */
export function MonoPushSetting({
  pref,
}: {
  pref: ServerPreferenceState<boolean>;
}) {
  if (pref.supported !== true) return null;
  return (
    <SettingsSubGroup variant="bounded" title={copy.monoPushGroupTitle}>
      <ToggleRow
        label={copy.monoPushToggleLabel}
        description={copy.monoPushToggleDescription}
        checked={pref.value}
        onChange={(checked) => void pref.set(checked)}
      />
      {pref.loaded && pref.error && (
        <p
          className="text-style-caption text-danger-strong dark:text-danger"
          role="alert"
        >
          {pref.error}
        </p>
      )}
    </SettingsSubGroup>
  );
}
