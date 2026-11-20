/**
 * Дефолтні моделі непотокових шляхів шлюзу (рішення власника 2026-11-19).
 *
 * Текстові пайплайни (дайджест, категоризація, Mono-збагачення, текстова
 * нутриція: день, тиждень, список покупок, рецепти, розбір комори) переходять
 * на `google/gemini-3.5-flash-lite`: на стенді 71/75 проти 51/57 і 18 відмов
 * 429 з 75 у `gemini-2.5-flash-lite` (`docs/work/research/2026-11-19-openrouter-new-models.md`
 * § 6.4). Зір нутриції лишається на `gemini-2.5-flash-lite` (рішення
 * власника 2026-11-19: не міняти, доки немає стенда на справжніх фото). Чеки
 * й імпорт виписок з того ж дня на `openai/gpt-6-luna` без міркувань (§ 6.5:
 * виписки 24/24, чеки 21/24, вигадок 0). Тест тримає всі три половини
 * рішення, щоб заміна однієї не протягла іншу.
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

  it("OPENROUTER_VISION_MODEL (analyze-photo, refine-photo) лишається на google/gemini-2.5-flash-lite", () => {
    expect(parsed.OPENROUTER_VISION_MODEL).toBe("google/gemini-2.5-flash-lite");
  });

  it("OPENROUTER_RECEIPT_MODEL (чеки й виписки) — openai/gpt-6-luna без міркувань", () => {
    expect(parsed.OPENROUTER_RECEIPT_MODEL).toBe("openai/gpt-6-luna");
    expect(parsed.RECEIPT_VISION_REASONING_EFFORT).toBe("none");
  });

  it("чеки відкочуються env-ом, глибина перемикається env-ом", () => {
    const rolledBack = z.object(aiRoutingEnvShape).parse({
      OPENROUTER_RECEIPT_MODEL: "google/gemini-2.5-flash-lite",
      RECEIPT_VISION_REASONING_EFFORT: " Default ",
    });
    expect(rolledBack.OPENROUTER_RECEIPT_MODEL).toBe(
      "google/gemini-2.5-flash-lite",
    );
    expect(rolledBack.RECEIPT_VISION_REASONING_EFFORT).toBe("default");
    expect(() =>
      z.object(aiRoutingEnvShape).parse({
        RECEIPT_VISION_REASONING_EFFORT: "minimal",
      }),
    ).toThrow();
  });

  it("явне значення в env і далі перемагає дефолт (відкат без релізу)", () => {
    const rolledBack = z.object(aiRoutingEnvShape).parse({
      OPENROUTER_NUTRITION_MODEL: "google/gemini-2.5-flash-lite",
    });
    expect(rolledBack.OPENROUTER_NUTRITION_MODEL).toBe(
      "google/gemini-2.5-flash-lite",
    );
  });
});
