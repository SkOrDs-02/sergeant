/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Бюджет prompt-cache префікса `/api/chat`.
 *
 * AI-CONTEXT: до 2026-07-25 розмір префікса ніхто не міряв, а докстрінг у
 * `promptCache.ts` роками стверджував «~19 інструментів, ~6000+ токенів».
 * Фактично було 77 і 14 400-21 200. На тій цифрі вже було побудовано
 * заниження unit-економіки. Проблема не в тому, що хтось помилився, а в
 * тому, що ЦИФРА В КОМЕНТАРІ НЕ ЛАМАЄТЬСЯ, коли реальність від неї
 * відходить. Цей файл робить її ламкою.
 *
 * Що саме асерти нижче роблять неможливим: тихе повернення префікса до
 * попереднього розміру. Додати інструмент у `HOT_TOOL_NAMES`, роздути опис
 * гарячого інструмента, чи випадково зняти `defer_loading` з усього масиву
 * — кожен із цих шляхів веде назад до 43 КБ у КОЖНОМУ запиті, і жоден із
 * них не проявився б ані в типах, ані в жодному іншому тесті.
 *
 * Байти, не токени: рахувати токени без токенізатора неможливо, а байти
 * стабільні й монотонно повʼязані з ціною. Перевідні коефіцієнти (кирилиця
 * ~1.4-2.4 симв/токен, ASCII ~3.2-4.0) — у
 * `docs/01-product/launch/business/01-monetization-and-pricing.md` § 9.5.
 */
import { describe, it, expect } from "vitest";

import { buildToolsPayload } from "./promptCache.js";
import { SYSTEM_PREFIX, TOOLS } from "./tools.js";

/**
 * Стеля на те, що реально їде в контекстне вікно на КОЖНОМУ запиті:
 * не-deferred tools + `SYSTEM_PREFIX`.
 *
 * Вимір 2026-07-25: 7 564 B (проти 46 440 B до tool search, −84%).
 * Ліміт 9 000 B — це ~19% запасу: вистачить на один новий гарячий
 * інструмент або на розширення системного промпта, і замало, щоб непомітно
 * повернути в контекст цілий домен.
 *
 * Піднімати ліміт можна — але тим самим PR-ом, свідомо, з новим числом у
 * § 9.5 монетизації. Саме цього ритуалу бракувало раніше.
 */
const CONTEXT_PREFIX_BUDGET_BYTES = 9_000;

/** Вимір 2026-07-25, зафіксований як точка відліку для наступного аудиту. */
const MEASURED_2026_07_25 = {
  legacyPrefixBytes: 46_440,
  toolSearchPrefixBytes: 7_564,
} as const;

function contextPrefixBytes(model: string): number {
  const payload = buildToolsPayload(model) as Array<Record<string, unknown>>;
  const inContext = payload.filter((t) => t["defer_loading"] !== true);
  return JSON.stringify(inContext).length + SYSTEM_PREFIX.length;
}

describe("бюджет prompt-cache префікса", () => {
  it("контекстний префікс тримається в бюджеті на обох моделях чату", () => {
    for (const model of ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"]) {
      expect(contextPrefixBytes(model)).toBeLessThanOrEqual(
        CONTEXT_PREFIX_BUDGET_BYTES,
      );
    }
  });

  it("tool search дає щонайменше 70% економії проти legacy-payload", () => {
    // Асерт не на абсолют, а на ЕФЕКТ: якщо хтось зніме `defer_loading`
    // або роздує гарячий набір до половини реєстру, економія просяде
    // раніше, ніж впаде абсолютний бюджет. 70% — з запасом під виміряні 84%.
    const legacy = JSON.stringify(TOOLS).length + SYSTEM_PREFIX.length;
    const actual = contextPrefixBytes("claude-sonnet-4-6");
    expect(1 - actual / legacy).toBeGreaterThanOrEqual(0.7);
  });

  it("реєстр не всох і не вибухнув — вимір 2026-07-25 лишається в силі", () => {
    // Дзеркальний асерт: бюджет ловить ЗРОСТАННЯ, цей ловить те, що
    // зафіксований вимір розійшовся з реальністю в будь-який бік (напр.
    // половину інструментів видалили, і «економія» стала артефактом).
    const legacy = JSON.stringify(TOOLS).length + SYSTEM_PREFIX.length;
    expect(legacy).toBeGreaterThan(MEASURED_2026_07_25.legacyPrefixBytes * 0.8);
    expect(contextPrefixBytes("claude-sonnet-4-6")).toBeGreaterThan(
      MEASURED_2026_07_25.toolSearchPrefixBytes * 0.5,
    );
  });

  it("деферяться не з бюджету, а по списку — повний реєстр усе одно в payload", () => {
    // Захист від «оптимізації», що ріже масив під бюджет: API потрібні всі
    // схеми server-side. Бюджет має триматись за рахунок defer_loading,
    // НЕ за рахунок викидання дефініцій.
    expect(buildToolsPayload("claude-sonnet-4-6")).toHaveLength(
      TOOLS.length + 1,
    );
  });
});
