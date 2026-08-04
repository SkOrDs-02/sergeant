/**
 * Зорові шляхи: транспорт і model-id мусять перемикатися РАЗОМ.
 *
 * WHY. Половинчастий стан уже коштував сесії налагодження в чаті: прапорець
 * увімкнений, ключа немає — транспорт тихо повертається на Anthropic, а
 * model-id лишається OpenRouter-івським, і кожен запит отримує 404 на
 * неіснуючу для Anthropic модель. `analyze-photo`/`refine-photo` не ходять
 * через `getLLMProvider()` (їм потрібен image-блок), тож спільного захисту
 * від цього в них немає — лише цей інваріант.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const OR_MODEL = "google/gemini-2.5-flash-lite";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

async function load(envOverrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("../env/env.js", () => ({
    env: {
      VISION_VIA_OPENROUTER: false,
      OPENROUTER_API_KEY: "",
      OPENROUTER_VISION_MODEL: OR_MODEL,
      NUTRITION_MODEL: ANTHROPIC_MODEL,
      ...envOverrides,
    },
  }));
  return import("../modules/nutrition/visionTransport.js");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../env/env.js");
});

describe("зоровий транспорт", () => {
  it("дефолт — прямий Anthropic із NUTRITION_MODEL", async () => {
    const m = await load({});
    expect(m.visionViaOpenRouter()).toBe(false);
    expect(m.visionModel()).toBe(ANTHROPIC_MODEL);
  });

  it("прапорець + ключ → шлюз і OpenRouter-id разом", async () => {
    const m = await load({
      VISION_VIA_OPENROUTER: true,
      OPENROUTER_API_KEY: "sk-or-test",
    });
    expect(m.visionViaOpenRouter()).toBe(true);
    expect(m.visionModel()).toBe(OR_MODEL);
  });

  it("прапорець без ключа → відкат ПОВНИЙ, не половинчастий", async () => {
    const m = await load({ VISION_VIA_OPENROUTER: true });
    expect(m.visionViaOpenRouter()).toBe(false);
    // Ключове: id теж повертається на Anthropic. Інакше — 404 на кожне фото.
    expect(m.visionModel()).toBe(ANTHROPIC_MODEL);
  });

  it("ключ без прапорця нічого не вмикає", async () => {
    const m = await load({ OPENROUTER_API_KEY: "sk-or-test" });
    expect(m.visionViaOpenRouter()).toBe(false);
    expect(m.visionModel()).toBe(ANTHROPIC_MODEL);
  });
});
