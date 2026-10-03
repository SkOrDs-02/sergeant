/**
 * Спільні коерсери аргументів read-екзекуторів HubChat (`query*Actions.ts`).
 *
 * Аргументи приходять від LLM tool-call-ів як `unknown` і потребують
 * дефензивної нормалізації. Раніше кожен із чотирьох query-модулів тримав
 * власні байт-ідентичні копії цих хелперів — тепер єдине джерело тут.
 */

/** Ціле 1..365 днів; не-число або ≤0 → fallback. */
export function clampDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(365, Math.floor(n));
}

/** Ціле 1..max; не-число → fallback. */
export function clamp(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export function round(n: number): number {
  return Math.round(n);
}

/** `YYYY-MM-DD` або undefined — без спроб «полагодити» невалідний ввід. */
export function isoOrUndef(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
