import {
  useRestSettings,
  REST_CATEGORY_LABELS,
} from "../../modules/fizruk/hooks/useRestSettings";
import { isScreenWakeLockSupported } from "../../modules/fizruk/hooks/useScreenWakeLock";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n/uk";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

type RestCategory = keyof typeof REST_CATEGORY_LABELS;

export function FizrukSection() {
  const { settings, updateSetting, keepScreenOn, setKeepScreenOn } =
    useRestSettings();
  const typedSettings = settings as Record<RestCategory, number>;
  const during = messages.fizruk.duringWorkoutSettings;
  // Де API немає, тумблер не обіцяє того, чого не буде: вимкнений і з
  // підказкою, що робити замість нього (Фз-1).
  const wakeLockSupported = isScreenWakeLockSupported();
  return (
    <SettingsGroup title="Фізрук">
      <SettingsSubGroup variant="bounded" title={during.title}>
        <ToggleRow
          label={during.keepScreenOnLabel}
          description={
            wakeLockSupported
              ? during.keepScreenOnDescription
              : during.keepScreenOnUnsupported
          }
          checked={wakeLockSupported && keepScreenOn}
          disabled={!wakeLockSupported}
          onChange={setKeepScreenOn}
        />
      </SettingsSubGroup>
      <SettingsSubGroup variant="bounded" title="Таймер відпочинку">
        <p className="text-style-body text-muted">
          {messages.fizruk.restSettingsHint}
        </p>
        <div className="divide-y divide-line">
          {(
            Object.entries(REST_CATEGORY_LABELS) as [RestCategory, string][]
          ).map(([cat, label]) => (
            <section key={cat} className="py-3 first:pt-0 last:pb-0">
              <h4 className="text-style-label font-semibold text-text">
                {label}
              </h4>
              <ChoiceGroup
                size="sm"
                className="mt-2"
                ariaLabel={label}
                value={String(typedSettings[cat])}
                items={[30, 60, 90, 120, 180].map((sec) => ({
                  value: String(sec),
                  label: `${sec}с`,
                }))}
                onChange={(value) => updateSetting(cat, Number(value))}
              />
            </section>
          ))}
        </div>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
