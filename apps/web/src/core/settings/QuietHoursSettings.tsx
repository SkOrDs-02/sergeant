import { useState } from "react";
import { TimeField } from "@shared/components/ui/TimeField";
import { messages } from "@shared/i18n/uk";
import { SettingsSubGroup, ToggleRow } from "./SettingsPrimitives";
import type { ServerPreferenceState } from "./useServerPreference";

/**
 * Тихі години (спека notifications-quiet-hours-and-device-time, рішення
 * founder-а Б-2 (А)): тумблер і межі з точністю до хвилини, у поясі пристрою.
 *
 * Тихі години гейтять лише час, який обирає продукт (нудж Сержанта,
 * компромісний час згорнутої групи), і глушать push про операції Monobank;
 * час, який людина поставила сама, приходить як є.
 *
 * Рендериться лише тоді, коли сервер знає всі три поля: у вікні між деплоєм
 * веба і бекенду старий сервер відхилив би патч, і контрол нічого б не
 * зберіг.
 */
export interface QuietHoursSettingsProps {
  enabled: ServerPreferenceState<boolean>;
  start: ServerPreferenceState<number>;
  end: ServerPreferenceState<number>;
}

function toHm(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMinute(hm: string): number | null {
  const [h, m] = hm.split(":").map(Number);
  if (h === undefined || m === undefined) return null;
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
}

const copy = messages.sergeant;
const SAME_BOUNDS_ERROR = copy.quietHoursSameBoundsError;

export function QuietHoursSettings({
  enabled,
  start,
  end,
}: QuietHoursSettingsProps) {
  const [sameBounds, setSameBounds] = useState<"start" | "end" | null>(null);

  if (
    enabled.supported !== true ||
    start.supported !== true ||
    end.supported !== true
  ) {
    return null;
  }

  // Однакові межі не зберігаємо зовсім: сервер їх однаково відхилить (`400`),
  // а «вимкнено» вже несе тумблер. Поле лишається з попереднім значенням.
  const change = (which: "start" | "end", raw: string) => {
    // Порожнє значення (очищення пікера) не є 00:00.
    if (!raw) return;
    const minute = toMinute(raw);
    if (minute === null) return;
    const other = which === "start" ? end.value : start.value;
    if (minute === other) {
      setSameBounds(which);
      return;
    }
    setSameBounds(null);
    void (which === "start" ? start : end).set(minute);
  };

  const saveError = [enabled, start, end].find((p) => p.loaded && p.error);

  return (
    <SettingsSubGroup variant="bounded" title={copy.quietHoursTitle}>
      <ToggleRow
        label={copy.quietHoursToggleLabel}
        description={copy.quietHoursToggleDescription}
        checked={enabled.value}
        onChange={(checked) => void enabled.set(checked)}
      />
      {enabled.value && (
        <div className="grid grid-cols-2 gap-3">
          <TimeField
            label={copy.quietHoursStartLabel}
            value={toHm(start.value)}
            error={sameBounds === "start"}
            helperText={sameBounds === "start" ? SAME_BOUNDS_ERROR : undefined}
            onChange={(e) => change("start", e.target.value)}
          />
          <TimeField
            label={copy.quietHoursEndLabel}
            value={toHm(end.value)}
            error={sameBounds === "end"}
            helperText={sameBounds === "end" ? SAME_BOUNDS_ERROR : undefined}
            onChange={(e) => change("end", e.target.value)}
          />
        </div>
      )}
      {saveError && (
        <p className="text-style-caption text-danger-strong" role="alert">
          {saveError.error}
        </p>
      )}
    </SettingsSubGroup>
  );
}
