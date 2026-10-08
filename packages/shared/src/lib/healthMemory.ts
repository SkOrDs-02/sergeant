/**
 * Status: Active
 *
 * Єдиний перелік категорій профілю/памʼяті Сержанта, що несуть дані про
 * здоровʼя (GDPR Art. 9), і розпізнавання «цілі з вагою». Раніше гейт згоди
 * (`healthDataConsent`) знав лише категорію `health`, тож алергії, дієта,
 * тренування й цілі на кшталт «схуднути до 70 кг» йшли в LLM і в RAG без
 * згоди (аудит 2026-10-01, `priv-06`).
 *
 * Споживачі (мають рухатись разом):
 *   - сервер: `chat/healthGate.ts` (контекст, `my_profile`, `remember`),
 *     `ai-memory/healthRows.ts`, `ai-memory/profileMirror.ts`;
 *   - web: `core/lib/hubChatContext/sections.ts` (мітка рядка профілю).
 *
 * Ключі категорій = ключі `CATEGORY_META` у `apps/web/src/core/profile/
 * memoryBank.ts`; збіг міток стереже тест у web.
 *
 * AI-CONTEXT: `goal` — НЕ health за категорією (там і «накопичити на
 * відпустку»), тому окремо дивимось на текст факту (`isWeightGoalFact`).
 * Це евристика за ключовими словами: консервативна (краще зайвий факт без
 * згоди сховати, ніж пропустити вагу). Вільний текст чату вона не
 * фільтрує — це так і сказано в політиці конфіденційності.
 */

/** Категорії, що є даними про здоровʼя самі по собі. */
export const HEALTH_MEMORY_CATEGORIES = [
  "health",
  "allergy",
  "diet",
  "training",
] as const;

export type HealthMemoryCategory = (typeof HEALTH_MEMORY_CATEGORIES)[number];

/** Категорія цілей: health лише тоді, коли факт про вагу/тіло. */
export const GOAL_MEMORY_CATEGORY = "goal";

/** Підписи категорій у контексті чату й `my_profile` (= `CATEGORY_META`). */
export const HEALTH_MEMORY_CATEGORY_LABELS: Readonly<
  Record<HealthMemoryCategory, string>
> = {
  health: "Здоровʼя",
  allergy: "Алергії",
  diet: "Дієта",
  training: "Тренування",
};

/** Підпис категорії `goal` у контексті чату (= `CATEGORY_META.goal`). */
export const GOAL_MEMORY_LABEL = "Цілі";

/**
 * Окремий рядок контексту для цілей про вагу: сервер зрізає його за міткою,
 * не розбираючи факти.
 */
export const WEIGHT_GOAL_CONTEXT_LABEL = "Цілі (вага)";

function normalizeCategory(category: unknown): string {
  return typeof category === "string" ? category.trim().toLowerCase() : "";
}

/** Усі варіанти апострофа в «Здоровʼя» → порівнюємо без нього. */
function normalizeLabel(label: string): string {
  return label
    .replace(/[ʼ’'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const HEALTH_LABEL_SET: ReadonlySet<string> = new Set(
  [
    ...Object.values(HEALTH_MEMORY_CATEGORY_LABELS),
    WEIGHT_GOAL_CONTEXT_LABEL,
  ].map(normalizeLabel),
);
const GOAL_LABEL_NORMALIZED = normalizeLabel(GOAL_MEMORY_LABEL);

/** `true`, якщо сама категорія (нормалізована) — health. */
export function isHealthMemoryCategory(category: unknown): boolean {
  const c = normalizeCategory(category);
  return (HEALTH_MEMORY_CATEGORIES as readonly string[]).includes(c);
}

// Лівий край «слова» без lookbehind (Safari < 16.4 не розбирає `(?<!…)`).
// Корені: вага/кг/схуднути/калорії/маса тіла/вагітність.
const WEIGHT_GOAL_PATTERN = new RegExp(
  "(?:^|[^\\p{L}])(?:" +
    [
      "ваг(?!он)\\p{L}*",
      "кг",
      "kg",
      "кілограм\\p{L}*",
      "схуд\\p{L}*",
      "похуд\\p{L}*",
      "худн\\p{L}*",
      "ожирін\\p{L}*",
      "калор\\p{L}*",
      "ккал",
      "kcal",
      "маса тіла",
      "маси тіла",
      "масу тіла",
      "набір маси",
      "набрат\\p{L}* масу",
      "імт",
      "bmi",
      "weight",
    ].join("|") +
    ")(?![\\p{L}])",
  "iu",
);

/** Чи факт-ціль про вагу/тіло (евристика за ключовими словами). */
export function isWeightGoalFact(fact: unknown): boolean {
  return typeof fact === "string" && WEIGHT_GOAL_PATTERN.test(fact);
}

/**
 * Чи запис профілю/памʼяті несе дані про здоровʼя: health-категорія АБО
 * ціль, у тексті якої йдеться про вагу. `fact` можна опустити, коли відома
 * лише категорія (тоді `goal` — не health).
 */
export function isHealthMemoryEntry(
  category: unknown,
  fact?: unknown,
): boolean {
  if (isHealthMemoryCategory(category)) return true;
  return (
    normalizeCategory(category) === GOAL_MEMORY_CATEGORY &&
    isWeightGoalFact(fact)
  );
}

/**
 * Чи підпис (мітка рядка контексту / тег `[Мітка]` у `my_profile`) належить
 * health-категорії. Апостроф у «Здоровʼя» може бути будь-яким.
 */
export function isHealthProfileLabel(label: string): boolean {
  return HEALTH_LABEL_SET.has(normalizeLabel(label));
}

/** Чи це підпис нейтральної категорії `goal` («Цілі»): факти дивимось по одному. */
export function isGoalProfileLabel(label: string): boolean {
  return normalizeLabel(label) === GOAL_LABEL_NORMALIZED;
}
