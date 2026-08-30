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
export function buildPantryIndex<
  T extends { name: string; sources?: readonly { name: string }[] | null },
>(pantryItems: readonly T[]): PantryMatchCandidate<T>[] {
  const out: PantryMatchCandidate<T>[] = [];
  for (const item of pantryItems) {
    // Родова назва позиції — і повні назви покупок, які в неї злились.
    // Без другого запит «Яготинське» не знаходив би позицію «Молоко», хоч
    // саме ця покупка в ній і лежить.
    const names = [item.name, ...(item.sources ?? []).map((s) => s.name)];
    const seen = new Set<string>();
    for (const raw of names) {
      const cleaned = normalizeReceiptItemName(raw);
      const key = canonicalFoodKey(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        item,
        key,
        tokens: matchFoodName(cleaned).split(" ").filter(Boolean),
      });
    }
  }
  return out;
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
export function findPantryMatch<
  T extends { name: string; sources?: readonly { name: string }[] | null },
>(
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

/**
 * Токени, які ВИГЛЯДАЮТЬ як бренд (велика літера, латиниця), але брендом не
 * є: це сорти, типи й характеристики складу. Викинувши їх, ми втратили б
 * саме те, що відрізняє продукт: «Сир Адигейський» ≠ «Сир», а «Кола Zero» ≠
 * «Кола» за калоріями.
 *
 * Це перелік ТИПІВ, а не виробників — словника брендів тут свідомо немає
 * (спека `pantry-generic-names.md` § Поза скоупом). Поповнюється, коли
 * вилізе новий випадок. Порівняння регістронезалежне.
 */
export const GENERIC_NAME_STOP_TOKENS: ReadonlySet<string> = new Set(
  [
    // сири
    "адигейський",
    "гауда",
    "моцарела",
    "mozzarella",
    "пармезан",
    "чедер",
    "cheddar",
    "фета",
    "брі",
    "голландський",
    "російський",
    // ковбаси й мʼясо
    "краківська",
    "мілано",
    "салямі",
    "докторська",
    "мисливські",
    // фрукти й овочі
    "голден",
    "гренні",
    "сміт",
    "джонаголд",
    "черрі",
    // напої та кава
    "арабіка",
    "робуста",
    "пуер",
    "каркаде",
    "earl",
    "grey",
    "espresso",
    // склад і дієта
    "zero",
    "light",
    "free",
    "lactose",
    "gluten",
    "bio",
    "greek",
    "bbq",
  ].map((t) => t.toLowerCase()),
);

const LATIN_RE = /[A-Za-z]/u;
const UPPER_START_RE = /^\p{Lu}/u;
const HAS_LOWERCASE_RE = /\p{Ll}/u;

function bareToken(token: string): string {
  return token.replace(/[.,;:]+$/u, "");
}

/**
 * Родова назва продукту: назва з чека без брендових токенів.
 *
 * Брендовим вважається токен, який містить латиницю (`Roni`, `Aumi`) або
 * починається з великої літери і стоїть НЕ першим (`Яготинське`, `Лавка`).
 * Перший токен не викидається ніколи: назва завжди починається з типу
 * продукту.
 *
 * Три запобіжники, без яких правило ламається:
 *
 *  1. **Захист від CAPS.** Якщо в назві немає жодної малої літери (чек
 *     надрукований як «СИР КИСЛОМОЛОЧНИЙ 9%»), правило великої літери НЕ
 *     працює — лишається тільки правило латиниці. Інакше від назви лишилось
 *     би «СИР», і зникло б «КИСЛОМОЛОЧНИЙ».
 *  2. **Стоп-лист** {@link GENERIC_NAME_STOP_TOKENS} — сорти й типи, які
 *     виглядають як бренд, але ним не є.
 *  3. **Фолбек на порожнечу.** Якщо після видалення лишився порожній рядок
 *     або один символ, береться повна назва.
 *
 * Окремо — правило «слово між двома брендами належить бренду»: у «Паста
 * арахісова *Лавка традицій Aumi* кранч» слово «традицій» стоїть між двома
 * брендовими токенами, тож іде разом із ними, а «кранч» після останнього
 * бренду лишається. Без цього правила двослівні кириличні бренди («Лавка
 * традицій», «Наша Ряба») лишали б по собі хвіст у родовій назві.
 *
 * Пакувальний шум («2.6%», «900г») прибирає `normalizeReceiptItemName` —
 * тут він перевикористаний, а не продубльований.
 */
export function genericFoodName(raw: unknown): string {
  const cleaned = normalizeReceiptItemName(raw);
  if (!cleaned) return "";

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return cleaned;

  const caseRuleOn = HAS_LOWERCASE_RE.test(cleaned);
  const isBrand = tokens.map((token, i) => {
    if (i === 0) return false;
    const bare = bareToken(token);
    if (!bare) return false;
    if (GENERIC_NAME_STOP_TOKENS.has(bare.toLowerCase())) return false;
    if (LATIN_RE.test(bare)) return true;
    return caseRuleOn && UPPER_START_RE.test(bare);
  });

  const lastBrand = isBrand.lastIndexOf(true);
  const firstBrand = isBrand.indexOf(true);

  const kept = tokens.filter((_, i) => {
    if (isBrand[i]) return false;
    // Слово між двома брендовими токенами — частина брендової фрази.
    return !(i > firstBrand && i < lastBrand);
  });

  const generic = kept.join(" ").trim();
  return generic.length > 1 ? generic : cleaned;
}
