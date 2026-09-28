import { pluralDays, pluralUa, type UaPluralForms } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";

import { MomentLine } from "../../../core/insights/moments/MomentLine";
import type { Moment } from "../../../core/insights/moments/moments";

const T = messages.routine.moments;
const MARK_FORMS: UaPluralForms = {
  one: "відмітка",
  few: "відмітки",
  many: "відміток",
};

export function momentText(m: Moment): string {
  const n = m.value ?? 0;
  switch (m.kind) {
    case "dayClosed":
      return T.dayClosed;
    case "streak":
      return T.streak.replace("{n}", `${n} ${pluralDays(n)}`);
    case "freeze":
      return n > 0 ? T.freeze.replace("{left}", String(n)) : T.freezeLast;
    case "threshold":
    case "link":
      return T.threshold;
    case "approach":
      return T.approach.replace("{n}", `${n} ${pluralUa(n, MARK_FORMS)}`);
  }
}

export function RoutineMomentLine({
  target,
  onDate,
  className,
}: {
  target: string;
  onDate?: string;
  className?: string;
}) {
  return (
    <MomentLine
      target={target}
      {...(onDate !== undefined ? { onDate } : {})}
      format={momentText}
      className={cn("text-routine-strong dark:text-routine", className)}
    />
  );
}
