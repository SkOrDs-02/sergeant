/**
 * `/ai_cost [<days>]` argument parser. Pure-fn so unit-tests не залежать
 * від grammy-context-у.
 *
 * Grammar:
 *   `/ai_cost`         → no args, no trend block (legacy).
 *   `/ai_cost 7`       → trendDays=7.
 *   `/ai_cost 30`      → trendDays=30.
 *   `/ai_cost 0`       → "invalid" (мін. 1).
 *   `/ai_cost 31`      → "invalid" (max — MAX_TREND_DAYS).
 *   `/ai_cost abc`     → "invalid".
 *   `/ai_cost 7 foo`   → "invalid" (extra tokens).
 */

/** Mirror server-side `MAX_TREND_DAYS` — окрема константа щоб `tools/openclaw`
 *  не залежав від `apps/server`. CI-snapshot тест зловить drift. */
export const MAX_TREND_DAYS = 30;

export type AiCostArgParse =
  | { ok: true; trendDays?: number }
  | { ok: false; error: string };

/**
 * Парсить argument-частину після `/ai_cost` (тобто `c.match`). Очікує
 * або порожній рядок (legacy), або один цифровий токен 1..MAX_TREND_DAYS.
 */
export function parseAiCostArgument(rawArgument: string): AiCostArgParse {
  const trimmed = (rawArgument ?? "").trim();
  if (trimmed === "") return { ok: true };
  const tokens = trimmed.split(/\s+/);
  if (tokens.length !== 1) {
    return {
      ok: false,
      error: `Очікую один аргумент: /ai_cost [1..${MAX_TREND_DAYS}].`,
    };
  }
  const token = tokens[0]!;
  if (!/^\d+$/.test(token)) {
    return {
      ok: false,
      error: `Аргумент має бути цілим числом 1..${MAX_TREND_DAYS}. Отримав: «${token}».`,
    };
  }
  const days = Number(token);
  if (!Number.isFinite(days) || days < 1 || days > MAX_TREND_DAYS) {
    return {
      ok: false,
      error: `Аргумент має бути 1..${MAX_TREND_DAYS}. Отримав: ${days}.`,
    };
  }
  return { ok: true, trendDays: days };
}
