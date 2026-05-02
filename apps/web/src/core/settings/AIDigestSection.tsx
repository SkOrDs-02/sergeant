import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { useToast } from "@shared/hooks/useToast";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import { useWeeklyDigest } from "../insights/useWeeklyDigest";
import { SettingsGroup, ToggleRow } from "./SettingsPrimitives";

export function AIDigestSection() {
  const { digest, loading, error, weekRange, generate } = useWeeklyDigest();
  const [done, setDone] = useState(false);
  const { success: toastSuccess } = useToast();
  const [mondayAuto, setMondayAuto] = useState<boolean>(
    () =>
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") === "1",
  );

  const handleGenerate = async () => {
    setDone(false);
    const result = await generate();
    if (result) {
      setDone(true);
      toastSuccess("Звіт тижня згенеровано!");
    }
  };

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

  return (
    <SettingsGroup title="AI Звіт тижня" emoji="📋">
      <div className="space-y-3">
        <p className="text-xs text-subtle leading-snug">
          Тижневий AI-аналіз прогресу по всіх модулях: фінанси, тренування,
          харчування та звички. Звіт доступний на дашборді щопонеділка або за
          запитом.
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
        {error && (
          <p className="text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <Button
          type="button"
          className="w-full h-11"
          disabled={loading}
          onClick={handleGenerate}
        >
          {loading
            ? "Генерую…"
            : done
              ? "✓ Звіт готовий"
              : digest
                ? "Оновити звіт тижня"
                : "Згенерувати звіт зараз"}
        </Button>
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
