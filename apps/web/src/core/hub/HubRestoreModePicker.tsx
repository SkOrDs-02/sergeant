import { ChoiceGroup } from "@shared/components/ui/Choice";
import type { BackupRestoreMode } from "@shared/lib/backup/restoreMode";

// Дефолт — `merge`: додати відсутнє, нічого не видаляючи (аудит 2026-10-01,
// data-06). `replace` лишається явним вибором, бо видалення з нього їде на
// сервер і на всі пристрої акаунта.
const OPTIONS = [
  {
    value: "merge",
    label: "Додати відсутнє",
    description: "Те, що вже є, лишається як є. Нічого не видаляю.",
  },
  {
    value: "replace",
    label: "Замінити даними з файлу",
    description: "Усе, чого немає у файлі, зникне.",
  },
] as const satisfies ReadonlyArray<{
  value: BackupRestoreMode;
  label: string;
  description: string;
}>;

const LEGEND = "Як відновити дані";

interface HubRestoreModePickerProps {
  value: BackupRestoreMode;
  onChange: (mode: BackupRestoreMode) => void;
}

/** Вибір режиму відновлення рядками `ChoiceGroup` (мова станів v3.1). */
export function HubRestoreModePicker({
  value,
  onChange,
}: HubRestoreModePickerProps) {
  return (
    <ChoiceGroup<BackupRestoreMode>
      variant="rows"
      ariaLabel={LEGEND}
      className="mt-3"
      items={OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}
