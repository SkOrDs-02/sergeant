import { HubBackupPanel } from "../hub/HubBackupPanel";
import { SettingsGroup } from "./SettingsPrimitives";

export function DataExportSection() {
  return (
    <SettingsGroup title="Експорт/імпорт JSON" emoji="💾">
      <p className="text-xs text-subtle leading-snug">
        Зберегти всі твої дані у файл — його потім можна імпортувати назад.
        Стане в нагоді, якщо треба перенести дані без хмари (наприклад, без
        логіну) або просто мати копію «на руках». Залогіненим користувачам
        зазвичай достатньо хмарної синхронізації.
      </p>
      <HubBackupPanel className="" />
    </SettingsGroup>
  );
}
