/**
 * Оцінювання ланцюжка на синтетичних записах.
 *
 * Касета доводить, що прогін відбувся; цей тест доводить, що ВЕРДИКТ по ньому
 * правильний. Різниця істотна: помилка в оцінюванні виглядає точно як помилка
 * моделі, і в такому вигляді вона проживе рівно до того дня, коли хтось
 * повірить зеленому кольору.
 */

import { describe, expect, it } from "vitest";

import {
  ALL_CASES,
  FOLLOW_UP_CASES,
  type ToolCase,
} from "../toolSelectionCases/index.js";
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

describe("кейси «знайди, потім зміни ту» (С-2)", () => {
  const [withRefs, control, workout] = FOLLOW_UP_CASES;

  it("id з блоку записів попередньої відповіді не рахується вигаданим", () => {
    const r = replayCase(withRefs!, {
      name: withRefs!.name,
      turns: [
        {
          blocks: [
            toolUse("change_category", {
              tx_id: "tx_7c40",
              category_id: "cat_food_out",
            }),
          ],
          fedResult: null,
        },
      ],
    });
    expect(r.hallucinated).toEqual([]);
    expect(r.argViolations).toEqual([]);
    expect(r.correct).toBe(true);
  });

  it("без блоку записів той самий id — вигаданий", () => {
    const r = replayCase(control!, {
      name: control!.name,
      turns: [
        {
          blocks: [
            toolUse("change_category", {
              tx_id: "tx_7c40",
              category_id: "cat_food_out",
            }),
          ],
          fedResult: null,
        },
      ],
    });
    expect(r.hallucinated).toEqual(["change_category.tx_id=tx_7c40"]);
    expect(r.correct).toBe(false);
  });

  it("тренування: id з блоку записів не вигаданий, чужий — вигаданий", () => {
    const run = (workout_id: string) =>
      replayCase(workout!, {
        name: workout!.name,
        turns: [
          {
            blocks: [toolUse("finish_workout", { workout_id })],
            fedResult: null,
          },
        ],
      });
    const ok = run("w_mf3k51");
    expect(ok.hallucinated).toEqual([]);
    expect(ok.argViolations).toEqual([]);
    expect(ok.correct).toBe(true);
    expect(run("w_other").hallucinated).toEqual([
      "finish_workout.workout_id=w_other",
    ]);
  });
});

describe("видалення факту памʼяті: id лише з my_profile (2026-11-18)", () => {
  const FORGET_CASE = ALL_CASES.find(
    (c) => c.name === "видалення конкретного факту",
  ) as ToolCase;
  const run = (turns: RecordedCase["turns"]) =>
    replayCase(FORGET_CASE, { name: FORGET_CASE.name, turns });

  it("кейс веде через my_profile: id фактів у блоці ДАНІ немає", () => {
    expect(FORGET_CASE.accept).toContain("my_profile");
    expect(FORGET_CASE.turns?.[0]?.accept).toEqual(["forget"]);
  });

  it("текст факту в fact_id лишається вигаданим id (повтор прогонів 2026-11-18)", () => {
    const r = run([
      {
        blocks: [toolUse("forget", { fact_id: "алергія на арахіс" })],
        fedResult: null,
      },
    ]);
    expect(r.hallucinated).toEqual(["forget.fact_id=алергія на арахіс"]);
  });

  it("my_profile, потім forget з id із результату: правильно і без вигадок", () => {
    const fed = FORGET_CASE.turns?.[0]?.result ?? null;
    const r = run([
      { blocks: [toolUse("my_profile", {})], fedResult: null },
      {
        blocks: [toolUse("forget", { fact_id: "mem_7f3a" })],
        fedResult: fed,
      },
    ]);
    expect(r.correct).toBe(true);
    expect(r.hallucinated).toEqual([]);
    expect(r.argViolations).toEqual([]);
  });

  it("id чужого факту з того самого профілю ловить перевірка аргументів", () => {
    const fed = FORGET_CASE.turns?.[0]?.result ?? null;
    const r = run([
      { blocks: [toolUse("my_profile", {})], fedResult: null },
      {
        blocks: [toolUse("forget", { fact_id: "mem_2c91" })],
        fedResult: fed,
      },
    ]);
    expect(r.hallucinated).toEqual([]);
    expect(r.argViolations.length).toBeGreaterThan(0);
  });
});

describe("другий раунд: хід без запису (С-2 (б))", () => {
  const NO_WRITE = FOLLOW_UP_CASES.find((c) =>
    c.name.startsWith("другий раунд: двозначний"),
  )!;
  const first = { blocks: [toolUse("find_transaction", {})], fedResult: null };

  it("текст після пошуку зараховується", () => {
    const r = replayCase(NO_WRITE, {
      name: NO_WRITE.name,
      turns: [
        first,
        { blocks: [{ type: "text", text: "Яку з двох?" }], fedResult: "…" },
      ],
    });
    expect(r.correct).toBe(true);
  });

  it("запис із id з результату — провал", () => {
    const r = replayCase(NO_WRITE, {
      name: NO_WRITE.name,
      turns: [
        first,
        {
          blocks: [toolUse("delete_transaction", { tx_id: "m_5d12" })],
          fedResult: "Знайдено 2 операц.: m_5d12: …",
        },
      ],
    });
    expect(r.correct).toBe(false);
    expect(r.hallucinated).toEqual([]);
  });
});
