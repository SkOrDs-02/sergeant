import { memo } from "react";
import { Money, Delta } from "@shared/components/ui/Money";

interface ComparisonRowProps {
  label: string;
  current: number;
  /** Абсолютна дельта в гривнях, з домену. */
  diff: number;
  /** Відсоток з точних сум або `null`, коли попередній місяць не база (Р4). */
  pct: number | null;
  kind?: "expense" | "income";
  showBalance?: boolean;
}

// Рядок порівняння метрики з попереднім місяцем. Чиста функція від пропсів —
// memo знімає перерендер при оновленнях сусідніх секцій Analytics.
// `kind` визначає семантику знаку: для "expense" зростання — погано
// (червоне), для "income" — добре (зелене). Формули тут немає: дельту й
// відсоток дає `getTrendComparison` з точних копійок (Р4 спеки аналітики
// v2); коли відсоток не має бази, показуємо абсолютну дельту в гривнях.
export const ComparisonRow = memo(function ComparisonRow({
  label,
  current,
  diff,
  pct,
  kind = "expense",
  showBalance = true,
}: ComparisonRowProps) {
  return (
    <div className="flex items-center justify-between text-style-label">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {showBalance ? (
          <Money amount={current} className="text-text font-medium" />
        ) : (
          <span className="text-text font-medium">••••</span>
        )}
        {showBalance && (pct !== null || diff !== 0) && (
          /* Полярність задає `kind`, а не знак: зростання доходу — добре,
             зростання витрат — ні. Рівно те розділення, заради якого
             `Delta` бере `polarity` окремим пропом. Нуль проти нуля (дохід
             у двох місяцях без записів) дельти не має, рядок мовчить. */
          <Delta
            value={pct === null ? diff : Math.round(pct)}
            symbol={pct === null ? "₴" : "%"}
            polarity={kind === "income" ? "positive" : "negative"}
            className="text-style-caption font-normal"
          />
        )}
      </div>
    </div>
  );
});
