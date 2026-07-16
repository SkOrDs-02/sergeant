import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { meApi } from "@shared/api";
import { downloadString } from "@shared/lib/ui/export";
import { HubBackupPanel } from "../hub/HubBackupPanel";
import { SettingsGroup } from "./SettingsPrimitives";

function exportFilename(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `sergeant-account-export-${day}.json`;
}

export function DataExportSection() {
  const [serverExportBusy, setServerExportBusy] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleServerExport = async () => {
    setServerExportBusy(true);
    setServerError(null);
    setServerMessage(null);
    try {
      const payload = await meApi.exportData();
      downloadString(
        JSON.stringify(payload, null, 2),
        exportFilename(),
        "application/json",
      );
      setServerMessage("Серверний експорт завантажено як JSON.");
    } catch {
      setServerError("Не вдалося створити серверний експорт. Перевір вхід.");
    } finally {
      setServerExportBusy(false);
    }
  };

  return (
    <SettingsGroup title="Експорт/імпорт JSON" icon="download">
      <p className="text-xs text-subtle leading-snug">
        Збережи всі свої локальні дані у файл — його потім можна імпортувати
        назад. Для залогінених користувачів нижче є окремий експорт із серверних
        даних акаунта.
      </p>
      <HubBackupPanel className="" />

      <div className="space-y-3 rounded-2xl border border-line/60 bg-surface-soft-glass p-3">
        <div>
          <h3 className="text-style-label text-text">Права на дані</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            Серверний експорт не включає сирі секрети й токени. Видалити акаунт
            можна у профілі — там зібрані всі дії керування акаунтом.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleServerExport}
            disabled={serverExportBusy}
          >
            {serverExportBusy
              ? "Готую експорт…"
              : "Завантажити серверний експорт"}
          </Button>
        </div>
        {serverMessage ? (
          <p className="text-xs text-success-strong" role="status">
            {serverMessage}
          </p>
        ) : null}
        {serverError ? (
          <p className="text-xs text-danger-strong" role="alert">
            {serverError}
          </p>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
