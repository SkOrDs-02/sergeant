import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CHAT_VIA_OPENROUTER_DEFAULT,
  chatViaOpenRouter,
  defaultChatModel,
} from "./chatModels.js";

// Прапорець `CHAT_VIA_OPENROUTER` керує ДВОМА рішеннями одночасно: куди йде
// HTTP-запит (`pickTransport` у `lib/anthropic.ts`) і які model-id підставити
// у дефолти щаблів (`defaultChatModel`). Ці рішення мають вмикатися й
// вимикатися РАЗОМ.
//
// Чому це окремий тест: проміжний стан «нові model-id у старий шлюз» не дає
// ані помилки типів, ані падіння тестів — сервер піднімається, а кожен
// чат-запит отримує 404 на неіснуючий для Anthropic `z-ai/glm-5.2`. Такий
// збій видно лише в проді, тому інваріант закріплено тут.
describe("env: CHAT_VIA_OPENROUTER — транспорт і model-id перемикаються разом", () => {
  const saved = {
    flag: process.env["CHAT_VIA_OPENROUTER"],
    key: process.env["OPENROUTER_API_KEY"],
  };

  beforeEach(() => {
    delete process.env["CHAT_VIA_OPENROUTER"];
    delete process.env["OPENROUTER_API_KEY"];
  });

  afterEach(() => {
    if (saved.flag === undefined) delete process.env["CHAT_VIA_OPENROUTER"];
    else process.env["CHAT_VIA_OPENROUTER"] = saved.flag;
    if (saved.key === undefined) delete process.env["OPENROUTER_API_KEY"];
    else process.env["OPENROUTER_API_KEY"] = saved.key;
  });

  it("без прапорця й без ключа — Anthropic-моделі", () => {
    expect(chatViaOpenRouter()).toBe(false);
    expect(defaultChatModel("firstTurn")).toBe("claude-haiku-4-5-20251001");
    expect(defaultChatModel("synthesis")).toBe("claude-sonnet-4-6");
    expect(defaultChatModel("standard")).toBe("claude-haiku-4-5-20251001");
  });

  // Регресія на split-brain: `env.ts` оголошує `boolFromEnv(true)`, а тут
  // стояло `v !== "true" && v !== "1" → false`, тож НЕВИСТАВЛЕНА змінна
  // означала OFF у ран-таймі й ON у схемі. З ключем і без прапорця чат тихо
  // йшов на прямий Anthropic і кожен запит падав `anthropic upstream 401`.
  it("без прапорця, але з ключем — шлюз (відсутнє = дефолт схеми, ON)", () => {
    process.env["OPENROUTER_API_KEY"] = "sk-or-test";
    expect(chatViaOpenRouter()).toBe(true);
    expect(defaultChatModel("firstTurn")).toBe("google/gemini-3.7-flash");
    expect(defaultChatModel("synthesis")).toBe("z-ai/glm-5.2");
  });

  it("дефолт ран-тайму збігається з дефолтом схеми", () => {
    expect(CHAT_VIA_OPENROUTER_DEFAULT).toBe(true);
  });

  it.each(["false", "0", "FALSE"])(
    "явний %s вимикає шлюз навіть із ключем",
    (value) => {
      process.env["CHAT_VIA_OPENROUTER"] = value;
      process.env["OPENROUTER_API_KEY"] = "sk-or-test";
      expect(chatViaOpenRouter()).toBe(false);
      expect(defaultChatModel("synthesis")).toBe("claude-sonnet-4-6");
    },
  );

  // Сміттєве значення не має тихо вимикати шлюз — воно падає на той самий
  // дефолт, що й відсутнє (поведінка `boolFromEnv` у схемі).
  it("нерозпізнане значення падає на дефолт схеми", () => {
    process.env["CHAT_VIA_OPENROUTER"] = "maybe";
    process.env["OPENROUTER_API_KEY"] = "sk-or-test";
    expect(chatViaOpenRouter()).toBe(true);
  });

  it("прапорець + ключ — OpenRouter-моделі", () => {
    process.env["CHAT_VIA_OPENROUTER"] = "true";
    process.env["OPENROUTER_API_KEY"] = "sk-or-test";
    expect(chatViaOpenRouter()).toBe(true);
    // FirstTurn більше не deepseek: за ТОЧНІСТЮ вони рівні (24/24 проти
    // 11/12 — різниця в один спірний кейс), але максимум затримки 8,5 с
    // проти 30,6 с. Замір `eval:tools` 2026-08-26, три серії на одному
    // стенді; підстава — латентність, не якість (ADR-0087, п. 3).
    //
    // `standard` НАВМИСНО лишається deepseek: там затримка не критична,
    // а ціна вдесятеро нижча.
    expect(defaultChatModel("firstTurn")).toBe("google/gemini-3.7-flash");
    expect(defaultChatModel("synthesis")).toBe("z-ai/glm-5.2");
    expect(defaultChatModel("standard")).toBe("deepseek/deepseek-v4-flash");
    // Floor більше не flash-lite: на стрімі з тулами він падав 9/12 у
    // живому замірі 2026-08-25, тоді як чотири інші кандидати дали 0/8
    // (знахідка B46, docs/90-work/audits/ai-testing-2026-08-25.md).
    // Flash-lite лишається дефолтом НЕ-стрімових шляхів — тому міняти
    // тут треба саме floor, а не всі згадки моделі.
    expect(defaultChatModel("floor")).toBe("google/gemini-3.7-flash");
  });

  it("прапорець БЕЗ ключа — повний відкат, а не половинчастий", () => {
    process.env["CHAT_VIA_OPENROUTER"] = "true";
    expect(chatViaOpenRouter()).toBe(false);
    // Ключова перевірка: model-id теж мають повернутися на Anthropic, інакше
    // транспорт піде в api.anthropic.com з `z-ai/glm-5.2` і отримає 404.
    expect(defaultChatModel("firstTurn")).toBe("claude-haiku-4-5-20251001");
    expect(defaultChatModel("synthesis")).toBe("claude-sonnet-4-6");
    expect(defaultChatModel("standard")).toBe("claude-haiku-4-5-20251001");
  });

  it("порожній ключ дорівнює відсутньому", () => {
    process.env["CHAT_VIA_OPENROUTER"] = "1";
    process.env["OPENROUTER_API_KEY"] = "";
    expect(chatViaOpenRouter()).toBe(false);
    expect(defaultChatModel("synthesis")).toBe("claude-sonnet-4-6");
  });
});
