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
 * Лікування структурне, а не обмеженням довжини: адреса може починатись лише
 * на ПОЧАТКУ прогону символів локальної частини, тож кожен такий прогін
 * сканується один раз, а решта позицій відсікається за O(1). Довжину
 * локальної частини (RFC 64) і доменних міток (63) свідомо НЕ обмежено:
 * обмеження залишило б нешкідливий на вигляд, але нерозмаскований хвіст
 * довгої адреси ("a"×100 + "@x.com" маскувався раніше й мусить маскуватись
 * далі). Мітки домену (можуть бути порожніми, як у старій формі з `..`)
 * завершуються літеральною крапкою, а клас мітки крапки не містить, тож
 * розбір однозначний і відкотів немає. Дефіс у мітці додано навмисно:
 * раніше `user@my-host.com` не маскувався взагалі.
 *
 * Чому цикл із sticky-регексом, а не один `replace` із look-behind: look-behind
 * читає ОРИГІНАЛЬНИЙ рядок, а не межу попереднього збігу. TLD закінчується на
 * `\b`, тож наступним символом може бути `.`, `-`, `+` чи `%`, які самі
 * належать до класу локальної частини. Тоді друга адреса в ланцюжку
 * ("a@x.com.b@y.org", "ivan@gmail.com-olya@gmail.com") не мала дозволеного
 * старту й УХОДИЛА до LLM у відкритому вигляді: регрес приватності проти
 * старої форми. Тому старт дозволено і на початку прогону, і рівно там, де
 * закінчився попередній збіг.
 */
const EMAIL_AT_POSITION = /[a-z0-9._%+-]+@(?:[a-z0-9-]*\.)+[a-z]{2,}\b/iy;
const EMAIL_LOCAL_CHAR = /[a-z0-9._%+-]/i;

function maskEmails(text: string): string {
  if (text.indexOf("@") === -1) return text;
  let out = "";
  let copiedUpTo = 0;
  let lastMatchEnd = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (!EMAIL_LOCAL_CHAR.test(ch)) continue;
    const atRunStart =
      i === 0 ||
      i === lastMatchEnd ||
      !EMAIL_LOCAL_CHAR.test(text.charAt(i - 1));
    if (!atRunStart) continue;
    EMAIL_AT_POSITION.lastIndex = i;
    const match = EMAIL_AT_POSITION.exec(text);
    if (match === null) continue;
    out += text.slice(copiedUpTo, i) + "[email]";
    copiedUpTo = i + match[0].length;
    lastMatchEnd = copiedUpTo;
    i = copiedUpTo - 1;
  }
  return copiedUpTo === 0 ? text : out + text.slice(copiedUpTo);
}

const PATTERNS: [RegExp, string][] = [
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
  let out = maskEmails(text);
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
