/**
 * Канонічний реєстр гліфів Рутини — DOM-free.
 *
 * AI-CONTEXT: до 2026-08-03 звички й категорії носили довільний emoji-рядок,
 * який користувач набирав руками (`Input placeholder="🏠"`) або обирав із
 * 16-елементного emoji-пікера. Це давало три проблеми: рендер залежав від
 * системного emoji-шрифту (різний вигляд на iOS / Android / Windows), гліф не
 * підхоплював тему й `currentColor`, і в поле можна було вписати будь-що —
 * включно з текстом, який ламав верстку рядка.
 *
 * Тепер гліф — це **slug із закритого набору**, що збігається з іменем іконки
 * у дизайн-системі (`apps/web/src/shared/components/ui/Icon.tsx`). Патерн
 * дзеркалить `apps/web/src/modules/finyk/components/manualExpenseCategories.ts`
 * (ери «сирий label» → «emoji-префікс» → «slug»): історичні записи НЕ
 * мігруються батчем у БД, натомість `upgradeHabitGlyph()` нормалізує їх на
 * кожному читанні (`normalizeHabit` / `normalizeRoutineState`), а наступний
 * запис (дуал-райт / sync) закріплює slug на диску.
 *
 * AI-DANGER: поле в persistence-шарі досі зветься `emoji` (колонка `emoji` в
 * `packages/db-schema/src/{pg,sqlite}/routine.ts` і в sync-контракті сервера).
 * Перейменування колонки — окрема двофазна міграція (Hard Rule #4) і окремий
 * PR; тут змінюється лише ВМІСТ поля. Не покладайся на те, що там emoji.
 */

/**
 * Закритий набір гліфів. Кожен slug — валідне імʼя іконки дизайн-системи;
 * `apps/web/src/modules/routine/lib/habitGlyphs.ts` перевіряє це на етапі
 * компіляції (`satisfies readonly IconName[]`), тож розсинхрон не доїде
 * до рантайму.
 */
export const ROUTINE_GLYPHS = [
  // Загальні / прогрес
  "check",
  "target",
  "flame",
  "award",
  "sparkles",
  "lightbulb",
  // Здоровʼя і тіло
  "droplet",
  "run",
  "dumbbell",
  "activity",
  "heart",
  "scale",
  // Їжа
  "utensils",
  "egg",
  "coffee",
  "leaf",
  "shopping-cart",
  "package",
  // Розум і навчання
  "brain",
  "book-open",
  "pen",
  "monitor",
  "camera",
  "file-text",
  // Час і побут
  "clock",
  "bell",
  "calendar-check",
  "moon",
  "sun",
  "home",
  "briefcase",
  "truck",
  "piggy-bank",
  "shield",
  "tool",
  "message-circle",
] as const;

export type RoutineGlyph = (typeof ROUTINE_GLYPHS)[number];

/** Гліф за замовчуванням — використовується, коли запис не має свого. */
export const DEFAULT_ROUTINE_GLYPH: RoutineGlyph = "check";

const GLYPH_SET: ReadonlySet<string> = new Set(ROUTINE_GLYPHS);

/**
 * Легасі-мапа: emoji, які реально зустрічаються у збережених даних, →
 * найближчий slug. Джерела: старий `EMOJI_SUGGESTIONS` пікера звички,
 * placeholder категорії (`🏠`), демо-сід онбордингу, дефолти чат-тулів
 * (`add_habit` / `add_calendar_event`) і найчастіші ручні варіанти.
 *
 * Ключі зберігаються БЕЗ variation selector (`U+FE0F`) — `upgradeHabitGlyph`
 * зрізає його перед пошуком, тож `✍️` і `✍` дають один результат.
 */
const LEGACY_EMOJI_TO_GLYPH: Readonly<Record<string, RoutineGlyph>> = {
  // check
  "✓": "check",
  "✔": "check",
  "✅": "check",
  "☑": "check",
  "🆗": "check",
  // target / progress
  "🎯": "target",
  "🔥": "flame",
  "🏆": "award",
  "🥇": "award",
  "🎖": "award",
  "⭐": "sparkles",
  "🌟": "sparkles",
  "✨": "sparkles",
  "💡": "lightbulb",
  // body
  "💧": "droplet",
  "🚰": "droplet",
  "🥤": "droplet",
  "🚶": "run",
  "🏃": "run",
  "🤸": "run",
  "🚴": "run",
  "💪": "dumbbell",
  "🏋": "dumbbell",
  "🤾": "activity",
  "❤": "heart",
  "💊": "heart",
  "🩺": "heart",
  "🏥": "heart",
  "⚖": "scale",
  // food
  "🍴": "utensils",
  "🥗": "utensils",
  "🍎": "utensils",
  "🍏": "utensils",
  "🍔": "utensils",
  "🍬": "utensils",
  "🍩": "utensils",
  "🥦": "leaf",
  "🥕": "leaf",
  "🥒": "leaf",
  "🍅": "leaf",
  "🥩": "utensils",
  "🍗": "utensils",
  "🍞": "utensils",
  "🥛": "droplet",
  "🥚": "egg",
  "☕": "coffee",
  "🍵": "coffee",
  "🧘": "leaf",
  "🌱": "leaf",
  "🛒": "shopping-cart",
  "📦": "package",
  // mind
  "🧠": "brain",
  "📖": "book-open",
  "📚": "book-open",
  "📕": "book-open",
  "📗": "book-open",
  "✍": "pen",
  "✏": "pen",
  "📝": "pen",
  "🖊": "pen",
  "🎨": "pen",
  "💻": "monitor",
  "🖥": "monitor",
  "📱": "monitor",
  "🎬": "monitor",
  "📷": "camera",
  "📸": "camera",
  "📄": "file-text",
  "📃": "file-text",
  // time & life
  "⏰": "clock",
  "🕐": "clock",
  "⌛": "clock",
  "⏳": "clock",
  "🔔": "bell",
  "📅": "calendar-check",
  "🗓": "calendar-check",
  "🌙": "moon",
  "😴": "moon",
  "🛌": "moon",
  "☀": "sun",
  "🌞": "sun",
  "🏠": "home",
  "🏡": "home",
  "🧹": "home",
  "💼": "briefcase",
  "🚗": "truck",
  "🚙": "truck",
  "💰": "piggy-bank",
  "💸": "piggy-bank",
  "💳": "piggy-bank",
  "🐷": "piggy-bank",
  "🛡": "shield",
  "🔒": "shield",
  "🔧": "tool",
  "🛠": "tool",
  "💬": "message-circle",
  "📞": "message-circle",
};

/** Variation selectors + skin-tone modifiers, які не несуть семантики. */
const EMOJI_NOISE_RE = /[︎️‍]|[\u{1F3FB}-\u{1F3FF}]/gu;

/**
 * Чи є значення вже канонічним slug-ом.
 *
 * Використовуй перед рендером «як текст» — сирий slug ніколи не має
 * потрапляти в копію для користувача (наприклад у заголовок пуша).
 */
export function isRoutineGlyph(value: unknown): value is RoutineGlyph {
  return typeof value === "string" && GLYPH_SET.has(value);
}

/**
 * Read-time нормалізатор: `slug | emoji | сміття` → канонічний slug.
 *
 * - валідний slug повертається як є;
 * - відоме emoji мапиться на найближчий slug;
 * - порожнє / невідоме значення дає `undefined`, і споживач малює
 *   `DEFAULT_ROUTINE_GLYPH`. Ми навмисно НЕ зберігаємо невідоме emoji далі:
 *   рівно це і є міграція даних, якої вимагає перехід на іконки.
 */
export function upgradeHabitGlyph(raw: unknown): RoutineGlyph | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (GLYPH_SET.has(trimmed)) return trimmed as RoutineGlyph;

  const stripped = trimmed.replace(EMOJI_NOISE_RE, "");
  const direct = LEGACY_EMOJI_TO_GLYPH[stripped];
  if (direct) return direct;

  // Складені emoji («🏃‍♂️» → після зняття ZWJ/модифікаторів «🏃♂») — беремо
  // перший code point, який ми знаємо.
  for (const char of stripped) {
    const mapped = LEGACY_EMOJI_TO_GLYPH[char];
    if (mapped) return mapped;
  }
  return undefined;
}

/**
 * Гліф для рендера: нормалізує та підставляє дефолт. Використовуй у UI,
 * коли треба щось намалювати завжди.
 */
export function resolveHabitGlyph(raw: unknown): RoutineGlyph {
  return upgradeHabitGlyph(raw) ?? DEFAULT_ROUTINE_GLYPH;
}
