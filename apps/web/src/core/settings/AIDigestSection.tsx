/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import { useWeeklyDigest } from "../insights/useWeeklyDigest";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";

export function AIDigestSection() {
  const { digest, weekRange } = useWeeklyDigest();
  // Default ON з 2026-08-30: дайджест поза AI-квотою, тож автозапуск
  // більше нічого не «зʼїдає». Відсутнє значення = увімкнено; «0» —
  // явний opt-out.
  const [mondayAuto, setMondayAuto] = useState<boolean>(
    () =>
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") !== "0",
  );

  const handleToggleMondayAuto = (next: boolean) => {
    setMondayAuto(next);
    safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, next ? "1" : "0");
  };

  const generatedAt = digest?.generatedAt
    ? new Date(digest.generatedAt).toLocaleDateString("uk-UA", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // UX-feedback 2026-05-08: видалили кнопку «Згенерувати звіт зараз» —
  // вона дублювала аналогічну дію на дашборді (`WeeklyDigestCard` /
  // `WeeklyDigestFooter`), тож «Згенерувати/Оновити» було двічі. У
  // налаштуваннях лишився тільки тумблер автогенерації по понеділках.
  return (
    // V-7 (2026-08-08): title читається з каталогу — раніше цей рядок і
    // ⌘K-індекс (settingsSectionsCatalog.ts) розходились ("AI Звіт тижня"
    // тут vs "AI-дайджести" у пошуку) без жодної перевірки.
    <SettingsGroup title={settingsSectionTitle("ai")} icon="clipboard">
      <div className="space-y-3">
        <p className="text-style-body text-subtle leading-snug">
          Тижневий AI-аналіз прогресу по всіх модулях: фінанси, тренування,
          харчування та звички. Згенерувати звіт можна на сторінці «
          {messages.nav.reports}», у режимі «Тиждень», або на головній у блоці
          інсайтів («Звіт тижня»).
        </p>
        <div className="p-3 rounded-xl bg-bg border border-line">
          <p className="text-style-label text-text">Поточний тиждень</p>
          <p className="text-style-caption text-muted mt-0.5">{weekRange}</p>
          {generatedAt && (
            <p className="text-style-caption text-subtle mt-1">
              Згенеровано: {generatedAt}
            </p>
          )}
        </div>
        <ToggleRow
          label="Автогенерація щопонеділка"
          description="Перша сесія понеділка сама збирає звіт за завершений тиждень. Звіт не витрачає денний ліміт AI-запитів."
          checked={mondayAuto}
          onChange={handleToggleMondayAuto}
        />
      </div>
    </SettingsGroup>
  );
}
