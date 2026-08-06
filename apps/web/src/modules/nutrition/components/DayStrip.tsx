/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Смуга дня — signature-view Їжі (анти-слоп П1). Побудова —
 * `../lib/dayStrip.ts`, мокап — `mockups/product/signature-views.html`.
 *
 * Висота стовпчика — калорії години, положення — година доби,
 * ШТРИХУВАННЯ — та частина калорій, яку вгадав ШІ з фото.
 *
 * AI-CONTEXT: невпевненість кодується штрихом, а НЕ кольором. Колір уже
 * зайнятий модулем (лаймовий = Їжа), і фарбувати ним ще й впевненість
 * означало б два сенси в одному каналі — при тому, що модульний акцент
 * має лишатись впізнаваним. Штрих — окремий канал, він читається навіть
 * тоді, коли колір недоступний (монохром, дальтонізм, друк).
 */
import { useMemo, type CSSProperties } from "react";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import type { Meal } from "@sergeant/nutrition-domain";
import { buildDayStrip, HOURS_IN_DAY } from "../lib/dayStrip";

/**
 * Штрих для вгаданих калорій. `currentColor` навмисно: смужка бере колір
 * від контейнера, тож у темній темі не треба другого визначення й
 * неможливо розсинхронити два кольори одного модуля.
 */
const ESTIMATE_HATCH =
  "repeating-linear-gradient(-45deg, currentColor 0 3px, transparent 3px 6px)";

/**
 * Мінімальна видима висота стовпчика у відсотках.
 *
 * Без неї година з 20 ккал (чай із молоком) зникає зовсім, і смуга
 * бреше: людина щось їла, а на картинці порожньо. Те саме число й з тієї
 * самої причини стоїть у гребені Фініка.
 */
const MIN_BAR_PCT = 3;

export interface DayStripProps {
  meals: readonly Meal[];
  className?: string;
}

export function DayStrip({ meals, className }: DayStripProps) {
  const strip = useMemo(() => buildDayStrip(meals), [meals]);
  const copy = messages.nutrition.dayStrip;

  // Нижче порога смуга гірша за список: одна риска не показує ні
  // розподілу, ні перекосу — тобто нічого з того, заради чого вид існує.
  if (!strip || strip.peakKcal <= 0) return null;

  const { hours, peakKcal, unplacedCount } = strip;
  const totalKcal = hours.reduce((sum, h) => sum + h.kcal, 0);
  const estimatedKcal = hours.reduce((sum, h) => sum + h.estimatedKcal, 0);
  const estimatedPct = Math.round((estimatedKcal / totalKcal) * 100);

  return (
    <section
      className={cn(
        "rounded-xl border border-nutrition-soft-border bg-nutrition-soft px-4 pt-3 pb-2.5",
        className,
      )}
      aria-label={copy.ariaLabel}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h3 className="text-style-caption font-semibold text-nutrition-soft-fg flex items-center gap-2 before:content-[''] before:w-0.5 before:h-3 before:shrink-0 before:rounded-full before:bg-current">
          {copy.heading}
        </h3>
        <p className="text-style-caption text-nutrition-soft-fg tabular-nums">
          {copy.peakPrefix} {peakKcal} {copy.kcalUnit}
        </p>
      </div>

      {/* AI-CONTEXT: смуга — одна картинка, а не 24 інтерактивні елементи.
          Числа для AT віддає таблиця-двійник у `sr-only` нижче, а сама
          сітка `aria-hidden`: 24 фокусовані стовпчики зробили б обхід із
          клавіатури довшим за читання журналу, заради якого цей вид і
          задумувався як «прочитати за секунду». Той самий підхід, що в
          гребені Фініка. */}
      <div
        aria-hidden
        className="grid grid-cols-[repeat(var(--strip-hours),minmax(0,1fr))] gap-px items-end h-20 text-nutrition"
        style={{ "--strip-hours": HOURS_IN_DAY } as CSSProperties}
      >
        {hours.map((h) => {
          if (h.kcal <= 0) return <div key={h.hour} />;
          const pct = Math.max(MIN_BAR_PCT, (h.kcal / peakKcal) * 100);
          // Частка години, яку вгадали. Штрихується ВЕРХНЯ частина
          // стовпчика, а не весь стовпчик: одна вгадана страва в годині
          // не робить вгаданою всю годину.
          const guessPct = (h.estimatedKcal / h.kcal) * 100;
          return (
            <div
              key={h.hour}
              className="rounded-t-[2px] bg-current overflow-hidden"
              style={{ height: `${pct}%` }}
            >
              {guessPct > 0 && (
                <div
                  className="w-full bg-nutrition-soft"
                  style={{
                    height: `${guessPct}%`,
                    backgroundImage: ESTIMATE_HATCH,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Вісь — три мітки, не 24: смугу читають як форму, а не знімають
          із неї координати. Рівно стільки орієнтації, щоб зрозуміти, у
          якій частині доби пік. */}
      <div
        aria-hidden
        className="flex justify-between mt-1 text-style-caption text-nutrition-soft-fg/70 tabular-nums"
      >
        <span>0</span>
        <span>12</span>
        <span>23</span>
      </div>

      <p className="mt-2 text-style-caption text-nutrition-soft-fg/80">
        {/* Частка здогадок показується ЗАВЖДИ, а не від порога 50%
            (рішення власника 2026-08-06). Поріг
            `ESTIMATED_KCAL_SHARE_THRESHOLD` лишається керувати ТОНОМ
            копії в дашборді; сама ж частка — це факт про день, і
            ховати день, угаданий на 49%, означає видавати здогадку за
            вимір. */}
        {estimatedPct > 0
          ? `${copy.estimatedPrefix} ${estimatedPct}%`
          : copy.allMeasured}
        {unplacedCount > 0 ? ` · ${copy.unplacedPrefix} ${unplacedCount}` : ""}
      </p>

      {/* Таблиця-двійник для скрінрідера: те саме, що показує картинка,
          але числами. `sr-only`, тож у потоці не займає нічого. */}
      <table className="sr-only">
        <caption>{copy.ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{copy.srHour}</th>
            <th scope="col">{copy.srKcal}</th>
            <th scope="col">{copy.srEstimated}</th>
          </tr>
        </thead>
        <tbody>
          {hours
            .filter((h) => h.kcal > 0)
            .map((h) => (
              <tr key={h.hour}>
                <th scope="row">{`${String(h.hour).padStart(2, "0")}:00`}</th>
                <td>{h.kcal}</td>
                <td>{h.estimatedKcal}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
