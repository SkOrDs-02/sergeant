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
  const [deleteBusy, setDeleteBusy] = useState(false);
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
      setServerMessage("Серверний export завантажено як JSON.");
    } catch {
      setServerError("Не вдалося створити серверний export. Перевір вхід.");
    } finally {
      setServerExportBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Видалити акаунт і запустити deletion orchestration? Частину даних можемо тримати до 30 днів для recovery/audit.",
    );
    if (!confirmed) return;

    setDeleteBusy(true);
    setServerError(null);
    setServerMessage(null);
    try {
      await meApi.deleteAccount();
      setServerMessage("Deletion request прийнято. Повертаю на головну…");
      window.location.assign("/");
    } catch {
      setServerError("Не вдалося видалити акаунт. Спробуй ще раз або напиши в support.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <SettingsGroup title="Експорт/імпорт JSON" emoji="💾">
      <p className="text-xs text-subtle leading-snug">
        Збережи всі свої локальні дані у файл — його потім можна імпортувати
        назад. Для залогінених користувачів нижче є окремий privacy export із
        серверних даних акаунта.
      </p>
      <HubBackupPanel className="" />

      <div className="space-y-3 rounded-2xl border border-line/60 bg-surface-soft-glass p-3">
        <div>
          <h3 className="text-style-label text-text">Data rights</h3>
          <p className="mt-1 text-xs text-subtle leading-relaxed">
            Серверний export не включає сирі secrets/tokens. Видалення акаунта
            запускає orchestration із 30-денним recovery/audit grace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleServerExport}
            disabled={serverExportBusy || deleteBusy}
          >
            {serverExportBusy ? "Готую export…" : "Завантажити server export"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDeleteAccount}
            disabled={serverExportBusy || deleteBusy}
            className="text-danger-strong"
          >
            {deleteBusy ? "Видаляю…" : "Видалити акаунт"}
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
