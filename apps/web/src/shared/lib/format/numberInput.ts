/**
 * Last validated: 2026-08-10
 * Status: Active
 *
 * Парсер вільних числових полів форм (КБЖВ, грами, ваги — усе, що не гроші).
 *
 * Без нього `Number(e.target.value)` пропускає у стор `Infinity`, `NaN` і
 * вставлене 20-значне число. Стелю задає викликач — це доменне знання
 * (жим 1000 кг, план на 10 000 000 ₴), помічник її не вгадає.
 *
 * AI-CONTEXT: **кома — не помилка користувача.** `inputMode="decimal"` на
 * українській (і більшості європейських) розкладок дає саме `,`, тож
 * `Number("1212,1")` → `NaN` і форма відмовляє при коректному вводі.
 * Спіймано бета-тестером 2026-08-10 на «Додати прийом їжі»: `1212,1` у
 * Ккал давало «КБЖВ має бути числами». Тому нормалізація тут — обовʼязкова
 * частина парсингу, а не опція.
 *
 * Межа з `format/amount.ts`: там **гроші** — мінорні одиниці, ціна ≥ 0.01,
 * стеля 10 млн ₴, округлення до копійки. Тут — довільні невідʼємні
 * десяткові, де 0 валідний, а стеля належить викликачу. Обʼєднувати їх не
 * можна, але список роздільників мусить збігатися — це закріплено
 * parity-тестом у `numberInput.test.ts`.
 */

/**
 * Усе, чим UA-клавіатура або вставка з іншого застосунку може розділити
 * групи цифр: звичайний пробіл, nbsp, вузький nbsp, тонкий пробіл, апостроф.
 * Дзеркалить `GROUP_SEPARATORS` з `format/amount.ts` (parity-тест).
 */
const GROUP_SEPARATORS = /[\s\u00a0\u202f\u2009']/g;

/**
 * Канонічний десятковий рядок: без роздільників груп, `,` → `.`, обрізаний.
 * Не валідує — парою до `parseDecimalInput`.
 */
export function normalizeDecimalInput(raw: string): string {
  return raw.replace(GROUP_SEPARATORS, "").replace(",", ".").trim();
}

export type DecimalParseError = "not-a-number" | "negative";

export type DecimalParseResult =
  { ok: true; value: number } | { ok: false; error: DecimalParseError };

/**
 * Парсить невідʼємне десяткове число з поля форми.
 *
 * Порожній рядок — НЕ помилка тут: «не вказано» і «вказано погано» це різні
 * стани, і тільки викликач знає, чи поле обовʼязкове. Перевіряй `raw === ""`
 * до виклику.
 *
 * Відхиляє: `NaN`, `±Infinity`, експоненційний запис (`1e9` — читається як
 * одруківка й тихо протягує мільярд повз перевірку стелі на сирому рядку),
 * будь-що не схоже на десяткове (`0x10`, `1.`, `--5`), та відʼємні значення.
 */
export function parseDecimalInput(raw: string): DecimalParseResult {
  const normalized = normalizeDecimalInput(raw);
  if (normalized === "") return { ok: false, error: "not-a-number" };
  if (/[eE]/.test(normalized)) return { ok: false, error: "not-a-number" };
  // Сувора форма: `Number()` сам по собі прийняв би "0x10", " " і "1.".
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    return { ok: false, error: "not-a-number" };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: "not-a-number" };
  if (value < 0) return { ok: false, error: "negative" };
  return { ok: true, value };
}

/**
 * Затиск для полів, що пишуть просто у сторедж і не показують помилку:
 * невалідний ввід стає `0`, надмірний — `max`.
 *
 * ⚠️ **Споживачів у коді немає** (станом на 2026-08-10) і **кому він НЕ
 * розуміє** — `Number("82,5")` тут дасть `0`. Свідомо лишений як є: його
 * контракт «експонента = завелике число, тож `max`» закріплений тестом, а
 * `parseDecimalInput` експоненту відхиляє. Змішувати дві семантики заради
 * мертвого коду — гірше, ніж лишити межу явною.
 *
 * Для будь-якого НОВОГО поля бери `parseDecimalInput`. Тихе `0` замість
 * «1212,1» — це підміна даних без сліду, а вона гірша за відмову; саме на
 * цьому впіймався `pickedGrams` у `AddMealSheet` (див. `gramsOrDefault`).
 * Якщо колись зʼявиться реальний споживач — переводь його на
 * `parseDecimalInput` і видаляй цю функцію разом із тестом.
 */
export function clampNumericInput(raw: string, max: number): number {
  if (raw === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > max ? max : value;
}
