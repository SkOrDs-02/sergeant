import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chatViaOpenRouter, defaultChatModel } from "./chatModels.js";

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

  it("без прапорця — Anthropic-моделі", () => {
    expect(chatViaOpenRouter()).toBe(false);
    expect(defaultChatModel("firstTurn")).toBe("claude-haiku-4-5-20251001");
    expect(defaultChatModel("synthesis")).toBe("claude-sonnet-4-6");
    expect(defaultChatModel("standard")).toBe("claude-haiku-4-5-20251001");
  });

  it("прапорець + ключ — OpenRouter-моделі", () => {
    process.env["CHAT_VIA_OPENROUTER"] = "true";
    process.env["OPENROUTER_API_KEY"] = "sk-or-test";
    expect(chatViaOpenRouter()).toBe(true);
    expect(defaultChatModel("firstTurn")).toBe("deepseek/deepseek-v4-flash");
    expect(defaultChatModel("synthesis")).toBe("z-ai/glm-5.2");
    expect(defaultChatModel("standard")).toBe("deepseek/deepseek-v4-flash");
    expect(defaultChatModel("floor")).toBe("google/gemini-2.5-flash-lite");
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
