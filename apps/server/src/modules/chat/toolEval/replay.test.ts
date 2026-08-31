/**
 * Оцінювання ланцюжка на синтетичних записах.
 *
 * Касета доводить, що прогін відбувся; цей тест доводить, що ВЕРДИКТ по ньому
 * правильний. Різниця істотна: помилка в оцінюванні виглядає точно як помилка
 * моделі, і в такому вигляді вона проживе рівно до того дня, коли хтось
 * повірить зеленому кольору.
 */

import { describe, expect, it } from "vitest";

import type { ToolCase } from "../toolSelectionCases/index.js";
import type { RecordedCase } from "./cassette.js";
import { replayCase } from "./replay.js";

function toolUse(name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id: `tu_${name}`, name, input };
}

const CHAIN_CASE: ToolCase = {
  name: "синтетичний ланцюжок",
  user: "Прибери зі списку звичку бігати",
  accept: ["archive_habit", "query_habits"],
  turns: [
    {
      result: "Звички: hab_run «Біг» (активна).",
      accept: ["archive_habit"],
    },
  ],
};

function recorded(turns: RecordedCase["turns"]): RecordedCase {
  return { name: CHAIN_CASE.name, turns };
}

describe("оцінювання ланцюжка", () => {
  it("зараховує розвідку на першому ході й дію на другому", () => {
    const r = replayCase(
      CHAIN_CASE,
      recorded([
        { blocks: [toolUse("query_habits", {})], fedResult: null },
        {
          blocks: [toolUse("archive_habit", { habit_id: "hab_run" })],
          fedResult: CHAIN_CASE.turns?.[0]?.result ?? null,
        },
      ]),
    );
    expect(r.turnHits).toEqual([true, true]);
    expect(r.correct).toBe(true);
  });

  it("id з tool_result не рахується вигаданим", () => {
    // Найтонше місце всієї конструкції: `hab_run` немає ні в промпті, ні в
    // блоці ДАНІ - він приходить лише результатом першого ходу. Без
    // накопичення контексту перевірка карала б модель саме за те, чого від
    // неї домагаються.
    const r = replayCase(
      CHAIN_CASE,
      recorded([
        { blocks: [toolUse("query_habits", {})], fedResult: null },
        {
          blocks: [toolUse("archive_habit", { habit_id: "hab_run" })],
          fedResult: CHAIN_CASE.turns?.[0]?.result ?? null,
        },
      ]),
    );
    expect(r.hallucinated).toEqual([]);
  });

  it("id, якого не було ніде, лишається вигаданим", () => {
    const r = replayCase(
      CHAIN_CASE,
      recorded([
        { blocks: [toolUse("query_habits", {})], fedResult: null },
        {
          blocks: [toolUse("archive_habit", { habit_id: "hab_swim" })],
          fedResult: CHAIN_CASE.turns?.[0]?.result ?? null,
        },
      ]),
    );
    expect(r.hallucinated).toEqual(["archive_habit.habit_id=hab_swim"]);
  });

  it("обірваний ланцюжок провалює ненаписаний хід", () => {
    const r = replayCase(
      CHAIN_CASE,
      recorded([{ blocks: [toolUse("query_habits", {})], fedResult: null }]),
    );
    expect(r.turnHits).toEqual([true, false]);
    expect(r.correct).toBe(false);
  });

  it("коротке замикання зараховується, а не карається", () => {
    const r = replayCase(
      CHAIN_CASE,
      recorded([
        {
          blocks: [toolUse("archive_habit", { habit_id: "hab_run" })],
          fedResult: null,
        },
      ]),
    );
    expect(r.shortCircuited).toBe(true);
    expect(r.correct).toBe(true);
    // Тут id справді вигаданий: моделі його ще ніхто не давав. Коротке
    // замикання виправдовує довжину ланцюжка, але не аргумент.
    expect(r.hallucinated).toEqual(["archive_habit.habit_id=hab_run"]);
  });

  it("транспортна помилка не читається як провал моделі", () => {
    const r = replayCase(CHAIN_CASE, {
      name: CHAIN_CASE.name,
      turns: [],
      error: "HTTP 429: rate limited",
    });
    expect(r.correct).toBe(false);
    expect(r.error).toBe("HTTP 429: rate limited");
  });
});
