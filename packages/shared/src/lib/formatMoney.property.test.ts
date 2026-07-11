import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatMoneyFromKopecks } from "./formatMoney";

/**
 * Property-based tests for the kopecks → hryvnia money formatter.
 *
 * Гроші зберігаються в КОПІЙКАХ як `number` (Hard Rule #1). `formatMoneyFromKopecks`
 * ділить на 100 і округлює float-дрейф. Тут перевіряємо, що жодна копійка не
 * втрачається й не додається на межі округлення, і що форматування зберігає
 * порядок сум. fast-check ганяє тисячі реальних діапазонів копійок, включно з
 * межами `.005`, де наївне `/100` дрейфує.
 */

const NUM_RUNS = Number(process.env["FAST_CHECK_NUM_RUNS"] ?? 2000);

/** Реалістичний діапазон копійок: 0 … 1e12 (до ~10 млрд ₴). */
const arbitraryKopecks = fc.integer({ min: 0, max: 1_000_000_000_000 });

/**
 * Витягнути числове значення гривень із форматованого рядка uk-UA.
 * Групові роздільники — пробіл / NBSP / narrow-NBSP; десятковий — кома.
 */
function parseHryvnia(formatted: string): number {
  const digitsOnly = formatted.replace(/[^\d,.-]/g, ""); // прибрати ₴ та всі пробіли-роздільники
  const normalized = digitsOnly.replace(",", "."); // uk-UA десятковий = кома
  return Number.parseFloat(normalized);
}

describe("formatMoneyFromKopecks – money round-trip properties", () => {
  it("round-trip: розпарсена сума × 100 повертає рівно ті самі копійки", () => {
    fc.assert(
      fc.property(arbitraryKopecks, (kopecks) => {
        const formatted = formatMoneyFromKopecks(kopecks, {
          minFractionDigits: 2,
        });
        const hryvnia = parseHryvnia(formatted);
        expect(Math.round(hryvnia * 100)).toBe(kopecks);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("монотонність: більша сума копійок ніколи не форматується як менша", () => {
    fc.assert(
      fc.property(arbitraryKopecks, arbitraryKopecks, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const loVal = parseHryvnia(
          formatMoneyFromKopecks(lo, { minFractionDigits: 2 }),
        );
        const hiVal = parseHryvnia(
          formatMoneyFromKopecks(hi, { minFractionDigits: 2 }),
        );
        expect(loVal).toBeLessThanOrEqual(hiVal);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
