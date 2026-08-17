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

/**
 * Конвертує "стінний" київський час (рік/місяць/день/година/хвилина/секунда
 * — так, як їх дав ДПС XML чи vision-LLM) у справжній UTC-момент.
 *
 * Однопрохідна корекція офсету (зсув рахується на "вгаданому" UTC-моменті,
 * а не на вже скоригованому) — прийнятне спрощення: похибка можлива лише у
 * годинному вікні самого DST-переходу (двічі на рік), некритично для
 * timestamp-у покупки. Той самий компроміс роблять популярні tz-конвертери
 * без важкої tz-бібліотеки.
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
  const offsetMin = kyivOffsetMinutesAt(new Date(guessUtcMs));
  return new Date(guessUtcMs - offsetMin * 60_000);
}

/**
 * Kyiv day-key `YYYY-MM-DD` для моменту `at` — фінансовий/серверний
 * day-bucketing (ADR-0078 режим "Kyiv"), напр. `finyk_manual_expenses`
 * blob-у `date` для manual-expense fallback-у matcher-а (`save.ts`).
 */
export function kyivDateString(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KYIV_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
