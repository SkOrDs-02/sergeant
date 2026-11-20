import { messages } from "@shared/i18n/uk";
import { SettingsSubGroup, ToggleRow } from "./SettingsPrimitives";
import type { ServerPreferenceState } from "./useServerPreference";

const copy = messages.sergeant;

/**
 * Підгрупа «Фінік» у сповіщеннях: тумблер push про операції Monobank (спека
 * notifications-quiet-hours-and-device-time, О-2) і тумблер push про ліміти й
 * платежі (спека finyk-limit-and-recurring-push, Ф-4 б). Значення живуть на
 * сервері: їх читає серверний прохід, коли жодного клієнта немає. Обидва за
 * замовчуванням увімкнені; у тихі години push не йде.
 *
 * Кожен рядок рендериться лише тоді, коли сервер знає поле: старий сервер
 * відхилив би патч, і тумблер нічого б не зберіг. Тумблер лімітів і платежів
 * додатково потребує активного модуля «Фінік» (`finykActive`): ручні витрати
 * теж мають ліміти, тож Monobank-підключення не вимагається.
 */
export function MonoPushSetting({
  pref,
  alertsPref,
  finykActive = false,
}: {
  pref: ServerPreferenceState<boolean>;
  alertsPref?: ServerPreferenceState<boolean>;
  finykActive?: boolean;
}) {
  const showMono = pref.supported === true;
  const showAlerts =
    finykActive && !!alertsPref && alertsPref.supported === true;
  if (!showMono && !showAlerts) return null;
  return (
    <SettingsSubGroup variant="bounded" title={copy.monoPushGroupTitle}>
      {showMono && (
        <ToggleRow
          label={copy.monoPushToggleLabel}
          description={copy.monoPushToggleDescription}
          checked={pref.value}
          onChange={(checked) => void pref.set(checked)}
        />
      )}
      {showMono && pref.loaded && pref.error && (
        <p
          className="text-style-caption text-danger-strong dark:text-danger"
          role="alert"
        >
          {pref.error}
        </p>
      )}
      {showAlerts && alertsPref && (
        <ToggleRow
          label={copy.finykAlertsToggleLabel}
          description={copy.finykAlertsToggleDescription}
          checked={alertsPref.value}
          onChange={(checked) => void alertsPref.set(checked)}
        />
      )}
      {showAlerts && alertsPref?.loaded && alertsPref.error && (
        <p
          className="text-style-caption text-danger-strong dark:text-danger"
          role="alert"
        >
          {alertsPref.error}
        </p>
      )}
    </SettingsSubGroup>
  );
}
