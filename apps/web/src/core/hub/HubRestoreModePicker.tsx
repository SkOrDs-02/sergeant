import { cn } from "@shared/lib/ui/cn";
import type { BackupRestoreMode } from "@shared/lib/backup/restoreMode";

interface ModeOption {
  value: BackupRestoreMode;
  label: string;
  hint: string;
}

// Дефолт — `merge`: додати відсутнє, нічого не видаляючи (аудит 2026-10-01,
// data-06). `replace` лишається явним вибором, бо видалення з нього їде на
// сервер і на всі пристрої акаунта.
const OPTIONS: readonly ModeOption[] = [
  {
    value: "merge",
    label: "Додати відсутнє",
    hint: "Те, що вже є, лишається як є. Нічого не видаляю.",
  },
  {
    value: "replace",
    label: "Замінити даними з файлу",
    hint: "Усе, чого немає у файлі, зникне.",
  },
];

const LEGEND = "Як відновити дані";

interface HubRestoreModePickerProps {
  value: BackupRestoreMode;
  onChange: (mode: BackupRestoreMode) => void;
}

export function HubRestoreModePicker({
  value,
  onChange,
}: HubRestoreModePickerProps) {
  return (
    <fieldset className="mt-3 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">{LEGEND}</legend>
      {OPTIONS.map((opt) => {
        const checked = opt.value === value;
        return (
          <label
            key={opt.value}
            htmlFor={`hub-restore-mode-${opt.value}`}
            aria-label={`${opt.label} · ${opt.hint}`}
            className={cn(
              "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/45 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg",
              checked
                ? "border-control bg-brand-soft"
                : "border-line bg-panel hover:bg-panelHi",
            )}
          >
            <input
              id={`hub-restore-mode-${opt.value}`}
              type="radio"
              name="hub-restore-mode"
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                checked
                  ? "border-transparent bg-brand-strong"
                  : "border-control",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full bg-white",
                  checked ? "opacity-100" : "opacity-0",
                )}
              />
            </span>
            <span className="flex flex-col">
              <span className="text-style-label text-text">{opt.label}</span>
              <span className="text-style-caption text-muted">{opt.hint}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
