/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Гребінь місяця — signature-view Фініка (анти-слоп P4, § П1
 * `docs/05-design/design/anti-slop-strategy.md`; рішення власника
 * 2026-08-06 на `mockups/product/finyk-signature-view.html`).
 *
 * Стоїть НАД списком підписок, не замість нього: редагувати платіж,
 * змінити день чи видалити — це все ще рядок. Інакше ми поміняли б одну
 * втрату інформації на іншу.
 *
 * Показує обидва боки: висота стовпчика — сума списань дня, зелена
 * мітка біля основи — день регулярного надходження. Дохід НЕ ділить
 * шкалу з відтоком; чому саме — в AI-DANGER біля пропа `incomeDays`.
 *
 * Дохід став можливим у етапі 2: `recurringDetect` навчився шукати
 * додатні повтори через опцію `flow: "income"`. До того фільтр
 * `tx.amount >= 0` стояв просто в циклі групування, тож рушій відкидав
 * надходження за побудовою.
 */
import { memo, useMemo, type CSSProperties } from "react";
import { pluralDays } from "@sergeant/shared";

import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";

import {
  buildMonthComb,
  MIN_ENTRIES,
  type CombEntry,
} from "../lib/monthOutflowComb";

export interface MonthOutflowCombProps {
  entries: readonly CombEntry[];
  /** Днів у місяці, що показується. */
  daysInMonth: number;
  /** Сьогоднішній день місяця (1-based) або `null`, якщо місяць не поточний. */
  today?: number | null;
  /**
   * Дні, коли приходять регулярні надходження (зарплата, оренда).
   *
   * AI-DANGER: дохід позначається МІТКОЮ біля основи, а не стовпчиком у
   * спільній шкалі — і це не стилістика. Зарплата зазвичай на порядок
   * більша за будь-яке окреме списання, тож у спільній шкалі вона стала
   * б стелею, а весь відтік — смужкою в кілька пікселів біля нуля.
   * Гребінь тоді перестав би показувати те, заради чого існує. Питання,
   * на яке він відповідає, — «коли гроші приходять ВІДНОСНО того, коли
   * йдуть», а це питання про дні, не про висоту. Точну суму доходу видно
   * на Огляді. Не «покращуй» це, зробивши мітку пропорційною.
   */
  incomeDays?: readonly number[];
  /**
   * Коли баланс схований, гребеня немає зовсім. Висота стовпчика кодує
   * суму, тож показати «форму без чисел» не вийде — вона й є число.
   */
  showBalance?: boolean;
  className?: string;
}

const copy = messages.finyk.outflowComb;

/**
 * Підстановка `{ключ}` у шаблон із каталогу — та сама конвенція, що
 * `fillName` у Рутині. Локальна, бо шаблони цього виду більше ніде не
 * використовуються.
 */
function fillVars(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/** Спільні змінні для обох рядків про провал. */
function gapVars(gap: { from: number; to: number; length: number }) {
  return {
    n: gap.length,
    unit: pluralDays(gap.length),
    from: gap.from,
    to: gap.to,
  };
}

/** Мінімальна помітна висота, щоб дрібний платіж не зникав у нуль. */
const MIN_BAR_PCT = 4;

const MonthOutflowCombImpl = function MonthOutflowComb({
  entries,
  daysInMonth,
  today = null,
  incomeDays = [],
  showBalance = true,
  className,
}: MonthOutflowCombProps) {
  const comb = useMemo(
    () => buildMonthComb(entries, daysInMonth),
    [entries, daysInMonth],
  );

  // Нижче порога гребінь гірший за список: кілька рисок і багато повітря
  // не показують ні кластера, ні провалу — тобто нічого з того, заради
  // чого вид існує.
  if (!showBalance || comb.counted < MIN_ENTRIES || comb.max <= 0) return null;

  const { days, max, gap } = comb;
  const incoming = new Set(incomeDays);

  return (
    <section
      className={cn(
        "rounded-xl border border-finyk-soft-border bg-finyk-soft px-4 pt-3 pb-2.5",
        className,
      )}
      aria-label={copy.ariaLabel}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h3 className="text-style-caption font-semibold text-finyk-soft-fg flex items-center gap-2 before:content-[''] before:w-0.5 before:h-3 before:shrink-0 before:rounded-full before:bg-current">
          {copy.heading}
        </h3>
        <p className="text-style-caption text-finyk-soft-fg tabular-nums">
          {copy.peakPrefix} <Money amount={max} tone="inherit" />
        </p>
      </div>

      {/* AI-CONTEXT: гребінь — одна картинка, а не 31 інтерактивний
          елемент. Числа для AT віддає таблиця-двійник у `sr-only` нижче,
          а сама сітка `aria-hidden`: 31 фокусований стовпчик зробив би
          обхід із клавіатури довшим за читання списку, заради якого цей
          вид і задумувався як «прочитати за секунду». */}
      <div
        aria-hidden
        className="grid grid-cols-[repeat(var(--comb-days),minmax(0,1fr))] gap-[2px] items-end h-24"
        style={{ "--comb-days": days.length } as CSSProperties}
      >
        {days.map((d) => {
          const pct =
            d.total > 0 ? Math.max(MIN_BAR_PCT, (d.total / max) * 100) : 0;
          const isToday = today != null && d.day === today;
          const isIncome = incoming.has(d.day);
          return (
            <div
              key={d.day}
              className={cn(
                "relative h-full flex flex-col justify-end",
                isToday &&
                  "before:absolute before:inset-y-0 before:-left-px before:w-px before:bg-finyk-soft-fg/45",
              )}
            >
              {pct > 0 && (
                <div
                  className="rounded-t-[2px] bg-finyk min-h-[2px]"
                  style={{ height: `${pct}%` }}
                />
              )}
              {isIncome && (
                <div className="mt-px h-[3px] rounded-full bg-success-strong dark:bg-success" />
              )}
            </div>
          );
        })}
      </div>

      {/* AI-CONTEXT: вісь — три мітки, а не 31. Підписати кожен пʼятий
          день можна лише кеглем ~9px: на мобільній ширині стовпчик
          завширшки ~10px, і 12px-цифра туди не влазить. Пробивати
          12px-підлогу заради координатної сітки не варто — гребінь
          читають як форму, а не знімають із нього значення. Крайні
          мітки й «сьогодні» дають рівно стільки орієнтації, скільки
          потрібно, щоб зрозуміти, у якій частині місяця пік. */}
      <div
        aria-hidden
        className="flex justify-between mt-1 text-style-caption text-finyk-soft-fg/70 tabular-nums"
      >
        <span>1</span>
        <span>{Math.round(days.length / 2)}</span>
        <span>{days.length}</span>
      </div>

      {gap && (
        <p className="mt-2 text-style-caption text-finyk-soft-fg">
          {fillVars(copy.gapLine, gapVars(gap))}
        </p>
      )}

      {/* Двійник для скрінрідера: гребінь несе ті самі факти, що й
          список під ним, тож дублювати їх рядок за рядком не треба —
          достатньо того, чого в списку немає: коли пік і де провал. */}
      <p className="sr-only">
        {peakDayLabel(days, max)}.
        {gap ? ` ${fillVars(copy.gapSpoken, gapVars(gap))}` : ""}
        {incomeDays.length > 0
          ? ` ${fillVars(copy.incomeSpoken, {
              days: [...incomeDays].sort((a, b) => a - b).join(", "),
            })}`
          : ""}
      </p>
    </section>
  );
};

function peakDayLabel(
  days: readonly { day: number; total: number; names: string[] }[],
  max: number,
): string {
  const peak = days.find((d) => d.total === max);
  if (!peak) return "";
  const names = peak.names.join(", ");
  return names
    ? fillVars(copy.peakDayNamed, { day: peak.day, names })
    : fillVars(copy.peakDay, { day: peak.day });
}

export const MonthOutflowComb = memo(MonthOutflowCombImpl);
