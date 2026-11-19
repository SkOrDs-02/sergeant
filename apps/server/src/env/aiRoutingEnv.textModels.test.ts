/**
 * Дефолтні моделі непотокових шляхів шлюзу (рішення власника 2026-11-19).
 *
 * Текстові пайплайни (дайджест, категоризація, Mono-збагачення, текстова
 * нутриція: день, тиждень, список покупок, рецепти, розбір комори) переходять
 * на `google/gemini-3.5-flash-lite`: на стенді 71/75 проти 51/57 і 18 відмов
 * 429 з 75 у `gemini-2.5-flash-lite` (`docs/work/research/2026-11-19-openrouter-new-models.md`
 * § 6.4). Зір нутриції, чеки й імпорт виписок лишаються на
 * `gemini-2.5-flash-lite`: на фото 3.5 гірша (12/18, перерахунок порції 0/3).
 * Тест тримає обидві половини рішення, щоб заміна однієї не протягла іншу.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { aiRoutingEnvShape } from "./aiRoutingEnv.js";

const parsed = z.object(aiRoutingEnvShape).parse({});

describe("дефолти моделей шляхів шлюзу", () => {
  it.each([
    ["OPENROUTER_READONLY_MODEL", "категоризація"],
    ["OPENROUTER_DIGEST_MODEL", "тижневий дайджест"],
    ["OPENROUTER_MONO_MODEL", "Mono-збагачення"],
    ["OPENROUTER_NUTRITION_MODEL", "текстова нутриція"],
  ] as const)("%s (%s) — google/gemini-3.5-flash-lite", (slot, _what) => {
    expect(parsed[slot]).toBe("google/gemini-3.5-flash-lite");
  });

  it.each([
    ["OPENROUTER_VISION_MODEL", "analyze-photo, refine-photo"],
    ["OPENROUTER_RECEIPT_MODEL", "чеки й імпорт скриншотів виписок"],
  ] as const)(
    "%s (%s) лишається на google/gemini-2.5-flash-lite",
    (slot, _what) => {
      expect(parsed[slot]).toBe("google/gemini-2.5-flash-lite");
    },
  );

  it("явне значення в env і далі перемагає дефолт (відкат без релізу)", () => {
    const rolledBack = z.object(aiRoutingEnvShape).parse({
      OPENROUTER_NUTRITION_MODEL: "google/gemini-2.5-flash-lite",
    });
    expect(rolledBack.OPENROUTER_NUTRITION_MODEL).toBe(
      "google/gemini-2.5-flash-lite",
    );
  });
});
