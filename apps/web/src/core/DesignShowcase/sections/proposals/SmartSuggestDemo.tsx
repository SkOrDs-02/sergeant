import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UX-8 — Time-of-day smart suggestions.
 *
 * Before: the entry form always opens blank — every log starts from zero.
 * After: based on time of day + past patterns, the form surfaces 1-3 tap-to-
 * fill suggestions ("Кава ₴65" in the morning, "Обід" at noon) that prefill
 * amount + category in one tap. Still editable; nothing is saved silently.
 *
 * Mock only — pick a time chip on the right to see suggestions change.
 */

const BY_TIME = {
  Ранок: [
    { label: "Кава", amount: "₴ 65", icon: "shopping-cart" },
    { label: "Сніданок", amount: "₴ 120", icon: "pie-chart" },
  ],
  День: [
    { label: "Обід", amount: "₴ 180", icon: "pie-chart" },
    { label: "Транспорт", amount: "₴ 40", icon: "credit-card" },
  ],
  Вечір: [
    { label: "Продукти", amount: "₴ 340", icon: "shopping-cart" },
    { label: "Підписка", amount: "₴ 259", icon: "credit-card" },
  ],
} as const;

export function SmartSuggestDemo() {
  const [time, setTime] = useState<keyof typeof BY_TIME>("Ранок");

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex-1 min-h-0 px-3 pt-2">
              <p className="text-style-caption text-muted mb-2">Нова витрата</p>
              <div className="h-11 rounded-xl border border-line bg-panel flex items-center px-3 text-muted text-style-body">
                ₴ 0
              </div>
              <div className="mt-2 h-9 rounded-xl border border-line bg-panel" />
              <p className="text-2xs text-muted mt-3">Форма завжди порожня.</p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex-1 min-h-0 px-3 pt-2">
              <p className="text-style-caption text-muted mb-2">
                Нова витрата · {time.toLowerCase()}
              </p>
              <div className="space-y-1.5">
                {BY_TIME[time].map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="w-full h-11 rounded-xl border border-accent/40 bg-accent/10 flex items-center gap-2 px-3"
                  >
                    <Icon name={s.icon} size={16} className="text-accent" />
                    <span className="text-style-caption text-text">
                      {s.label}
                    </span>
                    <span className="ml-auto text-style-caption tabular-nums text-accent">
                      {s.amount}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-2xs text-muted mt-3">
                Тап — і сума з категорією вже в формі.
              </p>
            </div>
          </MiniPhone>
        }
      />
      <div className="flex items-center gap-1.5">
        {(Object.keys(BY_TIME) as (keyof typeof BY_TIME)[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTime(t)}
            className={cn(
              "px-2.5 py-1 rounded-full text-2xs border transition-colors",
              t === time
                ? "bg-accent text-bg border-transparent"
                : "bg-surface-muted text-muted border-line",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
