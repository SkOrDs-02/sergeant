/**
 * Speech-to-structured-data parsers for each module's entry format.
 * Supports Ukrainian and English input.
 *
 * Voice flow: VoiceMicButton → Groq Whisper → text → these parsers →
 * domain object. Whisper has a strong tendency to write Ukrainian numbers
 * in word form on short utterances ("вісімдесят кілограмів" rather than
 * "80 кг"), so every parser normalizes word-form numbers to digits before
 * regex matching. We also accept inflected forms ("кілограмів", "грамів",
 * "разів", "повторень", "гривень") via prefix-matching alternations
 * without `\b` anchors.
 */
//
// ── Ukrainian number-words → digits ────────────────────────────────────────
//
// Used by both `parseUaNumber` (single-number parse) and `normalizeUaNumbers`
// (token-stream rewrite).
//
// Тут раніше стояло, що відмінкові форми внесені НЕ будуть, бо «закінчення
// живе на одиниці, а не на числівнику». Для української це неправда, і
// коштувало це дорого: «вісімдесяти кілограмів», «сорока гривень», «пʼяти
// разів», «двохсот грамів» — не екзотика, а звичайна усна форма з
// квантифікованим іменником. Усі вони давали `null`. Непрямі відмінки
// внесені нижче окремим блоком.

import { foldApostrophes } from "./ukApostrophe";

/**
 * Межа слова, що працює з кирилицею.
 *
 * AI-DANGER: НЕ став `\b` поруч із кириличною літерою. У JavaScript `\b`
 * визначена через ASCII-`\w`, тож між «а» і пробілом межі для неї не існує
 * — `/\bкава/u.test("кава")` дає **false**, і прапорець `u` цього не
 * змінює. Регекс із таким якорем не «іноді помиляється», він НЕ ЗБІГАЄТЬСЯ
 * НІКОЛИ, тихо перетворюючись на no-op.
 *
 * Саме так сюди й приїхав баг: регекси ПОШУКУ числа якорів не мали і
 * працювали, а регекси ЗАЧИСТКИ назви мали `\b` — тож одиниці лишались у
 * назві, і «кава сорок пʼять гривень» давало опис «Кава гривень». Тести
 * цього не бачили, бо перевіряли `toMatch(/кава/i)` — підрядок, який у
 * «Кава гривень» присутній.
 *
 * Репо вже знало цю пастку в чотирьох інших місцях (`llmRedaction.ts`,
 * `receiptSplitSuggestion.ts`, `genericFoods.test.ts`, `WorkoutsHome.test.tsx`)
 * і навіть у цьому файлі — коментар біля `gramsRe` нижче. Знання було, але
 * жило на одному шляху; сусідні про нього не чули.
 */
const NOT_WORD_CHAR = "(?![\\p{L}\\p{N}])";

/**
 * Число з відсіченим бектрекінгом.
 *
 * AI-DANGER: `(?!\\d)` наприкінці — не косметика, а захист від
 * КВАДРАТИЧНОГО бектрекінгу на даних користувача (CodeQL
 * `js/polynomial-redos`). Без нього на рядку з довгого прогону цифр
 * `\\d+` зʼїдає все, наступний якір падає, рушій вкорочує збіг на одну
 * цифру — і так до самого початку, для КОЖНОЇ стартової позиції. Заміряно
 * на 20 000 цифр: 3.4 с в одному `replace`. З `(?!\\d)` укорочений збіг
 * помирає одразу, бо праворуч стоїть цифра.
 *
 * JS не має атомарних груп, тож цей lookahead — їх штатна заміна.
 */
const NUM = "(\\d+(?:[.,]\\d+)?)(?!\\d)";
const INT = "(\\d+)(?!\\d)";

/**
 * Стеля довжини розбору.
 *
 * AI-DANGER: це не мікрооптимізація, а межа складності. Регекси нижче
 * шукають «число + одиниця» з КОЖНОЇ позиції рядка, і на довгому прогоні
 * цифр така форма квадратична за самою природою — не через зайвий
 * бектрекінг, а тому що жадібний `\\d+` на n позиціях дає n² кроків.
 * Жодна форма регекса цього не прибирає (перевірено й на атомарній
 * емуляції через lookahead + backreference: та сама квадратика).
 *
 * Прибирає її лише межа на вході. Заміряно до неї: 20 000 цифр — 13.7 с
 * на чотири парсери, 40 000 — 52.9 с. Вхід — транскрипт мовлення, тобто
 * дані користувача (CodeQL `js/polynomial-redos`).
 *
 * 1024 — та сама стеля, що вже стоїть на `promptHint` у
 * `useGroqVoiceInput`. Голосова команда («кава 45 гривень») на два
 * порядки коротша; усе, що довше за абзац, розбирати як команду однаково
 * безглуздо.
 */
const MAX_PARSE_LEN = 1024;

/** Обрізає вхід до стелі розбору. Див. `MAX_PARSE_LEN`. */
function capInput(text: string): string {
  return text.length > MAX_PARSE_LEN ? text.slice(0, MAX_PARSE_LEN) : text;
}

const UA_NUMBER_WORDS: Record<string, number> = {
  нуль: 0,
  один: 1,
  одна: 1,
  одне: 1,
  одно: 1,
  два: 2,
  дві: 2,
  три: 3,
  чотири: 4,
  пʼять: 5,
  шість: 6,
  сім: 7,
  вісім: 8,
  девʼять: 9,
  десять: 10,
  одинадцять: 11,
  дванадцять: 12,
  тринадцять: 13,
  чотирнадцять: 14,
  пʼятнадцять: 15,
  шістнадцять: 16,
  сімнадцять: 17,
  вісімнадцять: 18,
  девʼятнадцять: 19,
  двадцять: 20,
  тридцять: 30,
  сорок: 40,
  пʼятдесят: 50,
  шістдесят: 60,
  сімдесят: 70,
  вісімдесят: 80,
  девʼяносто: 90,
  сто: 100,
  двісті: 200,
  триста: 300,
  чотириста: 400,
  пʼятсот: 500,
  шістсот: 600,
  сімсот: 700,
  вісімсот: 800,
  девʼятсот: 900,
  тисяча: 1000,
  тисячі: 1000,
  тисяч: 1000,

  // ── Непрямі відмінки ──────────────────────────────────────────────────
  //
  // Коментар вище колись стверджував, що відмінювати числівник не треба,
  // бо «закінчення живе на одиниці». Для української це просто неправда:
  // «вісімдесяти кілограмів», «двохсот грамів», «сорока гривень», «пʼяти
  // разів» — не край, а звичайна усна форма з квантифікованим іменником.
  // Саме її вживає людина, яка говорить природно, і саме вона давала
  // `null`: у Фініку рятував запасний регекс на голе число (сума
  // знаходилась, хоч і не завжди правильна), а у Фізруку спрацьовував
  // guard «усі три null» — і фразу мовчки викидало.
  //
  // Родовий і місцевий збігаються (`пʼяти`), орудний окремо (`пʼятьма`).
  // Паралельні форми на `-ох`/`-ьох` теж усні, тож стоять поруч.
  двох: 2,
  двома: 2,
  трьох: 3,
  трьома: 3,
  чотирьох: 4,
  чотирма: 4,
  пʼяти: 5,
  пʼятьох: 5,
  пʼятьма: 5,
  пʼятьома: 5,
  шести: 6,
  шістьох: 6,
  шістьма: 6,
  шістьома: 6,
  семи: 7,
  сімох: 7,
  сьома: 7,
  сімома: 7,
  восьми: 8,
  вісьмох: 8,
  вісьма: 8,
  вісьмома: 8,
  девʼяти: 9,
  девʼятьох: 9,
  девʼятьма: 9,
  десяти: 10,
  десятьох: 10,
  десятьма: 10,
  одинадцяти: 11,
  дванадцяти: 12,
  тринадцяти: 13,
  чотирнадцяти: 14,
  пʼятнадцяти: 15,
  шістнадцяти: 16,
  сімнадцяти: 17,
  вісімнадцяти: 18,
  девʼятнадцяти: 19,
  двадцяти: 20,
  тридцяти: 30,
  сорока: 40,
  пʼятдесяти: 50,
  шістдесяти: 60,
  сімдесяти: 70,
  вісімдесяти: 80,
  девʼяноста: 90,
  ста: 100,
  двохсот: 200,
  трьохсот: 300,
  чотирьохсот: 400,
  пʼятисот: 500,
  шестисот: 600,
  семисот: 700,
  восьмисот: 800,
  девʼятисот: 900,
  тисячам: 1000,
  тисячами: 1000,

  // Дробові. «Півтора» — окреме слово, не сума, тож просто значення.
  півтора: 1.5,
  півтори: 1.5,
  // Псевдослово: `collapseHalfPhrases` склеює «з половиною» в один токен,
  // інакше прийменник «з» рве пробіг числівників навпіл і «дві з половиною
  // тисячі» дає «2 з половиною 1000».
  зполовиною: 0.5,
};

/**
 * Склеює «з половиною» (та «із/та половиною») в один токен `зполовиною`.
 *
 * Потрібно саме до токенізації: пробіг числівників у `normalizeUaNumbers`
 * рветься на будь-якому слові поза таблицею, а «з» — прийменник, у таблиці
 * його бути не може.
 *
 * Межі — лукараунди, а не `\b`: поруч із кирилицею той якір не
 * спрацьовує ніколи (див. `NOT_WORD_CHAR` нижче).
 */
function collapseHalfPhrases(text: string): string {
  return text.replace(
    /(?<![\p{L}\p{N}])(?:з|із|зі|та|і)\s+половиною(?![\p{L}\p{N}])/giu,
    "зполовиною",
  );
}

// Apostrophes Whisper emits vary: ASCII `'`, typographic `’`, modifier `ʼ`.
// Fold every form to the canonical `ʼ` before lookup so "п'ять" / "п’ять"
// / "пʼять" all hit the same key. The keys above are written canonically
// (§1.10); folding the INPUT is what makes the other two forms work, and
// dropping it would silently un-recognize ten numerals.
// (Combining marks like U+0301 are deliberately excluded — character-class
// linters flag them, and Whisper does not emit them in this position.)

// AI-CONTEXT: скан двома вказівниками, а не `/[…]+$/` — і це не стиль.
// Ця функція їсть транскрипт Whisper, тобто НЕконтрольований рядок, а
// привʼязаний до кінця клас `[…]+$` рушій пробує з КОЖНОЇ позиції:
// "!!!!…!!!!" довжини n коштує O(n²) (CodeQL js/polynomial-redos,
// alert #389). Розширення класу апострофами в §1.10 нічого не зламало,
// але зробило рядок «зміненим» — і давню поліноміальну форму видно.
// Тут же лінійно: два вказівники, жодного бектрекінгу.
const EDGE_PUNCTUATION = new Set([
  ".",
  ",",
  "!",
  "?",
  ";",
  ":",
  "(",
  ")",
  "«",
  "»",
  '"',
  "'",
  "‘",
  "’",
  "ʼ",
  "`",
]);

function stripWordPunctuation(token: string): string {
  let start = 0;
  let end = token.length;
  while (start < end && EDGE_PUNCTUATION.has(token.charAt(start))) start += 1;
  while (end > start && EDGE_PUNCTUATION.has(token.charAt(end - 1))) end -= 1;
  return token.slice(start, end);
}

/**
 * Parse a single number expressed as Ukrainian words OR digits.
 * Returns null when the input contains no recognizable number.
 *
 * Examples:
 *   "вісімдесят" → 80
 *   "сто двадцять п'ять" → 125
 *   "одна тисяча двісті" → 1200
 *   "80,5" → 80.5
 *   "кава" → null
 */
/** Значення токена-цифри («2», «2.5», «2,5») або `null`. */
function digitTokenValue(token: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(token)) return null;
  const parsed = parseFloat(token.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseUaNumber(text: string): number | null {
  const lower = collapseHalfPhrases(
    foldApostrophes(capInput(text).toLowerCase()),
  );
  const trimmed = lower.trim();
  // Рядок, що ВЕСЬ є числом. Тут раніше стояв голий `parseFloat(lower)`, і
  // саме він давав найдорожчу помилку цього парсера: `parseFloat` зупиняє
  // читання на першому пробілі, тож «2 з половиною тисячі» повертало 2, а
  // далі фолбек у `parseExpenseSpeech` записував 500 замість 2500 — сума,
  // помилкова вп'ятеро і мовчки. Перевіряємо ВЕСЬ рядок, а змішані
  // «цифра + слова» доганяє накопичувач нижче.
  const whole = digitTokenValue(trimmed);
  if (whole !== null) return whole;

  let total = 0;
  let current = 0;
  let matched = false;
  const words = lower.split(/\s+/);
  for (const raw of words) {
    const w = stripWordPunctuation(raw);
    // Цифра рівноправна зі словом: «2 зполовиною тисячі» — одне число.
    const v = digitTokenValue(w) ?? UA_NUMBER_WORDS[w];
    if (v == null) continue;
    matched = true;
    if (v === 1000) {
      total += (current || 1) * 1000;
      current = 0;
    } else {
      current += v;
    }
  }
  total += current;
  return matched ? total : null;
}

/**
 * Walk the input as whitespace-separated words and replace every maximal
 * run of UA number-words with the computed digit form. Punctuation between
 * consecutive number-words breaks the run, so "вісімдесят, вісім" stays
 * 80 + 8 instead of collapsing to 88. Output is whitespace-normalised
 * (single spaces); parsers do not depend on the original spacing.
 *
 * "жим вісімдесят кілограмів вісім разів"
 *   → "жим 80 кілограмів 8 разів"
 *
 * "сто двадцять п'ять гривень"
 *   → "125 гривень"
 *
 * Once normalized, the existing digit-based regexes in each parser can
 * extract weights / reps / amounts unchanged.
 */
export function normalizeUaNumbers(text: string): string {
  const normalized = collapseHalfPhrases(foldApostrophes(capInput(text)));
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  const out: string[] = [];
  const PUNCT_BREAK = /[.,;:!?)»]$/;
  let i = 0;
  while (i < words.length) {
    const wi = words[i] ?? "";
    const clean = stripWordPunctuation(wi).toLowerCase();
    const isWord = UA_NUMBER_WORDS[clean] != null;
    // Пробіг може починатись і з ЦИФРИ — але тільки якщо далі йде
    // число-слово. Інакше «2 з половиною тисячі» розпадалось на «2» окремо
    // і «зполовиною тисячі» = 500, а сума виходила вп'ятеро меншою.
    //
    // AI-DANGER: цифра допускається ЛИШЕ як перший токен пробігу, і далі
    // збираються самі слова. Дозволити цифру всередині означало б склеїти
    // сусідні числа: «2 5» стало б 7.
    const nextClean = stripWordPunctuation(words[i + 1] ?? "").toLowerCase();
    const digitStartsRun =
      !isWord &&
      digitTokenValue(clean) !== null &&
      !PUNCT_BREAK.test(wi) &&
      UA_NUMBER_WORDS[nextClean] != null;
    if (!isWord && !digitStartsRun) {
      out.push(wi);
      i++;
      continue;
    }
    // Collect a contiguous run of number-words, breaking at punctuation
    // attached to a previous word in the run.
    const runWords: string[] = [clean];
    let j = i + 1;
    while (j < words.length) {
      // If the previous word ended with separator punctuation, stop the run
      // here so that "вісімдесят, вісім" produces 80 + 8 (two numbers) rather
      // than the merged "вісімдесят вісім" = 88.
      const prev = words[j - 1] ?? "";
      if (PUNCT_BREAK.test(prev)) break;
      const c = stripWordPunctuation(words[j] ?? "").toLowerCase();
      if (UA_NUMBER_WORDS[c] == null) break;
      runWords.push(c);
      j++;
    }
    const n = parseUaNumber(runWords.join(" "));
    if (n != null) {
      // Preserve trailing punctuation on the last word of the run
      // (e.g. "вісімдесят," → "80,").
      const lastRaw = words[j - 1] ?? "";
      const trailingPunct = lastRaw.match(/[.,!?;:)»]+$/)?.[0] ?? "";
      out.push(String(n) + trailingPunct);
    } else {
      for (let k = i; k < j; k++) out.push(words[k] ?? "");
    }
    i = j;
  }
  return out.join(" ");
}

// ── Finyk: expense parser ──────────────────────────────────────────────────
// e.g. "кава 45 гривень", "продукти 320 грн", "таксі двісті п'ятдесят"

/**
 * Валюта. Порядок альтернатив — від найдовшої: JS бере ПЕРШИЙ збіг, а не
 * найдовший, тож «грн» перед «гривень» зʼїло б три літери й лишило «ивень».
 * `NOT_WORD_CHAR` після групи це теж ловить, але покладатись на бектрекінг
 * там, де достатньо порядку, — зайвий ризик.
 */
const CURRENCY = "(?:гривень|гривні|гривня|гривен|грн|гр|₴|uah)";

export interface ParsedExpense {
  name: string;
  amount: number | null;
  raw: string;
}

export function parseExpenseSpeech(text: string): ParsedExpense | null {
  if (!text?.trim()) return null;

  const norm = normalizeUaNumbers(capInput(text));
  const lower = norm.toLowerCase().replace(/[,]/g, ".");

  const amountMatch =
    lower.match(new RegExp(`${NUM}\\s*${CURRENCY}`, "iu")) ||
    lower.match(new RegExp(NUM, "u"));

  let amount: number | null = null;
  if (amountMatch?.[1]) {
    amount = parseFloat(amountMatch[1]);
  }

  // Belt-and-suspenders fallback for inputs the normalizer happened to miss
  // (e.g. unusual case forms not in the lookup).
  if (amount == null) {
    amount = parseUaNumber(text);
  }

  let name = norm
    .replace(new RegExp(`${NUM}\\s*${CURRENCY}?${NOT_WORD_CHAR}`, "giu"), " ")
    .replace(new RegExp(`${CURRENCY}${NOT_WORD_CHAR}`, "giu"), " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!name) name = "Витрата";
  name = name.charAt(0).toUpperCase() + name.slice(1);

  return {
    name,
    amount: amount != null ? Math.round(amount * 100) / 100 : null,
    raw: text,
  };
}

// ── Fizruk: workout set parser ─────────────────────────────────────────────
// e.g. "bench press 80 kg 8 reps", "присідання 100 кг 5 повторень",
//       "жим вісімдесят кілограмів вісім разів"

export interface ParsedWorkoutSet {
  exerciseName: string | null;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  raw: string;
}

/**
 * Parse a workout-set utterance. Returns:
 *   - `null` when the input is empty / whitespace-only
 *   - an object with `weight`/`reps`/`sets` populated to the extent recognized
 *
 * NOTE: callers should refuse to act on the result when *all three* of
 * `weight`, `reps`, and `sets` are `null` — the parser still returns the
 * trimmed `exerciseName` in that case so the caller can use it as a free-form
 * label, but it does NOT mean a numeric set was understood. See the
 * `WorkoutItemCard` callsite for the canonical guard.
 */
export function parseWorkoutSetSpeech(text: string): ParsedWorkoutSet | null {
  if (!text?.trim()) return null;

  const norm = normalizeUaNumbers(capInput(text));
  const lower = norm.toLowerCase();

  const weightMatch =
    lower.match(new RegExp(`${NUM}\\s*(?:кг|kg|кілограм|килограм)`, "iu")) ||
    lower.match(new RegExp(`${NUM}\\s*(?:lb|lbs|фунт)`, "iu"));

  const repsMatch =
    lower.match(
      new RegExp(
        `${INT}\\s*(?:повт|повторень|повторів|повторення|reps?|разів|раз)`,
        "iu",
      ),
    ) || lower.match(/(?:повт|reps?)\s*(\d+)/iu);

  // `підх[іо]д` — чергування і↔о в корені: «підхід» → «підходи». Без нього
  // найприроднішa форма «3 підходи» не розпізнавалась узагалі.
  const setsMatch =
    lower.match(new RegExp(`${INT}\\s*(?:підх[іо]д\\p{L}*|sets?)`, "iu")) ||
    lower.match(/(?:підх[іо]д\p{L}*|sets?)\s*(\d+)/iu);

  let weight: number | null = null;
  if (weightMatch?.[1]) {
    weight = parseFloat(weightMatch[1].replace(",", "."));
    if (/lb|lbs|фунт/i.test(weightMatch[0]))
      weight = Math.round(weight * 0.453592);
  }

  let reps: number | null = null;
  if (repsMatch) reps = parseInt(repsMatch[1] ?? repsMatch[2] ?? "", 10);

  let sets: number | null = null;
  if (setsMatch) sets = parseInt(setsMatch[1] ?? setsMatch[2] ?? "", 10);

  // `\\p{L}*` після кириличного кореня з`їдає відмінкове закінчення
  // («кілограм» + «ів»), якого ASCII-`\\w*` не бачить.
  const WEIGHT_UNIT =
    "(?:кілограм\\p{L}*|килограм\\p{L}*|фунт\\p{L}*|кг|kg|lbs|lb)";
  // `підх[іо]д` — не друкарська помилка: в українській корінь чергує
  // і↔о («підхід» → «підходи»), тож самого `підхід\\p{L}*` мало.
  const COUNT_UNIT =
    "(?:повтор\\p{L}*|повт|підх[іо]д\\p{L}*|разів|раз|reps|rep|sets|set)";
  let exerciseName: string | null = norm
    .replace(
      new RegExp(
        `(\\d+(?:[.,]\\d+)?)\\s*${WEIGHT_UNIT}?${NOT_WORD_CHAR}`,
        "giu",
      ),
      " ",
    )
    .replace(new RegExp(`${INT}\\s*${COUNT_UNIT}?${NOT_WORD_CHAR}`, "giu"), " ")
    .replace(new RegExp(`${WEIGHT_UNIT}${NOT_WORD_CHAR}`, "giu"), " ")
    .replace(new RegExp(`${COUNT_UNIT}${NOT_WORD_CHAR}`, "giu"), " ")
    .replace(/\s+/g, " ")
    .trim()
    // Прийменник, що завис у ХВОСТІ після зачистки: «станова 120 кг 3
    // підходи по 8 разів» лишало «Станова по». Саме в хвості, а не
    // будь-де: інакше зникло б осмислене «жим НА похилій лаві».
    //
    // AI-DANGER: цей крок мусить стояти ПІСЛЯ згортання пробілів, а не
    // перед ним. Форма `\s+(?:…)\s*$` на пробільному хвості дає
    // КВАДРАТИЧНИЙ бектрекінг (заміряно: 4 k → 30 мс, 32 k → 1.8 с,
    // множник 4.0 на кожне подвоєння), а вхід тут — сирий транскрипт,
    // тобто дані користувача. Після `\s+`→` ` і `trim()` пробільних
    // хвостів не лишається, тож літерального пробілу і `$` досить.
    .replace(/ (?:по|на|за|в|у|із|з)$/iu, "")
    .trim();

  if (!exerciseName) exerciseName = null;
  else
    exerciseName = exerciseName.charAt(0).toUpperCase() + exerciseName.slice(1);

  return {
    exerciseName,
    weight,
    reps,
    sets,
    raw: text,
  };
}

// ── Nutrition: meal parser ─────────────────────────────────────────────────
// e.g. "гречка 200 грам 180 ккал", "овочевий салат 150г 45 калорій",
//      "омлет двісті п'ятдесят грамів"

export interface ParsedMeal {
  name: string;
  kcal: number | null;
  grams: number | null;
  protein: number | null;
  raw: string;
}

export function parseMealSpeech(text: string): ParsedMeal | null {
  if (!text?.trim()) return null;

  const norm = normalizeUaNumbers(capInput(text));
  const lower = norm.toLowerCase();

  const kcalMatch =
    lower.match(
      new RegExp(`${NUM}\\s*(?:ккал|кілокалор|калор|kcal|cal)`, "iu"),
    ) || lower.match(/(?:ккал|kcal)\s*(\d+(?:[.,]\d+)?)/iu);

  // Prefer multi-letter alternations first; "гр"/"г" alone use a Cyrillic-aware
  // negative lookahead so they don't gobble "гречка". JS `\b` is ASCII-only and
  // doesn't fire between two Cyrillic chars even with the /u flag.
  const CYR = /[а-яА-ЯёЁєЄіІїЇґҐ]/.source;
  const gramsRe = new RegExp(
    `${NUM}\\s*(?:грам|гр(?!${CYR})|г(?!${CYR})|g\\b|ml|мл)`,
    "iu",
  );
  const gramsMatch =
    lower.match(gramsRe) || lower.match(/(?:грам|гр)\s*(\d+(?:[.,]\d+)?)/iu);

  const proteinMatch = lower.match(
    new RegExp(
      `${NUM}\\s*(?:г\\s*білка|г\\s*протеїну|g\\s*protein|protein)`,
      "iu",
    ),
  );

  let kcal: number | null = null;
  if (kcalMatch)
    kcal = parseFloat((kcalMatch[1] ?? kcalMatch[2] ?? "").replace(",", "."));

  let grams: number | null = null;
  if (gramsMatch?.[1]) grams = parseFloat(gramsMatch[1].replace(",", "."));

  let protein: number | null = null;
  if (proteinMatch?.[1])
    protein = parseFloat(proteinMatch[1].replace(",", "."));

  // Strip recognized number-units from the name. Same Cyrillic-aware
  // lookahead trick for "гр"/"г" so we don't munch food-name prefixes.
  // «кілокалор»/«калор» — корені, не слова: далі йде «ій»/«ії». Тому
  // `\\p{L}*`, інакше межа одразу після кореня не збіглася б.
  const KCAL_UNIT = "(?:ккал|кілокалор\\p{L}*|калор\\p{L}*|kcal|cal)";
  // Порядок альтернатив вирішує: `г\\s*білка` мусить стояти ПЕРЕД голим
  // `г`, інакше «30 г білка» дасть «білка» в назві страви.
  const MEAL_UNIT =
    `(?:${KCAL_UNIT}|г\\s*білка|g\\s*protein|protein|грам\\p{L}*` +
    `|гр(?!${CYR})|г(?!${CYR})|g|ml|мл)`;

  // ТРИ ФАЗИ, і порядок тут не косметичний. Раніше зачистка йшла парами
  // «число + своя одиниця» послідовно, і кожна фаза зривала ГОЛЕ число
  // сусідньої (її одиницю вона не знає, тож опційна група матчила порожнечу
  // і межа лишала саме число). Одиниця лишалась сиротою: «омлет 250 грам
  // 30 г білка» давало назву «Омлет грам г білка». Спершу знімаємо ВСІ
  // пари одним алфавітом одиниць, і лише потім — залишки.
  const name0 = norm
    .replace(new RegExp(`${NUM}\\s*${MEAL_UNIT}`, "giu"), " ")
    .replace(new RegExp(`${MEAL_UNIT}${NOT_WORD_CHAR}`, "giu"), " ")
    .replace(/\d+(?:[.,]\d+)?/gu, " ");
  let name = name0.replace(/\s+/g, " ").trim();

  if (!name) name = "Прийом їжі";
  else name = name.charAt(0).toUpperCase() + name.slice(1);

  return {
    name,
    kcal,
    grams,
    protein,
    raw: text,
  };
}
