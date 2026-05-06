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
    color: "text-danger",
    bgColor: "bg-danger/10",
    borderColor: "border-danger/20",
    percents: [95, 90, 85],
    desc: "85–95% від 1RM",
  },
  {
    goal: "Гіпертрофія",
    color: "text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
    percents: [80, 75, 70, 65],
    desc: "65–80% від 1RM",
  },
  {
    goal: "Витривалість",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    percents: [65, 60, 55, 50],
    desc: "50–65% від 1RM",
  },
];

export function LoadCalculator({ oneRM }: { oneRM: number }) {
  return (
    <Card radius="lg">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <SectionHeading as="div" size="sm">
          Калькулятор навантаження
        </SectionHeading>
        <div className="text-2xs text-subtle">1RM = {fmt(oneRM, 0)} кг</div>
      </div>
      <div className="space-y-3">
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
              <span className={cn("text-xs font-bold", zone.color)}>
                {zone.goal}
              </span>
              <span className="text-2xs text-subtle">{zone.desc}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {zone.percents.map((pct) => {
                const kg = roundTo2_5(oneRM * (pct / 100));
                return (
                  <div
                    key={pct}
                    className="text-center bg-panel/60 rounded-xl py-1.5 px-1"
                  >
                    <div className="text-2xs text-subtle leading-none mb-0.5">
                      {pct}%
                    </div>
                    <div className="text-sm font-bold text-text tabular-nums leading-tight">
                      {kg > 0 ? `${kg}` : "—"}
                    </div>
                    <div className="text-2xs text-muted leading-none">кг</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-2xs text-muted mt-2 text-center">
        Ваги округлені до найближчих 2.5 кг
      </p>
    </Card>
  );
}
