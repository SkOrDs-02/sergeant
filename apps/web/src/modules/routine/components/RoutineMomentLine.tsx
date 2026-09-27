import { pluralDays, pluralUa, type UaPluralForms } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";

import type { Moment } from "../../../core/insights/moments/moments";
import { useMoment } from "../../../core/insights/moments/momentsStore";

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
      return T.threshold;
    case "approach":
      return T.approach.replace("{n}", `${n} ${pluralUa(n, MARK_FORMS)}`);
  }
}

/**
 * Рядок моменту в самому елементі (ADR-0096): не тост і не модалка, нічого
 * не перекриває і не вимагає закриття. Нема моменту на сьогодні, нема й
 * рядка: мовчання лишається за замовчуванням.
 */
export function RoutineMomentLine({
  target,
  onDate,
  className,
}: {
  target: string;
  /** Дата рядка стрічки: момент живе лише на сьогоднішньому. */
  onDate?: string;
  className?: string;
}) {
  const moment = useMoment(target);
  const todayKey = useDeviceDayKey();
  if (!moment || (onDate !== undefined && onDate !== todayKey)) return null;
  return (
    <p
      role="status"
      className={cn(
        "text-style-caption text-routine-strong dark:text-routine",
        className,
      )}
    >
      {momentText(moment)}
    </p>
  );
}
