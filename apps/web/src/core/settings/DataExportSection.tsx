import { useState } from "react";
import { buildExportCsv, type ExportCsvSection } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { meApi, type MeExportResponse } from "@shared/api";
import { downloadString } from "@shared/lib/ui/export";
import { messages } from "@shared/i18n/uk";
import { HubBackupPanel } from "../hub/HubBackupPanel";
import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

const m = messages.dataExport;

function exportFilename(ext: "json" | "csv"): string {
  const day = new Date().toISOString().slice(0, 10);
  return `sergeant-account-export-${day}.${ext}`;
}

/**
 * Розкладає серверний експорт у секції CSV.
 *
 * AI-CONTEXT: список секцій привʼязаний до форми `MeExportResponse` і саме
 * тому будується явно, а не обходом обʼєкта рекурсією. Рекурсія дала б
 * «магічні» назви секцій із ключів схеми (`webSubscriptions`), а файл, який
 * founder попросив «щоб подивитись», має бути читабельним українською.
 * Ціна — новий масив в експорті треба додати сюди руками; тест на це є.
 */
function toCsvSections(payload: MeExportResponse): ExportCsvSection[] {
  const d = payload.data;
  return [
    { name: m.sections.moduleData, rows: d.moduleData },
    { name: m.sections.monoAccounts, rows: d.mono.accounts },
    { name: m.sections.monoTransactions, rows: d.mono.transactions },
    {
      name: m.sections.monoConnection,
      rows: d.mono.connection ? [d.mono.connection] : [],
    },
    { name: m.sections.subscriptions, rows: d.billing.subscriptions },
    { name: m.sections.pushDevices, rows: d.push.devices },
    { name: m.sections.aiUsage, rows: d.ai.usageDaily },
    { name: m.sections.aiMemories, rows: d.ai.memories },
  ];
}

export function DataExportSection() {
  const [serverExportBusy, setServerExportBusy] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleServerExport = async (format: "json" | "csv") => {
    setServerExportBusy(true);
    setServerError(null);
    setServerMessage(null);
    try {
      const payload = await meApi.exportData();
      if (format === "json") {
        downloadString(
          JSON.stringify(payload, null, 2),
          exportFilename("json"),
          "application/json",
        );
      } else {
        downloadString(
          buildExportCsv(toCsvSections(payload)),
          exportFilename("csv"),
          "text/csv",
        );
      }
      setServerMessage(format === "json" ? m.doneJson : m.doneCsv);
    } catch {
      setServerError(m.failed);
    } finally {
      setServerExportBusy(false);
    }
  };

  return (
    <SettingsGroup title="Експорт/імпорт JSON" icon="download">
      <p className="text-style-body text-subtle leading-snug">
        Збережи всі свої локальні дані у файл, його потім можна імпортувати
        назад. Для залогінених користувачів нижче є окремий експорт із серверних
        даних акаунта.
      </p>
      <HubBackupPanel className="" />

      {/* V-12 (аудит 2026-08-08, docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md
          §5): три саморобні `<h3 class="text-style-label">` → спільний
          примітив `SettingsSubGroup` (h3, `text-style-overline`) — той
          самий рецепт, канонічно пояснений у `PrivacySection.tsx`.
          Рамка-картка (border/bg/padding) навколо кожного підблоку —
          візуальне групування, не структурний заголовок, тож лишається
          зовнішньою обгорткою навколо примітиву, а не частиною самого
          `SettingsSubGroup`. */}
      <div className="rounded-2xl border border-line/60 bg-surface-soft-glass p-3">
        <SettingsSubGroup title="Права на дані">
          <p className="text-style-body text-subtle leading-relaxed">
            Серверний експорт не включає сирі секрети й токени. Видалити акаунт
            можна у профілі, там зібрані всі дії керування акаунтом.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleServerExport("json")}
              disabled={serverExportBusy}
            >
              {serverExportBusy ? m.busy : m.downloadJson}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleServerExport("csv")}
              disabled={serverExportBusy}
            >
              {serverExportBusy ? m.busy : m.downloadCsv}
            </Button>
          </div>
          <p className="text-style-caption text-subtle leading-relaxed">
            {m.formatsHint}
          </p>
          {serverMessage ? (
            <p className="text-style-caption text-success-strong" role="status">
              {serverMessage}
            </p>
          ) : null}
          {serverError ? (
            <p className="text-style-caption text-danger-strong" role="alert">
              {serverError}
            </p>
          ) : null}
        </SettingsSubGroup>
      </div>

      {/* Рішення founder-а #10, друга половина: маскування без декларації —
          внутрішня деталь, про яку користувач не знає. Перелік обробників
          стоїть тут, поруч із експортом, бо це те саме питання «що ви про
          мене знаєте і куди воно дівається». */}
      <div className="rounded-2xl border border-line/60 bg-surface-soft-glass p-3">
        <SettingsSubGroup title={m.subprocessors.title}>
          <p className="text-style-body text-subtle leading-relaxed">
            {m.subprocessors.body}
          </p>
          <p className="text-style-body text-subtle leading-relaxed">
            {m.subprocessors.photoNote}
          </p>
        </SettingsSubGroup>
      </div>

      {/* Рішення founder-а #6: попередження за 30 днів + вікно на експорт.
          Обіцянка живе В ПРОДУКТІ, поруч із кнопками, якими її виконують —
          а не лише в умовах використання, куди ніхто не заходить. */}
      <div className="rounded-2xl border border-line/60 bg-surface-soft-glass p-3">
        <SettingsSubGroup title={m.sunset.title}>
          <p className="text-style-body text-subtle leading-relaxed">
            {m.sunset.body}
          </p>
          <p className="text-style-body text-subtle leading-relaxed">
            {m.sunset.bankNote}
          </p>
        </SettingsSubGroup>
      </div>
    </SettingsGroup>
  );
}
