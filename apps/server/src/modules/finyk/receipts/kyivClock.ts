/**
 * Kyiv wall-clock ↔ UTC helpers для чек-скану.
 *
 * ДПС XML і vision-LLM віддають дату/час покупки як ЛОКАЛЬНИЙ (Kyiv)
 * "стінний" час, не UTC. Домен-інваріант (ADR-0078): `purchased_at` —
 * серверний timestamp реальної події (момент покупки), не device-local
 * день-ключ особистої сутності (habit tick / food log) — тому саме Kyiv,
 * `timezone('Europe/Kyiv', ts)`-режим, а не "довірити клієнту ключ".
 *
 * НІКОЛИ не `new Date().toISOString().slice(0,10)` для day-key — сирий
 * UTC-нарізок хибний в обох ADR-0078 режимах.
 */

import { toKyivISODate } from "@sergeant/shared";

const KYIV_TZ = "Europe/Kyiv";

export interface KyivWallClock {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: KYIV_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function kyivPartsOf(at: Date): KyivWallClock {
  const parts = partsFormatter.formatToParts(at);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Зсув Kyiv-часу від UTC у хвилинах (позитивне — на схід) у момент `at`. */
function kyivOffsetMinutesAt(at: Date): number {
  const p = kyivPartsOf(at);
  const asIfUtcMs = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asIfUtcMs - at.getTime()) / 60_000);
}

function sameWallClock(a: KyivWallClock, b: KyivWallClock): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * Конвертує "стінний" київський час (рік/місяць/день/година/хвилина/секунда
 * — так, як їх дав ДПС XML чи vision-LLM) у справжній UTC-момент.
 *
 * Europe/Kyiv двічі на рік перемикає EET (+2) / EEST (+3) — завжди о
 * 01:00 UTC останньої неділі березня й останньої неділі жовтня (CLDR/
 * tzdata правило ЄС; напр. 2025-03-30 і 2025-10-26, 2026-03-29 і
 * 2026-10-25). Це дає ДВІ підступні "стінні" години на рік (review-фікс):
 *
 *   - GAP (весняний стрибок, напр. 2025-03-30 03:00-03:59) — цей стінний
 *     час НЕ ІСНУЄ (годинник стрибає з 03:00 одразу на 04:00). Політика:
 *     зсунь запит УПЕРЕД на розмір стрибка (1 год) — "03:30" читається як
 *     момент одразу ПІСЛЯ переходу (04:30 EEST), той самий стінний час,
 *     який показав би пристрій, щойно минувши границю.
 *   - OVERLAP (осіннє повернення, напр. 2025-10-26 03:00-03:59) — цей
 *     стінний час існує ДВІЧІ (раз як EEST, раз як EET). Політика:
 *     детерміновано береться ПЕРШЕ/літнє (EEST) входження — раніший з
 *     двох реальних UTC-моментів.
 *
 * Обидва краї звалідовані round-trip (`kyivPartsOf` назад проти
 * запитаних `parts`), не однопрохідним угадуванням: наївна однопрохідна
 * корекція (компроміс, який раніше жив тут) для OVERLAP мовчки ЗАВЖДИ
 * резолвиться в ДРУГЕ (зимове) входження і ніяк не сигналізує, що
 * запитаний час взагалі був неоднозначним.
 *
 * Швидкий шлях (offset 24 год до і 24 год після запиту збігаються —
 * 363-364 дні на рік) уникає зайвої роботи; повний GAP/OVERLAP-розбір
 * рахується лише в ±24-годинному вікні навколо самого переходу.
 */
export function kyivWallClockToUtc(parts: KyivWallClock): Date {
  const guessUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  const beforeOffset = kyivOffsetMinutesAt(new Date(guessUtcMs - ONE_DAY_MS));
  const afterOffset = kyivOffsetMinutesAt(new Date(guessUtcMs + ONE_DAY_MS));

  if (beforeOffset === afterOffset) {
    // Жодного DST-переходу в ±24 год від запиту — однопрохідна корекція
    // завжди коректна (offset у цьому вікні сталий, тож дорівнює й
    // offset-у РІВНО в момент guessUtcMs).
    return new Date(guessUtcMs - beforeOffset * 60_000);
  }

  // У ±24 год від DST-переходу — може бути GAP, OVERLAP, або звичайний
  // день по один бік самого переходу (обидва offset-и "торкаються"
  // вікна, але сам запит поза амбігуітетом). Перевіряємо ОБИДВА
  // кандидати явно, замість здогадуватись з одного offset-семпла.
  const candidateA = guessUtcMs - beforeOffset * 60_000;
  const candidateB = guessUtcMs - afterOffset * 60_000;
  const aMatches = sameWallClock(kyivPartsOf(new Date(candidateA)), parts);
  const bMatches = sameWallClock(kyivPartsOf(new Date(candidateB)), parts);

  if (aMatches && bMatches) {
    // OVERLAP — обидва кандидати відновлюють запитаний стінний час.
    // Політика: перше/літнє (раніший UTC-момент з двох).
    return new Date(Math.min(candidateA, candidateB));
  }
  if (aMatches) return new Date(candidateA);
  if (bMatches) return new Date(candidateB);

  // GAP — жоден кандидат не відновлює запитаний стінний час (він просто
  // не існує того дня). Зсув на розмір стрибка, у бік ПІСЛЯ переходу.
  const shiftMs = Math.abs(afterOffset - beforeOffset) * 60_000;
  return new Date(guessUtcMs + shiftMs - afterOffset * 60_000);
}

/**
 * Kyiv day-key `YYYY-MM-DD` для моменту `at` — фінансовий/серверний
 * day-bucketing (ADR-0078 режим "Kyiv"), напр. `finyk_manual_expenses`
 * blob-у `date` для manual-expense fallback-у matcher-а (`save.ts`).
 */
export function kyivDateString(at: Date): string {
  return toKyivISODate(at);
}
