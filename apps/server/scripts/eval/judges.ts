/**
 * Судді стенду. Два різні класи, і плутати їх не можна:
 *
 *  * **Структурні** (`parsesAs*`) — проганяють відповідь через ТОЙ САМИЙ
 *    парсер/схему, що й прод. Це не евристика: якщо `parseCategory` віддав
 *    `other/0`, прод справді записав би сміття в БД. Таким суддям можна
 *    вірити без читання очима.
 *  * **Евристичні** (`mentions`, `nonEmptyUk`) — лише звужують, що читати
 *    очима. Вони помиляються в обидва боки й НЕ ухвалюють рішення; звіт
 *    зобовʼязаний друкувати повний текст там, де кандидат розійшовся з
 *    базовою моделлю (спека § Евристичний суддя не ухвалює рішення).
 */

import type { z } from "zod";
import { WeeklyDigestReportSchema } from "@sergeant/shared";
import {
  parseCategory,
  type Category,
} from "../../src/routes/internal/categorize.js";
import { extractJsonFromText } from "../../src/http/jsonSafe.js";
import { extractJsonObject } from "../../src/modules/digest/weekly-digest.js";
import {
  normalizePantryItems,
  normalizeRecipes,
} from "../../src/lib/nutritionResponse.js";

/**
 * Судді на голос — окремо від `judge`, бо міряють іншу вісь: `judge` питає
 * «чи відповідь по суті», голос — «чи вона написана як наш продукт».
 * Правила дзеркалять `VOICE_RULE` із системного промпта (v14).
 *
 * AI-DANGER: межі слова тут не декоративні. Наївний `/Ви|Ваш/` ловить
 * «Витрати», «Виявив», «Вашингтон» — а це якраз ті слова, які модель пише
 * найчастіше. Лишай lookaround-и на `\p{L}` з обох боків.
 */
const VOICE_RULES: ReadonlyArray<{ id: string; violation: RegExp }> = [
  {
    id: "Ви",
    violation:
      /(?<!\p{L})(ви|вам|вас|вами|ваш(?:а|е|і|ого|ому|им|ими|их|ій|ої|у|ою)?)(?!\p{L})/iu,
  },
  { id: "емодзі", violation: /\p{Extended_Pictographic}/u },
  {
    // Нумерований список `1.` — теж розмітка: `AssistantMessageBody` рендерить
    // його як <ol>, а мобільний показує сирим. Без цієї гілки суддя пропускав
    // найчастішу з реальних відповідей форму — перелік кроків.
    id: "markdown",
    violation:
      /\*\*|__|`|^\s*[-*+]\s|^\s*\d+\.\s|^\s*#{1,6}\s|\[[^\]]+\]\([^)]+\)/m,
  },
  {
    // `z-ai/glm-4.7-flash` видав «За цей місяць МІЙ баланс вийшов відʼємним» —
    // застосував правило 1-ї особи до грошей користувача. Решта суддів це
    // пропускала: «Ви» немає, емодзі немає, розмітки немає. Присвійні
    // займенники 1-ї особи асистент не має права вживати про чужі дані;
    // «я можу», «мені потрібно» лишаються дозволеними, бо це не присвійність.
    id: "чужа особа",
    violation:
      /(?<!\p{L})(мій|моя|моє|мої|мого|моєї|моїх|моїм|моєму)(?!\p{L})/iu,
  },
];

/** Порушені правила голосу; порожній масив = чисто. */
export function voiceViolations(text: string): string[] {
  return VOICE_RULES.filter((r) => r.violation.test(text)).map((r) => r.id);
}

/**
 * Складає репліку так, як її бачить етап синтезу в проді: питання користувача
 * плюс УЖЕ отримані результати інструмента в тому самому envelope, що ставить
 * `wrapAndScanToolResults` (`<tool_output tool="…">`).
 *
 * AI-CONTEXT: без envelope голден-сет подавав самі цифри — і модель читала їх
 * як прохання щось записати. Звідси бралися відповіді «Записую транзакцію…» і
 * навіть сирий `<tool_call>{…}` у видимому тексті: промпт каже «для запису
 * виклич інструмент», інструментів стенд не передає, тож модель писала виклик
 * прозою. Синтез за визначенням іде ПІСЛЯ інструментів — репліка має це
 * показувати, інакше стенд міряє не той крок конвеєра.
 */
export function synthesisTurn(
  question: string,
  tool: string,
  output: string,
): string {
  return `${question}\n\n<tool_output tool="${tool}">${output}</tool_output>`;
}

export const nonEmptyUk = (text: string): boolean =>
  text.trim().length > 3 && /[Ѐ-ӿ]/.test(text);

/** Той самий предикат, але як вердикт пайплайну — з причиною замість `false`. */
export const nonEmptyUkVerdict = (text: string): boolean | string =>
  nonEmptyUk(text) || "порожня або не українська відповідь";

/** Найгірший режим відмови на порожньому вході: вигадані суми. */
export const noInventedAmounts = (text: string): boolean | string => {
  if (!nonEmptyUk(text)) return "порожня або не українська відповідь";
  // Роки — не суми. `gemini-2.5-flash-lite` написав «почни з 2026 року» і
  // отримав «вигадав суму 2026»; дата в тексті коуча законна, а порожній вхід
  // вона не порушує. Вирізаємо 19xx/20xx перед пошуком, а не після — інакше
  // перший збіг регексу все одно впаде на рік.
  const withoutYears = text.replace(/(?<!\d)(19|20)\d{2}(?!\d)/g, "");
  const made = withoutYears.match(/\d{3,}/);
  return made === null || `вигадав суму ${made[0]} — даних у вході немає`;
};

/**
 * `label` — що саме шукали, людською мовою. Без нього провал регексу читається
 * як вирок моделі, хоча найчастіше це промах словоформи: коуч написав
 * «звички просіли до 29%», а регекс шукав корінь `просід` і завалив правильну
 * відповідь. Рядок у звіті робить такий промах видимим одразу.
 */
export const mentions =
  (re: RegExp, label?: string) =>
  (text: string): boolean | string => {
    if (!nonEmptyUk(text)) return "порожня або не українська відповідь";
    return re.test(text) || `не знайдено ${label ?? re.source}`;
  };

// ── Структурні судді ────────────────────────────────────────────────

/**
 * Прод-парсер per-row категоризації. Він фейл-софтить у `{other, 0}` на
 * будь-якому промаху, тож «модель відповіла сміттям» і «модель чесно не
 * знає» ззовні виглядають однаково — саме тому суддя дивиться і на
 * категорію, і на впевненість.
 */
export const categoryIs =
  (expected: Category[], opts: { maxConfidence?: number } = {}) =>
  (text: string): boolean => {
    const parsed = parseCategory(text);
    if (!expected.includes(parsed.category)) return false;
    if (opts.maxConfidence != null && parsed.confidence > opts.maxConfidence) {
      return false;
    }
    return true;
  };

/**
 * Дайджест зобовʼязаний пройти `WeeklyDigestReportSchema` — рівно ту схему,
 * якою прод валідує відповідь перед віддачею клієнту, і рівно тим самим
 * екстрактором. Не пройшла → прод віддав би 502 або тихо підмінив шаблоном.
 */
export function digestParses(text: string): boolean {
  return digestReport(text) !== null;
}

/** Той самий предикат як вердикт пайплайну — з наслідком замість `false`. */
export const digestParsesVerdict = (text: string): boolean | string =>
  digestParses(text) ||
  "не пройшов WeeklyDigestReportSchema — прод віддав би 502";

/** Розібраний звіт або `null` — рівно те, що побачив би прод-хендлер. */
export function digestReport(
  text: string,
): z.infer<typeof WeeklyDigestReportSchema> | null {
  const parsed = WeeklyDigestReportSchema.safeParse(extractJsonObject(text));
  return parsed.success ? parsed.data : null;
}

export function asRecord(text: string): Record<string, unknown> | null {
  const parsed = extractJsonFromText(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/** Прод-нормалізатор комори: скільки позицій реально доїхало б до клієнта. */
export const pantryItems = (text: string) =>
  normalizePantryItems(extractJsonFromText(text));

/** Прод-нормалізатор рецептів. */
export const recipes = (text: string) =>
  normalizeRecipes(extractJsonFromText(text));

/** Нормалізація для порівняння назв продуктів між пасткою і відповіддю. */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[ʼ'`]/g, "'").replace(/\s+/g, " ").trim();
}
