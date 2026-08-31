/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { fmtLoose } from "../lib/numberFmt";
import { Measure } from "@shared/components/ui/Measure";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import {
  buildLoadCalculatorZones,
  type LoadCalculatorZone,
} from "@sergeant/fizruk-domain";

/** Палітра tone→класи для карток зон; сітку відсотків і округлення дає домен. */
const TONE_CLASSES: Record<
  LoadCalculatorZone["tone"],
  { color: string; bgColor: string; borderColor: string }
> = {
  strength: {
    color: "text-danger-strong dark:text-danger",
    bgColor: "bg-danger/10",
    borderColor: "border-danger/20",
  },
  hypertrophy: {
    color: "text-success-strong dark:text-success",
    bgColor: "bg-success/10",
    borderColor: "border-success/20",
  },
  endurance: {
    color: "text-info-strong dark:text-info",
    bgColor: "bg-info/10",
    borderColor: "border-info/20",
  },
};

/**
 * `reduced` — калькулятор рахує від ЗНИЖЕНОГО орієнтира, а не від піка
 * (канон `fizruk.md` §6, `oneRmAging.ts`). Підпис має це визнавати вголос:
 * інакше користувач бачить менше число під тим самим словом «1RM» і читає
 * це як баг, а не як навмисну обережність.
 */
export function LoadCalculator({
  oneRM,
  reduced = false,
}: {
  oneRM: number;
  reduced?: boolean;
}) {
  const zones = buildLoadCalculatorZones(oneRM);
  if (zones.length === 0) return null;

  return (
    <Card radius="lg">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <SectionHeading as="div" size="xs" variant="fizruk">
          Калькулятор навантаження
        </SectionHeading>
        <div className="text-style-caption text-subtle">
          {reduced ? "орієнтир" : "1RM"} = <Measure value={oneRM} unit="кг" />
        </div>
      </div>
      <div className="space-y-3">
        {zones.map((zone) => (
          <div
            key={zone.tone}
            className={cn(
              "rounded-xl border p-3",
              TONE_CLASSES[zone.tone].bgColor,
              TONE_CLASSES[zone.tone].borderColor,
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={cn(
                  "text-style-caption",
                  TONE_CLASSES[zone.tone].color,
                )}
              >
                {zone.goal}
              </span>
              <span className="text-style-caption text-subtle">
                {zone.desc}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {zone.entries.map((entry) => (
                <div
                  key={entry.percent}
                  className="text-center bg-panel/60 rounded-xl py-1.5 px-1"
                >
                  <div className="text-style-caption text-subtle leading-none mb-0.5">
                    {entry.percent}%
                  </div>
                  <div className="text-style-label text-text tabular-nums leading-tight">
                    {/* Сирий `${kg}` друкував «92.5» англійською крапкою поруч із
                        «102,5 кг» у сусідньому блоці (QA 2026-08-23). */}
                    {entry.kg > 0 ? fmtLoose(entry.kg) : "—"}
                  </div>
                  <div className="text-style-caption text-muted leading-none">
                    кг
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-style-caption text-muted mt-2 text-center">
        Ваги округлені до найближчих 2,5 кг
      </p>
    </Card>
  );
}
