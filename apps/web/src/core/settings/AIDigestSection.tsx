import { useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import { useWeeklyDigest } from "../insights/useWeeklyDigest";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";

export function AIDigestSection() {
  const { digest, weekRange } = useWeeklyDigest();
  const [mondayAuto, setMondayAuto] = useState<boolean>(
    () =>
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") === "1",
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
    <SettingsGroup title="AI Звіт тижня" emoji="📋">
      <div className="space-y-3">
        <p className="text-xs text-subtle leading-snug">
          Тижневий AI-аналіз прогресу по всіх модулях: фінанси, тренування,
          харчування та звички. Згенерувати звіт можна на головній — у блоці
          «Звіт тижня».
        </p>
        <div className="p-3 rounded-xl bg-bg border border-line">
          <p className="text-xs font-semibold text-text">Поточний тиждень</p>
          <p className="text-xs text-muted mt-0.5">{weekRange}</p>
          {generatedAt && (
            <p className="text-2xs text-subtle mt-1">
              Згенеровано: {generatedAt}
            </p>
          )}
        </div>
        <div className="pt-2 border-t border-line">
          <ToggleRow
            label="Автогенерація щопонеділка"
            description="Якщо ввімкнено, ранкова сесія в понеділок запускає звіт у фоні. Вимкнуто за замовчуванням — інакше AI-виклик зʼїдається без твого запиту."
            checked={mondayAuto}
            onChange={handleToggleMondayAuto}
          />
        </div>
      </div>
    </SettingsGroup>
  );
}
