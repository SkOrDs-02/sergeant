import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  kyivCalendarDaysBetween,
  kyivDayEndMs,
  kyivDayStartMs,
  kyivMondayStartMs,
  toLocalISODate,
} from "./date";

/**
 * Property-based tests for the Kyiv day-boundary helpers.
 *
 * Домен-інваріант (AGENTS.md § Domain invariants): усі межі доби рахуються в
 * Europe/Kyiv, ніколи не в UTC. Kyiv — UTC+2 (зима) / UTC+3 (літо), перехід о
 * 03:00 в останні неділі березня та жовтня. fast-check генерує тисячі
 * timestamp'ів і природно натрапляє на ці 23/25-годинні доби, які
 * приклад-тести майже не покривають. Кожен блок = один `fc.property`.
 */

const NUM_RUNS = Number(process.env["FAST_CHECK_NUM_RUNS"] ?? 1000);
// Intl.DateTimeFormat.format у кожній ітерації робить property-блоки важкими;
// піднімаємо ліміт над дефолтними 5 с, щоб 1000 прогонів встигли.
const FC_TIMEOUT_MS = 30_000;

/** Довільний timestamp у розумному діапазоні дат [2000, 2035]. */
const arbitraryDate = fc.date({
  min: new Date(Date.UTC(2000, 0, 1)),
  max: new Date(Date.UTC(2035, 11, 31)),
  noInvalidDate: true,
});

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Наступний календарний день для `YYYY-MM-DD`, обчислений незалежно від
 * коду під тестом (через UTC, опівдні → без DST-неоднозначності).
 */
function nextCalendarDayKey(dayKey: string): string {
  const parts = dayKey.split("-").map(Number);
  const [y, m, d] = [parts[0] ?? 1970, parts[1] ?? 1, parts[2] ?? 1];
  const noonNextDay = Date.UTC(y, m - 1, d) + 36 * 60 * 60 * 1000;
  const nd = new Date(noonNextDay);
  return `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth() + 1)}-${pad(nd.getUTCDate())}`;
}

describe("shared/utils/date – Kyiv boundary properties", () => {
  it(
    "kyivDayStartMs ↔ toLocalISODate round-trip",
    () => {
      fc.assert(
        fc.property(arbitraryDate, (date) => {
          const key = toLocalISODate(date);
          expect(key).toMatch(DAY_KEY_RE);
          // Початок доби, переформатований назад у Kyiv-ключ, дає той самий день.
          expect(toLocalISODate(kyivDayStartMs(key))).toBe(key);
        }),
        { numRuns: NUM_RUNS },
      );
    },
    FC_TIMEOUT_MS,
  );

  it(
    "kyivDayEndMs належить тому ж дню, йде після старту, і суміжний з наступним днем",
    () => {
      fc.assert(
        fc.property(arbitraryDate, (date) => {
          const key = toLocalISODate(date);
          const start = kyivDayStartMs(key);
          const end = kyivDayEndMs(key);
          // Кінець доби — той самий Kyiv-день…
          expect(toLocalISODate(end)).toBe(key);
          // …завжди строго після старту (навіть у 23-годинну DST-добу)…
          expect(end).toBeGreaterThan(start);
          // …і рівно на 1 мс передує старту наступного календарного дня.
          expect(end + 1).toBe(kyivDayStartMs(nextCalendarDayKey(key)));
        }),
        { numRuns: NUM_RUNS },
      );
    },
    FC_TIMEOUT_MS,
  );

  it(
    "kyivMondayStartMs завжди дає понеділок, ідемпотентний і не в майбутньому",
    () => {
      const mondayFmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Kyiv",
        weekday: "short",
      });
      fc.assert(
        fc.property(arbitraryDate, (date) => {
          const monday = kyivMondayStartMs(date);
          // Результат — це понеділок у Kyiv.
          expect(mondayFmt.format(monday)).toBe("Mon");
          // Ідемпотентність: старт тижня від старту тижня — той самий момент.
          expect(kyivMondayStartMs(monday)).toBe(monday);
          // Понеділок ніколи не пізніше за сам день.
          expect(monday).toBeLessThanOrEqual(
            kyivDayStartMs(toLocalISODate(date)),
          );
        }),
        { numRuns: NUM_RUNS },
      );
    },
    FC_TIMEOUT_MS,
  );

  it(
    "kyivCalendarDaysBetween антисиметричний і рахує рівно 1 добу через межу дня",
    () => {
      fc.assert(
        fc.property(arbitraryDate, arbitraryDate, (a, b) => {
          const aMs = a.getTime();
          const bMs = b.getTime();
          // Антисиметрія: between(a,b) === -between(b,a). Порівнюємо через ===,
          // а не .toBe, бо для рівних дат маємо +0 проти -0 (Object.is їх
          // розрізняє, хоча числово це той самий нуль).
          expect(
            kyivCalendarDaysBetween(aMs, bMs) ===
              -kyivCalendarDaysBetween(bMs, aMs),
          ).toBe(true);
          // Старт наступного календарного дня рівно на 1 Kyiv-добу далі.
          const key = toLocalISODate(aMs);
          const nextStart = kyivDayStartMs(nextCalendarDayKey(key));
          expect(kyivCalendarDaysBetween(nextStart, kyivDayStartMs(key))).toBe(
            1,
          );
        }),
        { numRuns: NUM_RUNS },
      );
    },
    FC_TIMEOUT_MS,
  );
});
