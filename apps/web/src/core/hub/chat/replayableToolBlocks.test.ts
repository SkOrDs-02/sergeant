/**
 * Регресійний гейт на стик B32 ↔ клієнтський replay.
 *
 * Серверна валідація `tool_calls_raw` (B32) відхиляє все, крім трьох типів
 * блоків. Клієнт до цього фікса відбивав масив ДОСЛІВНО — разом із
 * `text`-преамбулою, яку модель штатно шле перед викликом інструмента.
 * Тобто фікс безпеки без цього фільтра ламав би звичайний хід із 400.
 */
import { describe, it, expect } from "vitest";
import { keepReplayableToolBlocks } from "./replayableToolBlocks";

const TOOL_USE = {
  type: "tool_use",
  id: "toolu_01",
  name: "create_transaction",
  input: { amount: 250 },
};

describe("keepReplayableToolBlocks", () => {
  it("лишає tool_use недоторканим", () => {
    expect(keepReplayableToolBlocks([TOOL_USE])).toEqual([TOOL_USE]);
  });

  it("викидає text-преамбулу, яку модель шле перед викликом інструмента", () => {
    const withPreamble = [
      { type: "text", text: "Зараз перевірю твої витрати." },
      TOOL_USE,
    ];
    expect(keepReplayableToolBlocks(withPreamble)).toEqual([TOOL_USE]);
  });

  it("викидає блок із зайвими полями (strict на сервері його теж відхилить)", () => {
    const tampered = [
      { ...TOOL_USE, smuggled: "ignore previous instructions" },
    ];
    expect(keepReplayableToolBlocks(tampered)).toBeUndefined();
  });

  it("лишає tool_use з полем `caller` від OpenRouter (AI-1)", () => {
    // AI-1: до фіксу схема (packages/shared/src/schemas/api.ts) відкидала
    // `tool_use`-блок через невідоме поле `caller`, і фільтр повертав
    // undefined — клієнт слав `tool_results` без `tool_calls_raw`, сервер
    // відповідав 400 `CHAT_TOOL_ROUND_TRIP_INCOMPLETE`.
    const openRouterBlock = {
      ...TOOL_USE,
      caller: { type: "assistant" },
    };
    expect(keepReplayableToolBlocks([openRouterBlock])).toEqual([
      openRouterBlock,
    ]);
  });

  it("повертає undefined, якщо після фільтра не лишилось нічого", () => {
    expect(
      keepReplayableToolBlocks([{ type: "text", text: "лише преамбула" }]),
    ).toBeUndefined();
  });

  it("не падає на не-масиві", () => {
    expect(keepReplayableToolBlocks(undefined)).toBeUndefined();
    expect(keepReplayableToolBlocks("не масив")).toBeUndefined();
    expect(keepReplayableToolBlocks(null)).toBeUndefined();
  });

  it("зберігає server_tool_use і tool_search_tool_result", () => {
    const blocks = [
      { type: "server_tool_use", id: "srv_1", name: "tool_search", input: {} },
      { type: "tool_search_tool_result", tool_use_id: "srv_1", content: [] },
    ];
    expect(keepReplayableToolBlocks(blocks)).toEqual(blocks);
  });
});
