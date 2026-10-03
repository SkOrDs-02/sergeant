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
 * AI-CONTEXT: **кома тут обовʼязкова, як і в `parseDecimalInput`.** До
 * 2026-08-16 у цьому докстрінгу стояло «споживачів у коді немає, тож кому
 * свідомо не підтримуємо». Твердження було хибним у момент написання —
 * `git grep` по тому самому коміту (`6c13c4a`) показує пʼять бойових
 * викликів: вага в `WorkoutSetRow`, грами в `FoodPickerSection` (та сама
 * шторка «Додати прийом їжі», де тестер і зловив баг з комою), план у
 * `MonthlyPlanCard`, сума розбиття в `TxRowSplitEditor`, дистанція й
 * тривалість у `WorkoutItemCard`. Тобто «82,5» ставало `0` мовчки — рівно
 * та підміна даних без сліду, яку той коміт і лагодив в іншому місці.
 *
 * Різниця з `parseDecimalInput` лишається і вона навмисна: там помилка —
 * окремий стан для викликача, який покаже її користувачу; тут помилки
 * показати нікому, тож сміття стає `0`, а завелике — `max`. Через це
 * експонента тут читається як «завелике число» (`1e9` → `max`), тоді як
 * `parseDecimalInput` її відхиляє. Обидві семантики закріплені тестами.
 *
 * Клемп на кожному натисканні ЗʼЇДАЄ незавершений десятковий ввід («82,»
 * округлюється до `82`, і кома зникає прямо під пальцями). Тому в
 * контрольованому полі не клич цю функцію напряму з `onChange` —
 * використовуй `useDecimalDraft`, який тримає сирий текст і клемпить
 * значення поруч із ним.
 */
export function clampNumericInput(raw: string, max: number): number {
  const normalized = normalizeDecimalInput(raw);
  if (normalized === "") return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > max ? max : value;
}
