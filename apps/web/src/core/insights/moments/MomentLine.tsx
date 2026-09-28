import { cn } from "@shared/lib/ui/cn";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";

import type { Moment } from "./moments";
import { useMoment } from "./momentsStore";

/**
 * Рядок моменту в самому елементі (ADR-0096): не тост і не модалка, нічого
 * не перекриває і не вимагає закриття. Нема моменту на сьогодні, нема й
 * рядка: мовчання лишається за замовчуванням. Текст дає модуль, бо копія
 * живе в його каталозі.
 */
export function MomentLine({
  target,
  onDate,
  format,
  className,
}: {
  target: string;
  /** Дата елемента: момент живе лише на сьогоднішньому. */
  onDate?: string;
  format: (moment: Moment) => string;
  className: string;
}) {
  const moment = useMoment(target);
  const todayKey = useDeviceDayKey();
  if (!moment || (onDate !== undefined && onDate !== todayKey)) return null;
  return (
    <p role="status" className={cn("text-style-caption", className)}>
      {format(moment)}
    </p>
  );
}
