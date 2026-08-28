/**
 * Зіставлення назв із чека рітейлера з позиціями комори.
 *
 * AI-CONTEXT: спека `silpo-mcp-integration.md` § Ризики називає цей мапінг
 * нечітким («Молоко Яготинське 2.6% 900г») і лишає AI-мапер на потім. Це
 * детермінована частина, яка має піти першою — вона дешева, пояснювана і
 * закриває типовий випадок, а LLM лишається прискорювачем для решти.
 *
 * Чому наявного `canonicalFoodKey` не досить: для БАГАТОСЛІВНОЇ назви він
 * повертає просто нижній регістр (аліаси й стемінг працюють лише на одному
 * слові). Тобто «Молоко Яготинське 2.6% 900г» ≠ «Молоко», і кожна покупка
 * молока створювала в коморі НОВУ позицію замість доливання наявної.
 *
 * Status: Active
 */
import { canonicalFoodKey, matchFoodName } from "./pantryTextParser.js";

/**
 * Токени, що описують УПАКОВКУ, а не продукт: «900г», «0,5л», «2.6%»,
 * «1кг», «10шт». Саме вони роблять назву з чека унікальною і ламають
 * зіставлення.
 */
const PACK_TOKEN_RE = /^\d+(?:[.,]\d+)?\s*(?:г|гр|кг|мл|л|шт|уп|пач|пак|%)?$/iu;

/**
 * Службові скорочення маркування. `тм` — торгова марка; `ваг`/`ваговий` —
 * спосіб продажу; `т\/п`, `п\/е`, `в\/у` — тип пакування. Жодне з них не
 * звужує, ЩО це за їжа.
 */
const NOISE_TOKENS = new Set([
  "тм",
  "ваг",
  "ваговий",
  "вагова",
  "вагове",
  "т/п",
  "п/е",
  "в/у",
  "с/м",
  "охол",
  "заморож",
]);

/**
 * Чистить назву позиції чека від пакувального шуму, лишаючи змістовне ядро.
 * Регістр і порядок слів зберігає — результат може йти і в показ, і далі в
 * `canonicalFoodKey`.
 *
 * Порожній результат (назва складалась лише з шуму) повертає вихідну
 * назву: краще зіставляти по шумній назві, ніж по порожньому рядку.
 */
export function normalizeReceiptItemName(raw: unknown): string {
  const source = String(raw || "").trim();
  if (!source) return "";

  const kept = source
    .split(/\s+/)
    .filter((token) => {
      const bare = token.replace(/[.,;]+$/u, "");
      if (!bare) return false;
      if (PACK_TOKEN_RE.test(bare)) return false;
      return !NOISE_TOKENS.has(bare.toLowerCase());
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return kept || source;
}

/**
 * Позиція комори, підготовлена до зіставлення: ключ і токени пораховані
 * ОДИН раз на всю комору, а не заново для кожного рядка чека.
 */
export interface PantryMatchCandidate<T> {
  item: T;
  key: string;
  tokens: readonly string[];
}

/**
 * Готує комору до зіставлення. Виносити це з циклу обовʼязково: чек має до
 * 200 рядків, комора — десятки позицій, і без індексу нормалізація тих
 * самих назв комори повторювалась би на кожній парі (десятки тисяч
 * regex-спліт + `Set` на один рендер).
 */
export function buildPantryIndex<T extends { name: string }>(
  pantryItems: readonly T[],
): PantryMatchCandidate<T>[] {
  return pantryItems.map((item) => ({
    item,
    key: canonicalFoodKey(normalizeReceiptItemName(item.name)),
    tokens: matchFoodName(normalizeReceiptItemName(item.name))
      .split(" ")
      .filter(Boolean),
  }));
}

/**
 * Шукає позицію комори, якої стосується рядок чека.
 *
 * Два кроки, обидва на очищеній назві:
 *  1. точний збіг канонічних ключів — те, що працювало й раніше;
 *  2. **підмножина токенів**: усі слова позиції комори присутні в назві з
 *     чека. Комора зазвичай коротка («молоко»), чек — довгий («Молоко
 *     Яготинське»), тож напрям саме такий і не симетричний.
 *
 * ponytail: без відстані Левенштейна й без LLM. Другий крок закриває
 * типовий випадок «коротке в коморі ⊂ довге в чеку», а помилку ловить
 * людина — аркуш поповнення показує знайдену пару до запису. Зʼявиться
 * потреба в опечатках («молако») — тоді й додавай нечітку відстань.
 *
 * Неоднозначність вирішується на користь НАЙДОВШОЇ позиції комори: якщо
 * підходять і «молоко», і «молоко кокосове», друге специфічніше. При
 * РІВНІЙ довжині перемагає лексикографічно менший ключ, а не той, хто
 * трапився раніше в масиві: інакше дублі комори («Молоко» і «молоко»)
 * ловили б поповнення за випадковим порядком, і друга позиція лишалась би
 * сиротою назавжди.
 */
export function findPantryMatch<T extends { name: string }>(
  receiptItemName: string,
  pantry: readonly T[] | readonly PantryMatchCandidate<T>[],
): T | null {
  const index: readonly PantryMatchCandidate<T>[] =
    pantry.length > 0 && "tokens" in (pantry[0] as object)
      ? (pantry as readonly PantryMatchCandidate<T>[])
      : buildPantryIndex(pantry as readonly T[]);

  const cleaned = normalizeReceiptItemName(receiptItemName);
  const key = canonicalFoodKey(cleaned);
  if (!key) return null;

  for (const candidate of index) {
    if (candidate.key === key) return candidate.item;
  }

  const receiptTokens = new Set(
    matchFoodName(cleaned).split(" ").filter(Boolean),
  );
  if (receiptTokens.size === 0) return null;

  let best: PantryMatchCandidate<T> | null = null;
  for (const candidate of index) {
    if (candidate.tokens.length === 0) continue;
    if (!candidate.tokens.every((t) => receiptTokens.has(t))) continue;
    if (
      best === null ||
      candidate.tokens.length > best.tokens.length ||
      (candidate.tokens.length === best.tokens.length &&
        candidate.key < best.key)
    ) {
      best = candidate;
    }
  }
  return best ? best.item : null;
}
