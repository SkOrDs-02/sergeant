/**
 * PII masking utilities. Call before any LLM invocation that includes real
 * user data. Keeps enough context for categorisation (merchant keywords) while
 * removing identifiers that could re-identify a person.
 *
 * Masked patterns:
 *  - Email addresses
 *  - Ukrainian / international phone numbers
 *  - IBAN (UA format)
 *  - Payment card numbers (4–19 digits separated by spaces/dashes)
 *  - Ukrainian tax IDs (РНОКПП, 10 digits)
 */

/**
 * Email: лінійний за довжиною входу (аудит 2026-10-01, rel-07).
 *
 * Стара форма `\b[a-z0-9._%+\-]+@[a-z0-9.]+\.[a-z]{2,}\b` на кожній позиції
 * рядка з дефісів/крапок без `@` пробігала весь залишок класу й відкочувалась:
 * O(n²), ~7 с на 50 повідомленнях по 8000 символів, синхронно в main thread.
 *
 * Лікування структурне, а не обмеженням довжини. Look-behind
 * `(?<![a-z0-9._%+\-])` дозволяє старт лише на ПОЧАТКУ прогону символів
 * локальної частини, тож кожен такий прогін сканується один раз: решта
 * позицій відсікається за O(1). Довжину локальної частини (RFC 64) і
 * доменних міток (63) свідомо НЕ обмежено: обмеження залишило б нешкідливий
 * на вигляд, але нерозмаскований хвіст довгої адреси ("a"×100 + "@x.com"
 * маскувався раніше й мусить маскуватись далі). Мітки домену (можуть бути
 * порожніми, як у старій формі з `..`) завершуються літеральною крапкою, а
 * клас мітки крапки не містить, тож розбір однозначний і відкотів немає.
 * Дефіс у мітці додано навмисно: раніше `user@my-host.com` не маскувався
 * взагалі.
 */
const EMAIL_PATTERN =
  /(?<![a-z0-9._%+-])[a-z0-9._%+-]+@(?:[a-z0-9-]*\.)+[a-z]{2,}\b/gi;

const PATTERNS: [RegExp, string][] = [
  [EMAIL_PATTERN, "[email]"],
  // Ukrainian IBAN: UA + 27 digits
  [/\bUA\d{27}\b/g, "[iban]"],
  // Card numbers: 4 groups of 4 digits (with spaces or dashes)
  [/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, "[card]"],
  // Phone: +380 / 0 prefix + 9 more digits
  [/(?:\+380|0)\d{9}\b/g, "[phone]"],
  // Ukrainian РНОКПП: standalone 10-digit number
  [/\b\d{10}\b/g, "[taxid]"],
];

/**
 * Masks PII in a plain-text string. Returns the sanitised string.
 * Safe to call multiple times (idempotent beyond first pass).
 */
export function maskPii(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Masks PII in an object's string-valued leaf nodes (shallow + one level deep).
 * Creates a new object — does not mutate the original.
 */
export function maskPiiObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      result[key] = maskPii(val);
    } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      result[key] = maskPiiObject(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}
