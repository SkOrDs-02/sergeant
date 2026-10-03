import { pluralUa, type UaPluralForms } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

import { MomentLine } from "../../../../core/insights/moments/MomentLine";
import type { Moment } from "../../../../core/insights/moments/moments";

const T = messages.fizruk.workoutSummary.moments;
const WORKOUT_FORMS: UaPluralForms = {
  one: "тренування",
  few: "тренування",
  many: "тренувань",
};

export function workoutMomentText(m: Moment): string {
  const n = m.value ?? 0;
  if (m.kind === "approach") {
    return T.approach.replace("{n}", `${n} ${pluralUa(n, WORKOUT_FORMS)}`);
  }
  return T.threshold.replace("{detail}", m.detail ?? "");
}

/** Рядок моменту в підсумку щойно завершеного тренування. */
export function WorkoutMomentLine({ workoutId }: { workoutId: string }) {
  return (
    <MomentLine
      target={workoutId}
      format={workoutMomentText}
      className="mt-1 text-fizruk-strong dark:text-fizruk"
    />
  );
}
