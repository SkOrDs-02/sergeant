/**
 * Офіційний курс НБУ для операцій валютних карток Monobank.
 *
 * Спека `docs/work/specs/finyk-fx-nbu.md`. Кеш у `nbu_fx_rate` (міграція
 * 177) спільний для всіх: курс публічний. Рядок на дату пишеться раз і не
 * перезаписується, тож минуле лишається замороженим (ADR-0079).
 *
 * Збій НБУ (мережа, таймаут, невалідна відповідь) - це «курсу поки немає»,
 * а не виняток для всього запиту: виклик повертає мапу без цієї пари, і
 * наступна спроба буде на наступному читанні.
 */
import { toKyivISODate } from "@sergeant/shared";
import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";

const NBU_EXCHANGE_URL =
  "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange";

export const NBU_FETCH_TIMEOUT_MS = 3_000;
/** На скільки днів назад шукати курс, якщо на дату його немає. */
export const NBU_FALLBACK_DAYS = 7;
/** Стеля запитів до НБУ за один виклик: решта добереться наступним. */
export const NBU_MAX_FETCHES_PER_CALL = 14;

export interface NbuRate {
  /** Гривень за одиницю валюти. */
  readonly uahPerUnit: number;
  /** Дата (YYYY-MM-DD), на яку НБУ реально віддав курс. */
  readonly sourceDate: string;
}

export interface NbuRatePair {
  readonly currencyCode: number;
  /** Київська дата операції, YYYY-MM-DD. */
  readonly date: string;
}

export type FetchLike = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function nbuRateKey(currencyCode: number, date: string): string {
  return `${currencyCode}:${date}`;
}

function shiftDate(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

interface CachedRow {
  currency_code: number;
  rate_date: string;
  uah_per_unit: number | string;
  source_date: string;
}

async function readCachedRates(
  pairs: readonly NbuRatePair[],
): Promise<Map<string, NbuRate>> {
  const out = new Map<string, NbuRate>();
  if (pairs.length === 0) return out;
  const { rows } = await query<CachedRow>(
    `SELECT r.currency_code, r.rate_date::text AS rate_date,
            r.uah_per_unit, r.source_date::text AS source_date
       FROM nbu_fx_rate r
       JOIN unnest($1::smallint[], $2::date[]) AS p(code, d)
         ON r.currency_code = p.code AND r.rate_date = p.d`,
    [pairs.map((p) => p.currencyCode), pairs.map((p) => p.date)],
    { op: "nbu_fx_rate_read" },
  );
  for (const row of rows) {
    out.set(nbuRateKey(Number(row.currency_code), row.rate_date), {
      uahPerUnit: Number(row.uah_per_unit),
      sourceDate: row.source_date,
    });
  }
  return out;
}

/**
 * Усі курси НБУ на день: ISO-4217 числовий код -> гривень за одиницю.
 * `null` - збій (мережа, таймаут, не-200, невалідна форма); порожня мапа -
 * НБУ відповів, але курсів на цю дату немає.
 */
async function fetchNbuDay(
  date: string,
  fetchImpl: FetchLike,
): Promise<Map<number, number> | null> {
  const url = `${NBU_EXCHANGE_URL}?date=${date.replaceAll("-", "")}&json`;
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(NBU_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error("nbu_http_error");
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error("nbu_invalid_body");
    const out = new Map<number, number>();
    for (const item of body) {
      const code = Number((item as { r030?: unknown }).r030);
      const rate = Number((item as { rate?: unknown }).rate);
      // Зіпсований запис = збій дня, а не «валюти немає»: інакше фолбек
      // на попередній день заморозив би під цією датою не той курс.
      if (!Number.isInteger(code) || !Number.isFinite(rate) || rate <= 0) {
        throw new Error("nbu_invalid_entry");
      }
      out.set(code, rate);
    }
    return out;
  } catch (err) {
    logger.warn({
      msg: "nbu_fx_fetch_failed",
      date,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

/**
 * Курси НБУ для пар (валюта, київська дата): з кешу, а відсутні - з НБУ.
 *
 * Якщо на минулу дату курсу немає, береться найближча попередня (до
 * {@link NBU_FALLBACK_DAYS} днів) і зберігається фактична `sourceDate`. На
 * сьогодні й майбутнє фолбеку немає: НБУ встановлює курс на день заздалегідь,
 * а заморозити вчорашній курс під сьогоднішньою датою означало б записати
 * назавжди не той курс.
 */
export async function getNbuRates(
  pairs: readonly NbuRatePair[],
  options: { fetchImpl?: FetchLike; today?: string } = {},
): Promise<Map<string, NbuRate>> {
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((url, init) => fetch(url, init));
  const today = options.today ?? toKyivISODate(Date.now());
  const unique = new Map<string, NbuRatePair>();
  for (const pair of pairs) {
    unique.set(nbuRateKey(pair.currencyCode, pair.date), pair);
  }
  const rates = await readCachedRates([...unique.values()]);
  const missing = [...unique.values()].filter(
    (p) => !rates.has(nbuRateKey(p.currencyCode, p.date)),
  );
  if (missing.length === 0) return rates;

  const days = new Map<string, Map<number, number> | null>();
  let fetches = 0;
  // Після першого збою НБУ за цей виклик більше туди не ходимо: інакше
  // недоступний НБУ коштував би читанню до 14 таймаутів поспіль.
  let nbuDown = false;
  const loadDay = async (
    date: string,
  ): Promise<Map<number, number> | null | "budget"> => {
    if (days.has(date)) return days.get(date) ?? null;
    if (nbuDown || fetches >= NBU_MAX_FETCHES_PER_CALL) return "budget";
    fetches += 1;
    const day = await fetchNbuDay(date, fetchImpl);
    days.set(date, day);
    if (day === null) nbuDown = true;
    return day;
  };

  const found: Array<NbuRatePair & NbuRate> = [];
  for (const pair of missing) {
    const maxBack = pair.date < today ? NBU_FALLBACK_DAYS : 0;
    for (let back = 0; back <= maxBack; back++) {
      const sourceDate = shiftDate(pair.date, -back);
      const day = await loadDay(sourceDate);
      // Збій або вичерпана стеля: не відкочуємось на старіший день, бо
      // взяли б не той курс; спробуємо на наступному читанні.
      if (day === null || day === "budget") break;
      const uahPerUnit = day.get(pair.currencyCode);
      if (uahPerUnit !== undefined) {
        found.push({ ...pair, uahPerUnit, sourceDate });
        rates.set(nbuRateKey(pair.currencyCode, pair.date), {
          uahPerUnit,
          sourceDate,
        });
        break;
      }
    }
  }

  if (found.length > 0) {
    await query(
      `INSERT INTO nbu_fx_rate (currency_code, rate_date, uah_per_unit, source_date)
       SELECT * FROM unnest($1::smallint[], $2::date[], $3::numeric[], $4::date[])
       ON CONFLICT (currency_code, rate_date) DO NOTHING`,
      [
        found.map((f) => f.currencyCode),
        found.map((f) => f.date),
        found.map((f) => f.uahPerUnit),
        found.map((f) => f.sourceDate),
      ],
      { op: "nbu_fx_rate_write" },
    );
  }
  return rates;
}
