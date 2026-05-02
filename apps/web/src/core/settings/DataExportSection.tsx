import { HubBackupPanel } from "../hub/HubBackupPanel";
import { SettingsGroup } from "./SettingsPrimitives";

export function DataExportSection() {
  return (
    <SettingsGroup title="Експорт/імпорт JSON" emoji="💾">
      <p className="text-xs text-subtle leading-snug">
        Локальна резервна копія всього Hub у JSON-файл. Стане в нагоді, якщо
        треба перенести дані без хмари (наприклад, без логіну) або зберегти
        копію «на руках». Залогіненим користувачам зазвичай достатньо хмарної
        синхронізації.
      </p>
      <HubBackupPanel className="" />
    </SettingsGroup>
  );
}
