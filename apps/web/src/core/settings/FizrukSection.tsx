import { cn } from "@shared/lib/cn";
import {
  useRestSettings,
  REST_CATEGORY_LABELS,
} from "../../modules/fizruk/hooks/useRestSettings";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

type RestCategory = keyof typeof REST_CATEGORY_LABELS;

export function FizrukSection() {
  const { settings, updateSetting } = useRestSettings();
  const typedSettings = settings as Record<RestCategory, number>;

  return (
    <SettingsGroup title="Фізрук" emoji="🏋️">
      <SettingsSubGroup title="Таймер відпочинку">
        <p className="text-xs text-subtle leading-snug">
          Рекомендований час відпочинку підбирається автоматично за типом
          вправи. Ці значення з&apos;являться як кнопка за замовчуванням у
          кожній вправі.
        </p>
        <div className="space-y-3">
          {(
            Object.entries(REST_CATEGORY_LABELS) as [RestCategory, string][]
          ).map(([cat, label]) => (
            <div key={cat} className="flex items-center gap-3">
              <span className="text-xs text-text flex-1 min-w-0">{label}</span>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {[30, 60, 90, 120, 180].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => updateSetting(cat, sec)}
                    className={cn(
                      "h-9 w-14 rounded-xl border text-xs font-semibold transition-colors",
                      typedSettings[cat] === sec
                        ? "border-success bg-success/15 text-success"
                        : "border-line bg-panelHi text-subtle hover:text-text",
                    )}
                  >
                    {sec}с
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
