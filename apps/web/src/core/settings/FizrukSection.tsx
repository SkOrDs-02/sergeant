import {
  useRestSettings,
  REST_CATEGORY_LABELS,
} from "../../modules/fizruk/hooks/useRestSettings";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n/uk";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

type RestCategory = keyof typeof REST_CATEGORY_LABELS;

export function FizrukSection() {
  const { settings, updateSetting } = useRestSettings();
  const typedSettings = settings as Record<RestCategory, number>;
  return (
    <SettingsGroup title="Фізрук">
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
                className="mt-2 grid grid-cols-5"
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
