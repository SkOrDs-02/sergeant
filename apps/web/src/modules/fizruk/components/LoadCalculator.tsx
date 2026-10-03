/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { fmtLoose } from "../lib/numberFmt";
import { Measure } from "@shared/components/ui/Measure";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
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
 * інакше користувач бачить менше число під тим самим словом, і читає це як
 * баг, а не як навмисну обережність.
 *
 * Обидві половини підпису беремо з `messages.fizruk.oneRmAging`, і це не
 * косметика. Доти тут стояли два літерали — «орієнтир» і «1RM», — тож ПОЛОВИНА
 * підпису була українською, а половина лишалась голим акронімом. Ніде більше
 * в модулі «1RM» користувачу не показують: каталог послідовно каже «рекорд»
 * (`peakLabel`) і «орієнтир» (`referenceLabel`), і `ReturnProtocolNotice`
 * підписує ТЕ САМЕ число саме цими словами. Тобто людина бачила одну величину
 * під двома різними іменами залежно від екрана.
 */
export function LoadCalculator({
  oneRM,
  reduced = false,
}: {
  oneRM: number;
  reduced?: boolean;
}) {
  const t = messages.fizruk.oneRmAging;
  const zones = buildLoadCalculatorZones(oneRM);
  if (zones.length === 0) return null;

  return (
    <Card radius="lg">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <SectionHeading as="div" size="xs" variant="fizruk">
          Калькулятор навантаження
        </SectionHeading>
        <div className="text-style-caption text-subtle">
          {reduced ? t.referenceLabel : t.peakLabel} ={" "}
          <Measure value={oneRM} unit={t.kgUnit} />
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
                  // Білий осередок на тонованій зоні: сама заливка дає
                  // S 1.10-1.14 (flat/weak), тож відмінність несе контур
                  // `border-line` (як картки в плані дня). Межа додає 1px з
                  // кожного боку, тому `py-[5px]` замість `py-1.5` тримає
                  // висоту осередка (і зон) тією самою.
                  className="text-center bg-panel border border-line rounded-xl py-[5px] px-1"
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
        Ваги округлені до найближчих 2,5{"\u202F"}кг
      </p>
    </Card>
  );
}
