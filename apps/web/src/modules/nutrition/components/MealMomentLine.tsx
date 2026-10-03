import { pluralDays } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

import { MomentLine } from "../../../core/insights/moments/MomentLine";
import type { Moment } from "../../../core/insights/moments/moments";
import { NUTRITION_MOMENT_TARGET } from "../lib/mealMoments";

const T = messages.nutrition.moments;
const MODULE_LABEL = messages.crossModuleLink.moduleLabel;

export function mealMomentText(m: Moment): string {
  const n = m.value ?? 0;
  const days = `${n} ${pluralDays(n)}`;
  switch (m.kind) {
    case "link":
      return T.link.replace("{detail}", m.detail ?? "");
    case "approach": {
      const module = m.detail as keyof typeof MODULE_LABEL | undefined;
      return module && module in MODULE_LABEL
        ? T.approachLink
            .replace("{n}", days)
            .replace("{module}", MODULE_LABEL[module])
        : T.approachKcal.replace("{n}", days);
    }
    default:
      return T.threshold.replace("{detail}", m.detail ?? "");
  }
}

/** Рядок моменту на картці сьогоднішнього дня журналу. */
export function MealMomentLine({ date }: { date: string }) {
  return (
    <MomentLine
      target={NUTRITION_MOMENT_TARGET}
      onDate={date}
      format={mealMomentText}
      className="text-nutrition-strong dark:text-nutrition"
    />
  );
}
