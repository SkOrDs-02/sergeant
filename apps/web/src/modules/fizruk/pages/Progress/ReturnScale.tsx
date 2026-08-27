/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Шкала повернення — signature-view Фізрука (анти-слоп П1,
 * `docs/05-design/design/anti-slop-strategy.md` §4/П1; мокап —
 * `mockups/product/signature-views.html`, рішення власника 2026-08-06).
 *
 * Діагноз: `oneRmAging.ts` рахує пік, знижений орієнтир, поріг
 * застарілості, швидкість спаду і підлогу спаду — а борд показує ОДНЕ
 * число (пік) плюс текстові бейджі. Відношення між піком, спадом і
 * підлогою не має форми ніде, хоча саме воно відповідає на питання «що
 * я можу підняти сьогодні».
 *
 * AI-DANGER: головне число тут — `reference1rm`, а НЕ пік. Це те, від
 * чого людина рахує робочу вагу; `Exercise.tsx` уже містить таку саму
 * помітку біля калькулятора навантаження. Помінявши їх місцями, ми
 * знімемо рівно той захист, заради якого старіння 1RM існує (канон
 * `fizruk.md` §6).
 *
 * Форма — шкала, а не стовпчики на осі часу (як гребінь Фініка чи смуга
 * дня Їжі), бо питання інше: не «коли», а «наскільки далеко я від себе
 * найкращого». Відстань — отже шкала.
 */
import { ONE_RM_DECAY_FLOOR } from "@sergeant/fizruk-domain/domain";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

/**
 * Максимальне зниження у відсотках — довжина всієї шкали.
 *
 * Виводиться з підлоги спаду, а не вписується числом: якщо колись
 * зміниться `ONE_RM_DECAY_FLOOR`, шкала поїде разом із ним, а не почне
 * мовчки брехати про свої межі.
 */
export const MAX_REDUCTION_PCT = Math.round((1 - ONE_RM_DECAY_FLOOR) * 100);

/**
 * Позиція орієнтира на шкалі, 0..1. Нуль — підлога спаду, одиниця — пік.
 *
 * Пік у формулі скорочується: `(peak·(1−r) − peak·floor) / (peak·(1−floor))`
 * зводиться до `1 − r/MAX`. Тому шкала не залежить від того, 60 кг ця
 * вправа чи 200 — лише від того, наскільки орієнтир просів.
 */
export function referencePosition(reductionPct: number): number {
  if (!Number.isFinite(reductionPct) || reductionPct <= 0) return 1;
  const pos = 1 - reductionPct / MAX_REDUCTION_PCT;
  return Math.min(1, Math.max(0, pos));
}

export interface ReturnScaleProps {
  peak1rm: number;
  reference1rm: number;
  /** На скільки % орієнтир нижчий за пік. 0 — свіжа вправа. */
  reductionPct: number;
  daysSinceLastSession: number | null;
  isStale: boolean;
  className?: string;
}

export function ReturnScale({
  peak1rm,
  reference1rm,
  reductionPct,
  daysSinceLastSession,
  isStale,
  className,
}: ReturnScaleProps) {
  const copy = messages.fizruk.returnScale;
  if (peak1rm <= 0) return null;

  const pos = referencePosition(reductionPct);
  const atFloor = pos <= 0;

  return (
    <div className={cn("mt-2", className)}>
      {/* AI-CONTEXT: доріжка — картинка, числа поруч уже є текстом
          (орієнтир у заголовку рядка, пік у підписі під шкалою). Тому
          `aria-hidden`: дублювати ті самі кілограми ще й через
          `progressbar` означало б читати їх скрінрідеру двічі. */}
      <div
        aria-hidden
        className="relative h-4 border-x border-line"
        title={`${copy.referenceLabel}: ${Math.round(reference1rm)} ${copy.kgUnit}`}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <div
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 bg-fizruk/20"
          style={{ width: `${pos * 100}%` }}
        />
        <div
          className={cn(
            "absolute top-0 h-4 w-0.5 -translate-x-1/2",
            isStale ? "bg-warning-strong dark:bg-warning" : "bg-fizruk-strong",
          )}
          style={{ left: `${pos * 100}%` }}
        />
      </div>

      {/*
        П4 fix: the axis tick ("−25%") used to share a row with the status
        text ("свіже · 0 дн. тому") and the peak label. On a fresh PR the
        marker sits at the right edge next to "пік 101", but eyes still
        pass over the "−25%" tick at the far-left on the way there — the
        owner's repro read that as "you're at −25%" even though it is only
        the scale's OTHER end. Splitting into two rows fixes the confusion:
        the top row is purely the abstract axis (dim, small, brackets the
        track), the bottom row is the two real numbers about YOU (temporal
        status + the actual peak weight) — visually and semantically
        separate from the axis.
      */}
      <div
        aria-hidden
        className="mt-1 flex items-center justify-between text-style-caption text-subtle tabular-nums"
      >
        <span>−{MAX_REDUCTION_PCT}%</span>
        <span>0%</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-style-caption text-muted tabular-nums">
        {/*
          Тон навмисно констатувальний: канон `fizruk.md` §6 вимагає
          «констатація, не докір». Тому в середині стоїть факт про паузу
          («5 тижнів без роботи»), а не оцінка людини, і слово «спад»
          зʼявляється лише коли він справді дійшов до підлоги.
        */}
        <span
          className={cn(isStale && "text-warning-strong dark:text-warning")}
        >
          {atFloor
            ? copy.atFloor
            : daysSinceLastSession == null
              ? copy.noHistory
              : isStale
                ? `${daysSinceLastSession} ${copy.daysWithoutWork}`
                : `${copy.fresh} · ${daysSinceLastSession} ${copy.daysAgo}`}
        </span>
        <span>
          {copy.peakPrefix} {Math.round(peak1rm)}
        </span>
      </div>
    </div>
  );
}
