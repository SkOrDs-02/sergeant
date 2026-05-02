import { FLAG_REGISTRY, setFlag, useAllFlags } from "../lib/featureFlags";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";

/**
 * Секція «Експериментальне» у Settings. Рендерить FLAG_REGISTRY як toggle-
 * рядки. Нові експериментальні фічі з'являються тут автоматично — достатньо
 * додати запис у реєстр.
 */
export function ExperimentalSection() {
  const flags = useAllFlags();
  const items = FLAG_REGISTRY.filter((f) => f.experimental);
  if (items.length === 0) return null;

  return (
    <SettingsGroup title="Експериментальне" emoji="🧪">
      <p className="text-xs text-subtle leading-snug">
        Ці можливості ще тестуються. Вмикайте на свій ризик — поведінка може
        змінитись у наступних версіях.
      </p>
      <div className="space-y-4">
        {items.map((flag) => (
          <ToggleRow
            key={flag.id}
            label={flag.label}
            description={flag.description}
            checked={Boolean(flags[flag.id])}
            onChange={(checked) => setFlag(flag.id, checked)}
          />
        ))}
      </div>
    </SettingsGroup>
  );
}
