import { useState } from "react";
import { buildExportCsv, type ExportCsvSection } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { meApi, type MeExportResponse } from "@shared/api";
import { downloadString } from "@shared/lib/ui/export";
import { messages } from "@shared/i18n/uk";
import { useAuthOptional } from "../auth/AuthContext";
import { HubBackupPanel } from "../hub/HubBackupPanel";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
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
  const auth = useAuthOptional();
  /**
   * Три стани, а не два: `null` означає «ще не знаємо».
   *
   * `useAuthOptional` повертає `null` там, де провайдера немає взагалі
   * (демо-рендер, частина тестів) — там ми теж НЕ знаємо і нічого не
   * стверджуємо. Те саме поки `isLoading`. Гейт нижче реагує лише на
   * явне `false`, тобто на підтверджене «це гість».
   */
  const signedIn: boolean | null =
    auth == null || auth.isLoading ? null : auth.user != null;
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
    <SettingsGroup title={settingsSectionTitle("dataExport")} icon="download">
      <p className="text-style-body text-subtle leading-snug">
        Збережи всі свої локальні дані у файл, його потім можна імпортувати
        назад. Для залогінених користувачів нижче є окремий експорт із серверних
        даних акаунта.
      </p>
      <HubBackupPanel className="" />

      {/* V-12 (аудит 2026-08-08, docs/work/specs/audits/2026-08-08-profile-settings-deep-audit.md
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
          {/* PR-S14: дві кнопки б'ють у `meApi.exportAccount`, який для гостя
              завжди 401. Доти гість натискав їх і отримував помилку — тобто
              інтерфейс пропонував дію, якої не існує для його стану, і
              пояснював це вже постфактум. Тепер стан видно ДО натискання.

              AI-DANGER: гейт стоїть на `signedIn === false`, а не на
              `!signedIn`. Різниця не косметична: доки сесія гідрується,
              `signedIn` це `null`, і кнопки лишаються як були. Заміна на
              `!signedIn` зробила б так, що кожен залогінений користувач на
              частку секунди бачить «увійди» — рівно той дефект, який
              PR-S2 лікував у сусідній секції. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleServerExport("json")}
              disabled={serverExportBusy || signedIn === false}
            >
              {serverExportBusy ? m.busy : m.downloadJson}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleServerExport("csv")}
              disabled={serverExportBusy || signedIn === false}
            >
              {serverExportBusy ? m.busy : m.downloadCsv}
            </Button>
          </div>
          {signedIn === false ? (
            <p className="text-style-caption text-subtle leading-relaxed">
              {m.guestHint}
            </p>
          ) : null}
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

      {/* Тут раніше стояли дві декларації — «Куди їдуть дані для AI»
          (рішення founder-а #10) і sunset-обіцянка (рішення #6). Вони
          переїхали в «Дані та приватність» (`PrivacySection`) рішенням
          founder-а 2026-09-14, знахідка PR-S4 продуктового огляду: питання
          «що ви про мене знаєте» людина носить у приватність, а сюди йде по
          файл. Розділ тепер про самі файли й нічого більше. */}
    </SettingsGroup>
  );
}
