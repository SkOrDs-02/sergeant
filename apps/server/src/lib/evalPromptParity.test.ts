/**
 * Гейт спеки `ai-eval-harness-v2.md` § Верифікація п.1: промпт, який подає
 * стенд, має бути ТИМ САМИМ, що будує прод.
 *
 * AI-CONTEXT: без цього тесту спека не має сенсу — саме розходження копії
 * промпта в стенді з продовим текстом і зробило попередній бенчмарк
 * недійсним (моделі відповідали «Записую транзакцію…», бо міряли не той
 * промпт). Тест живе у `src/`, бо vitest бачить лише тести під `src/`;
 * імпорт зі `scripts/` заодно затягує стенд у `tsc --noEmit`.
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { PIPELINES } from "../../scripts/eval/pipelines.js";
import { FIXTURES } from "../../scripts/eval/pipelines.finance.js";
import { NUTRITION_FIXTURES } from "../../scripts/eval/pipelines.nutrition.js";
import { ADVICE_BOUNDARY_RULE } from "./adviceBoundary.js";
import { buildCategorizePrompt } from "../routes/internal/categorize.js";
import { buildWeeklyDigestPrompt } from "../modules/digest/weekly-digest.js";
import { buildCoachInsightPrompt } from "../modules/chat/coach.js";
import { buildBatchPrompt } from "./mcc/batchPrompt.js";
import { buildDayPlanPrompt } from "../modules/nutrition/day-plan.js";
import { buildWeekPlanPrompt } from "../modules/nutrition/week-plan.js";
import { buildShoppingListPrompt } from "../modules/nutrition/shopping-list.js";
import { buildRecommendRecipesPrompt } from "../modules/nutrition/recommend-recipes.js";
import { buildParsePantryPrompt } from "../modules/nutrition/parse-pantry.js";
import { SYSTEM_PREFIX } from "../modules/chat/toolDefs/systemPrompt.js";

const byKey = (key: string) => {
  const pipeline = PIPELINES.find((p) => p.key === key);
  if (!pipeline) throw new Error(`пайплайн ${key} зник зі стенду`);
  return pipeline;
};

describe("стенд моделей подає продові промпти", () => {
  it("кожен пайплайн має кейси й посилання на продовий білдер", () => {
    for (const pipeline of PIPELINES) {
      expect(
        pipeline.cases.length,
        `${pipeline.key}: голден-сет порожній`,
      ).toBeGreaterThan(0);
      expect(pipeline.promptOrigin, `${pipeline.key}`).toMatch(
        /::|SYSTEM_PREFIX/,
      );
    }
  });

  it("кожен кейс формулює пастку до судді", () => {
    // Порядок «спершу пастка, потім суддя» — вимога спеки. Порожній `trap`
    // означає, що суддя написаний під наявну відповідь, а не під задачу.
    for (const pipeline of PIPELINES) {
      for (const c of pipeline.cases) {
        expect(
          c.trap.length,
          `${pipeline.key}/${c.name}: пастка не сформульована`,
        ).toBeGreaterThan(30);
      }
    }
  });

  it("жоден system не є рукописною заглушкою", () => {
    // Заглушки попередньої ітерації були однорядковими («Класифікуй
    // повідомлення… Відповідай ЛИШЕ одним словом»). Продові промпти —
    // сотні символів із блоками правил.
    for (const pipeline of PIPELINES) {
      if (pipeline.system === undefined) continue;
      expect(
        pipeline.system.length,
        `${pipeline.key}: system підозріло короткий — схоже на заглушку`,
      ).toBeGreaterThan(200);
    }
  });

  it("classify — байт у байт з buildCategorizePrompt", () => {
    expect(byKey("classify").system).toBe(
      buildCategorizePrompt({ description: "x" }).system,
    );
  });

  it("digest — байт у байт з buildWeeklyDigestPrompt", () => {
    const prod = buildWeeklyDigestPrompt(FIXTURES.digestBase);
    expect(byKey("digest").system).toBe(prod.system);
    expect(byKey("digest").cases[0]?.user).toBe(prod.user);
    // Дайджест — user-facing порада, межа порад має доїхати до моделі.
    expect(byKey("digest").system).toContain(ADVICE_BOUNDARY_RULE);
  });

  it("mono — байт у байт з buildBatchPrompt", () => {
    const prod = buildBatchPrompt(FIXTURES.monoCleanBatch);
    expect(byKey("mono").system).toBe(prod.system);
    expect(byKey("mono").cases[0]?.user).toBe(prod.user);
    // Другий кейс — інша партія: рукописний JSON тут дав би моделі інші
    // індекси, ніж ті, за якими `parseBatchResponse` шукає відповідь.
    expect(byKey("mono").cases[1]?.user).toBe(
      buildBatchPrompt(FIXTURES.monoDirtyBatch).user,
    );
  });

  it("mono — прод-воркер не будує промпт локально", async () => {
    // Байт-у-байт вище зловить розбіжність лише поки прод бере промпт із
    // того самого білдера. Варто комусь зашити текст назад у воркер — і
    // стенд знову міряв би не той промпт, а попередній тест лишався б
    // зеленим. Гейт саме на це.
    const source = await readFile(
      new URL("../modules/mono/batchEnrichmentWorker.ts", import.meta.url),
      "utf-8",
    );
    expect(source).toContain("buildBatchPrompt(items)");
    expect(source, "інлайновий system у воркері").not.toMatch(
      /system:\s*[`"']/,
    );
  });

  it("coach-insight — байт у байт з buildCoachInsightPrompt", () => {
    // Прод шле все user-реплікою без `system`; стенд має дзеркалити саме це.
    expect(byKey("coach-insight").system).toBeUndefined();
    expect(byKey("coach-insight").cases[0]?.user).toContain(
      ADVICE_BOUNDARY_RULE,
    );
    expect(
      buildCoachInsightPrompt({ snapshot: {}, memory: null }).user,
    ).toContain(ADVICE_BOUNDARY_RULE);
  });

  it("chat і analysis — на SYSTEM_PREFIX (v14), не на заглушці", () => {
    expect(byKey("chat").system).toBe(SYSTEM_PREFIX);
    expect(byKey("analysis").system).toBe(SYSTEM_PREFIX);
  });

  it("нутриційні — байт у байт з продовими білдерами", () => {
    expect(byKey("day-plan").system).toBe(
      buildDayPlanPrompt(NUTRITION_FIXTURES.dayPlanBase).system,
    );
    expect(byKey("week-plan").system).toBe(
      buildWeekPlanPrompt(NUTRITION_FIXTURES.weekPlanBase).system,
    );
    expect(byKey("shopping-list").system).toBe(
      buildShoppingListPrompt(NUTRITION_FIXTURES.shoppingBase).system,
    );
    expect(byKey("recommend-recipes").system).toBe(
      buildRecommendRecipesPrompt(NUTRITION_FIXTURES.recipesBase).system,
    );
    expect(byKey("parse-pantry").system).toBe(
      buildParsePantryPrompt({
        text: NUTRITION_FIXTURES.pantryRaw,
        locale: "uk-UA",
      }).system,
    );
  });

  it("покриває всі текстові AI-шляхи з інвентарю endpoint:", () => {
    // Джерело істини — `grep -rhoE 'endpoint: "[^"]+"' apps/server/src`.
    // Свідомо поза списком: `chat-stream`/`chat-tool-result` (той самий
    // промпт, інший транспорт — `pnpm eval:stream`), `embed` (Voyage, не
    // LLM-роутинг), `analyze-photo`/`refine-photo` (зоровий стенд).
    const expected = [
      "classify",
      "digest",
      "mono",
      "coach-insight",
      "chat",
      "analysis",
      "day-plan",
      "week-plan",
      "shopping-list",
      "recommend-recipes",
      "parse-pantry",
    ];
    expect(PIPELINES.map((p) => p.key).sort()).toEqual([...expected].sort());
  });
});
