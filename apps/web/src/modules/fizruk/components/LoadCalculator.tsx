/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { fmt } from "../lib/numberFmt";

function roundTo2_5(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

const CALC_ZONES = [
  {
    goal: "Сила",
    color: "text-danger-strong dark:text-danger",
    bgColor: "bg-danger/10",
    borderColor: "border-danger/20",
    percents: [95, 90, 85],
    desc: "85–95% від 1RM",
  },
  {
    goal: "Гіпертрофія",
    color: "text-success-strong dark:text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
    percents: [80, 75, 70, 65],
    desc: "65–80% від 1RM",
  },
  {
    goal: "Витривалість",
    color: "text-info-strong dark:text-info",
    bgColor: "bg-info/10",
    borderColor: "border-info/20",
    percents: [65, 60, 55, 50],
    desc: "50–65% від 1RM",
  },
];

interface LoadCalculatorProps {
  oneRM: number;
  isStale?: boolean;
  isReturning?: boolean;
}

export function LoadCalculator({
  oneRM,
  isStale = false,
  isReturning = false,
}: LoadCalculatorProps) {
  const workingBase = isReturning ? oneRM * 0.8 : oneRM;
  return (
    <Card radius="lg">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <SectionHeading as="div" size="sm">
          Калькулятор навантаження
        </SectionHeading>
        <div className="flex flex-wrap justify-end gap-1.5">
          {isStale && (
            <span className="rounded-full bg-warning/10 px-2 py-1 text-style-caption text-warning-strong dark:text-warning">
              оцінка застаріла
            </span>
          )}
          {isReturning && (
            <span className="rounded-full bg-info/10 px-2 py-1 text-style-caption text-info-strong dark:text-info">
              режим повернення
            </span>
          )}
          {!isStale && (
            <span className="text-style-caption text-subtle">
              1RM = {fmt(oneRM, 0)} кг
            </span>
          )}
        </div>
      </div>
      {isStale ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning-strong dark:text-warning">
          Пік старший за 4 тижні, тому відсоткові робочі ваги не показуємо.
          Зафіксуй свіжий підхід, щоб оновити орієнтири.
        </div>
      ) : (
        <div className="space-y-3">
          {isReturning && (
            <p className="rounded-xl border border-info/30 bg-info/10 p-3 text-sm text-info-strong dark:text-info">
              Після перерви орієнтири знижено на 20%. Це не медична порада —
              обирай комфортне навантаження.
            </p>
          )}
          {CALC_ZONES.map((zone) => (
            <div
              key={zone.goal}
              className={cn(
                "rounded-xl border p-3",
                zone.bgColor,
                zone.borderColor,
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-style-caption", zone.color)}>
                  {zone.goal}
                </span>
                <span className="text-style-caption text-subtle">
                  {zone.desc}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {zone.percents.map((pct) => {
                  const kg = roundTo2_5(workingBase * (pct / 100));
                  return (
                    <div
                      key={pct}
                      className="text-center bg-panel/60 rounded-xl py-1.5 px-1"
                    >
                      <div className="text-style-caption text-subtle leading-none mb-0.5">
                        {pct}%
                      </div>
                      <div className="text-style-label text-text tabular-nums leading-tight">
                        {kg > 0 ? `${kg}` : "—"}
                      </div>
                      <div className="text-style-caption text-muted leading-none">
                        кг
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {!isStale && (
        <p className="text-style-caption text-muted mt-2 text-center">
          Ваги округлені до найближчих 2.5 кг
        </p>
      )}
    </Card>
  );
}
