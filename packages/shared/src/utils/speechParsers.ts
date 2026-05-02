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
// (token-stream rewrite). Inflections are deliberately NOT included here
// because they only ever appear as the trailing word of a phrase like
// "вісімдесятьох кілограмів" — the digit comes from "вісімдесят", and the
// case ending lives on the unit, which the regex tolerates separately.

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
  "п'ять": 5,
  шість: 6,
  сім: 7,
  вісім: 8,
  "дев'ять": 9,
  десять: 10,
  одинадцять: 11,
  дванадцять: 12,
  тринадцять: 13,
  чотирнадцять: 14,
  "п'ятнадцять": 15,
  шістнадцять: 16,
  сімнадцять: 17,
  вісімнадцять: 18,
  "дев'ятнадцять": 19,
  двадцять: 20,
  тридцять: 30,
  сорок: 40,
  "п'ятдесят": 50,
  шістдесят: 60,
  сімдесят: 70,
  вісімдесят: 80,
  "дев'яносто": 90,
  сто: 100,
  двісті: 200,
  триста: 300,
  чотириста: 400,
  "п'ятсот": 500,
  шістсот: 600,
  сімсот: 700,
  вісімсот: 800,
  "дев'ятсот": 900,
  тисяча: 1000,
  тисячі: 1000,
  тисяч: 1000,
};

// Apostrophes Whisper emits vary: ASCII `'`, typographic `’`, modifier `ʼ`.
// Normalize to ASCII before lookup so "п'ять" / "п’ять" / "пʼять" all hit.
// (Combining marks like U+0301 are deliberately excluded — character-class
// linters flag them, and Whisper does not emit them in this position.)
function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2019\u02BC]/g, "'");
}

function stripWordPunctuation(token: string): string {
  return token
    .replace(/[.,!?;:()«»"'`]+$/g, "")
    .replace(/^[.,!?;:()«»"'`]+/g, "");
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
export function parseUaNumber(text: string): number | null {
  const lower = normalizeApostrophes(text.toLowerCase());
  const parsed = parseFloat(lower.replace(",", "."));
  if (!isNaN(parsed)) return parsed;
  let total = 0;
  let current = 0;
  let matched = false;
  const words = lower.split(/\s+/);
  for (const raw of words) {
    const w = stripWordPunctuation(raw);
    const v = UA_NUMBER_WORDS[w];
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
  const normalized = normalizeApostrophes(text);
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  const out: string[] = [];
  const PUNCT_BREAK = /[.,;:!?)»]$/;
  let i = 0;
  while (i < words.length) {
    const clean = stripWordPunctuation(words[i]).toLowerCase();
    if (UA_NUMBER_WORDS[clean] == null) {
      out.push(words[i]);
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
      if (PUNCT_BREAK.test(words[j - 1])) break;
      const c = stripWordPunctuation(words[j]).toLowerCase();
      if (UA_NUMBER_WORDS[c] == null) break;
      runWords.push(c);
      j++;
    }
    const n = parseUaNumber(runWords.join(" "));
    if (n != null) {
      // Preserve trailing punctuation on the last word of the run
      // (e.g. "вісімдесят," → "80,").
      const lastRaw = words[j - 1];
      const trailingPunct = lastRaw.match(/[.,!?;:)»]+$/)?.[0] ?? "";
      out.push(String(n) + trailingPunct);
    } else {
      for (let k = i; k < j; k++) out.push(words[k]);
    }
    i = j;
  }
  return out.join(" ");
}

// ── Finyk: expense parser ──────────────────────────────────────────────────
// e.g. "кава 45 гривень", "продукти 320 грн", "таксі двісті п'ятдесят"

export interface ParsedExpense {
  name: string;
  amount: number | null;
  raw: string;
}

export function parseExpenseSpeech(text: string): ParsedExpense | null {
  if (!text?.trim()) return null;

  const norm = normalizeUaNumbers(text);
  const lower = norm.toLowerCase().replace(/[,]/g, ".");

  const amountMatch =
    lower.match(
      /(\d+(?:\.\d+)?)\s*(?:грн?|гривень|гривні|гривня|гривен|₴|uah)/iu,
    ) || lower.match(/(\d+(?:\.\d+)?)/u);

  let amount: number | null = null;
  if (amountMatch) {
    amount = parseFloat(amountMatch[1]);
  }

  // Belt-and-suspenders fallback for inputs the normalizer happened to miss
  // (e.g. unusual case forms not in the lookup).
  if (amount == null) {
    amount = parseUaNumber(text);
  }

  const currencyRe = /\b(?:грн?|гривень|гривні|гривня|гривен|₴|uah)\b/iu;
  let name = norm
    .replace(
      /(\d+(?:[.,]\d+)?)\s*(?:грн?|гривень|гривні|гривня|гривен|₴|uah)?\b/giu,
      " ",
    )
    .replace(currencyRe, " ")
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

  const norm = normalizeUaNumbers(text);
  const lower = norm.toLowerCase();

  const weightMatch =
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg|кілограм|килограм)/iu) ||
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:lb|lbs|фунт)/iu);

  const repsMatch =
    lower.match(
      /(\d+)\s*(?:повт|повторень|повторів|повторення|reps?|разів|раз)/iu,
    ) || lower.match(/(?:повт|reps?)\s*(\d+)/iu);

  const setsMatch =
    lower.match(/(\d+)\s*(?:підходів|підхід|sets?)/iu) ||
    lower.match(/(?:підхід|sets?)\s*(\d+)/iu);

  let weight: number | null = null;
  if (weightMatch) {
    weight = parseFloat(weightMatch[1].replace(",", "."));
    if (/lb|lbs|фунт/i.test(weightMatch[0]))
      weight = Math.round(weight * 0.453592);
  }

  let reps: number | null = null;
  if (repsMatch) reps = parseInt(repsMatch[1] || repsMatch[2], 10);

  let sets: number | null = null;
  if (setsMatch) sets = parseInt(setsMatch[1] || setsMatch[2], 10);

  let exerciseName: string | null = norm
    .replace(
      /(\d+(?:[.,]\d+)?)\s*(?:кг|kg|кілограм|килограм|lb|lbs|фунт)?\b/giu,
      " ",
    )
    .replace(
      /(\d+)\s*(?:повт|повторень|повторів|повторення|reps?|разів|раз|підходів|підхід|sets?)\b/giu,
      " ",
    )
    .replace(/\s+/g, " ")
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

  const norm = normalizeUaNumbers(text);
  const lower = norm.toLowerCase();

  const kcalMatch =
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:ккал|кілокалор|калор|kcal|cal)/iu) ||
    lower.match(/(?:ккал|kcal)\s*(\d+(?:[.,]\d+)?)/iu);

  // Prefer multi-letter alternations first; "гр"/"г" alone use a Cyrillic-aware
  // negative lookahead so they don't gobble "гречка". JS `\b` is ASCII-only and
  // doesn't fire between two Cyrillic chars even with the /u flag.
  const CYR = /[а-яА-ЯёЁєЄіІїЇґҐ]/.source;
  const gramsRe = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(?:грам|гр(?!${CYR})|г(?!${CYR})|g\\b|ml|мл)`,
    "iu",
  );
  const gramsMatch =
    lower.match(gramsRe) || lower.match(/(?:грам|гр)\s*(\d+(?:[.,]\d+)?)/iu);

  const proteinMatch = lower.match(
    /(\d+(?:[.,]\d+)?)\s*(?:г\s*білка|г\s*протеїну|g\s*protein|protein)/iu,
  );

  let kcal: number | null = null;
  if (kcalMatch)
    kcal = parseFloat((kcalMatch[1] || kcalMatch[2]).replace(",", "."));

  let grams: number | null = null;
  if (gramsMatch) grams = parseFloat(gramsMatch[1].replace(",", "."));

  let protein: number | null = null;
  if (proteinMatch) protein = parseFloat(proteinMatch[1].replace(",", "."));

  // Strip recognized number-units from the name. Same Cyrillic-aware
  // lookahead trick for "гр"/"г" so we don't munch food-name prefixes.
  const stripGramsRe = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(?:грам|гр(?!${CYR})|г(?!${CYR})|g\\b|ml|мл)?\\b`,
    "giu",
  );
  let name = norm
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:ккал|кілокалор|калор|kcal|cal)?\b/giu, " ")
    .replace(stripGramsRe, " ")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:г\s*білка|g\s*protein)?\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();

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
