import { cn } from "@shared/lib/ui/cn";
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
    // V-13 — акцент бейджа вимагає пари `icon` + `module`; чому саме так,
    // розписано у `FinykSection.tsx`.
    <SettingsGroup title="Фізрук" icon="dumbbell" module="fizruk">
      <SettingsSubGroup title="Таймер відпочинку">
        <p className="text-style-body text-subtle leading-snug">
          Скільки відпочивати між підходами. Обране значення стає таймером за
          замовчуванням для вправ цього типу.
        </p>
        <div className="space-y-4">
          {(
            Object.entries(REST_CATEGORY_LABELS) as [RestCategory, string][]
          ).map(([cat, label]) => (
            // Лейбл над рядком кнопок, а не поруч: у горизонтальному варіанті
            // пʼять кнопок по 56px (296px) не вміщались поряд із текстом на
            // мобільній ширині і `flex-wrap` рвав ряд навпіл (user report
            // «криві написи»). Кнопки тепер ділять ширину порівну.
            <div key={cat} className="space-y-1.5">
              {/* PR-S14: лейбл категорії був суто візуальним — скрінрідер
                  читав пʼять голих «30с / 60с / …» поспіль пʼять разів
                  поспіль і не міг сказати, до чого вони. `id` + `role="group"`
                  з `aria-labelledby` звʼязують ряд із його назвою. */}
              <span
                id={`rest-${cat}-label`}
                className="text-style-label text-text block"
              >
                {label}
              </span>
              <div
                className="flex items-center gap-1"
                role="group"
                aria-labelledby={`rest-${cat}-label`}
              >
                {[30, 60, 90, 120, 180].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => updateSetting(cat, sec)}
                    // Обраний стан доти передавався ЛИШЕ кольором рамки й
                    // фону — для скрінрідера й для людини з порушенням
                    // сприйняття кольору його не існувало.
                    aria-pressed={typedSettings[cat] === sec}
                    className={cn(
                      "h-11 flex-1 min-w-0 rounded-xl border text-style-label font-semibold transition-colors",
                      typedSettings[cat] === sec
                        ? "border-success bg-success/15 text-success-strong dark:text-success"
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
