/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Реєстр системних промптів і те, чи зобовʼязані вони нести межу порад.
 *
 * AI-CONTEXT: цей тест сканує ДЖЕРЕЛА, а не звіряється з рукописним
 * списком. Рукописний список старіє мовчки: новий промпт просто не
 * потрапляє в нього, тест лишається зеленим, а межа не застосована —
 * рівно та форма хибної впевненості, через яку в цьому репо вже жила не
 * одна знахідка. Тут навпаки: нерозпізнаний промпт **валить** тест і
 * змушує автора свідомо його класифікувати.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADVICE_BOUNDARY_RULE, hasAdviceBoundary } from "./adviceBoundary.js";

const MODULES_DIR = join(import.meta.dirname, "..", "modules");

/**
 * Промпти, що спілкуються з користувачем порадами — межа обовʼязкова.
 * Ключ — шлях відносно `src/modules`.
 */
const ADVICE_PROMPTS = new Set([
  "chat/toolDefs/systemPrompt.ts",
  "chat/coach.ts",
  "digest/weekly-digest.ts",
  "nutrition/day-plan.ts",
  "nutrition/week-plan.ts",
  "nutrition/recommend-recipes.ts",
]);

/**
 * Промпти-екстрактори: модель повертає структуровані дані і не звертається
 * до користувача. Межа тут була б мертвим текстом у prompt-cache-префіксі,
 * тому свідомо не додається — з причиною на кожен запис.
 */
const EXTRACTION_PROMPTS = new Map([
  ["nutrition/parse-pantry.ts", "розбирає текст комори у JSON"],
  ["nutrition/analyze-photo.ts", "оцінює КБЖВ із фото, повертає числа"],
  ["nutrition/refine-photo.ts", "уточнює попередню оцінку фото"],
  ["nutrition/shopping-list.ts", "групує позиції списку покупок"],
  ["mono/batchEnrichmentWorker.ts", "категоризує транзакції, JSON-вихід"],
  [
    "finyk/receipts/prompts.ts",
    "розпізнає товарний чек із фото (чек-скан v1 vision-fallback), повертає структурований JSON магазину/сум/позицій — не поради",
  ],
  [
    "finyk/import/prompts.ts",
    "розпізнає скрін банкінгу з фото (масове ведення, Фаза 2а), повертає структурований JSON doc_type/bank/транзакцій-рядків — не поради",
  ],
  [
    "chat/toolEval/judge.ts",
    "суддя стенду евалу: віддає один рядок вердикту «ОК/ПОГАНО: причина» у звіт прогону і до користувача не потрапляє взагалі — межа порад тут була б мертвим текстом",
  ],
]);

/**
 * Файли, які скан ловить за `system:`, але власного тексту промпта не
 * мають — вони його лише передають далі. Межа доїжджає до користувача
 * через той промпт, який вони споживають.
 */
const PROMPT_CONSUMERS = new Map([
  ["chat/chat.ts", "кличе buildSystem() — межа приходить із SYSTEM_PREFIX"],
  [
    "chat/chatResponseCache.ts",
    "`system: unknown` — поле ключа кешу, не промпт",
  ],
  [
    "finyk/receipts/visionClient.ts",
    "передає RECEIPT_VISION_SYSTEM_PROMPT з prompts.ts у payload.system — сам тексту не визначає",
  ],
  [
    "finyk/import/visionClient.ts",
    "передає IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT з prompts.ts у payload.system — сам тексту не визначає",
  ],
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/** Файли, що реально будують системний промпт для Anthropic/OpenRouter. */
function findPromptFiles(): string[] {
  return walk(MODULES_DIR)
    .filter((full) => {
      const src = readFileSync(full, "utf8");
      // Три сигнатури + одна змістова. Змістова тут не для краси:
      // `SYSTEM_PREFIX` будується функцією `buildSystemPrompt()` і не має
      // ані `system:`, ані `const SYSTEM` — тобто три перші патерни
      // проґавили найголовніший промпт репо. Спіймала це саме перевірка
      // на привидів нижче; без неї реєстр «покривав» файл, якого скан не
      // бачив. Кожен промпт у репо відкривається зверненням «Ти …» —
      // це найстабільніша ознака, яку має сенс ловити.
      return (
        /^\s*system:\s/m.test(src) ||
        // `export ` тут обовʼязковий у патерні: промпти винесені в
        // експортовані константи/білдери, щоб стенд моделей
        // (`scripts/eval/`) споживав прод-текст, а не свою копію. Без
        // альтернативи скан переставав бачити рівно ті файли, заради яких
        // реєстр і існує, і мовчки рахував їх привидами.
        /^(?:export )?const SYSTEM\b/m.test(src) ||
        /^\s*const systemPrompt = `/m.test(src) ||
        /`Ти [А-ЯІЇЄҐа-яіїєґ]/.test(src)
      );
    })
    .map((full) => full.slice(MODULES_DIR.length + 1).replaceAll("\\", "/"));
}

describe("межа порад у системних промптах", () => {
  const found = findPromptFiles();

  it("кожен знайдений промпт класифіковано — реєстр не старіє мовчки", () => {
    // Порівнюємо МНОЖИНИ, а не кількості: збіг довжин нічого не доводить,
    // і саме на цьому я вже колись обпікся.
    const classified = new Set([
      ...ADVICE_PROMPTS,
      ...EXTRACTION_PROMPTS.keys(),
      ...PROMPT_CONSUMERS.keys(),
    ]);
    const unclassified = found.filter((f) => !classified.has(f));
    expect(unclassified).toEqual([]);

    // Дзеркальна перевірка: у реєстрі немає привидів — записів про файли,
    // які вже видалили або перейменували.
    const foundSet = new Set(found);
    const ghosts = [...classified].filter((f) => !foundSet.has(f));
    expect(ghosts).toEqual([]);
  });

  it.each([...ADVICE_PROMPTS])("%s несе межу порад", (rel) => {
    // Робить неможливим стан, у якому промпт радить користувачу, не маючи
    // жодної межі — саме так було до 2026-07-25 в УСІХ одинадцяти.
    const src = readFileSync(join(MODULES_DIR, rel), "utf8");
    expect(src).toContain("ADVICE_BOUNDARY_RULE");
  });

  it("межа проведена так, щоб плани харчування лишались можливими", () => {
    // Застереження в докстрінгу `adviceBoundary.ts`: надто сувора межа
    // тихо вимикає day-plan / week-plan. Цей асерт ловить посилення
    // формулювання до заборони харчових рекомендацій як таких.
    expect(ADVICE_BOUNDARY_RULE).toMatch(
      /загальні рекомендації з харчування та навантаження/,
    );
  });

  it("забороняє саме те, що вирішив founder", () => {
    expect(ADVICE_BOUNDARY_RULE).toMatch(/діагноз/);
    expect(ADVICE_BOUNDARY_RULE).toMatch(/доз/);
    expect(ADVICE_BOUNDARY_RULE).toMatch(/інвестиц/);
    // …і дозволяє констатацію власних даних
    expect(ADVICE_BOUNDARY_RULE).toMatch(/недобираєш білка/);
  });

  it("hasAdviceBoundary розпізнає зібраний промпт", () => {
    expect(hasAdviceBoundary(`префікс\n${ADVICE_BOUNDARY_RULE}\nсуфікс`)).toBe(
      true,
    );
    expect(hasAdviceBoundary("промпт без межі")).toBe(false);
  });
});
