import { describe, expect, it } from "vitest";
import { replayCase } from "./replay.js";
import { schemaViolations } from "./argChecks.js";
import { hallucinatedIds } from "./scoring.js";

const call = (name: string, input: unknown) => [
  { type: "tool_use", name, input },
];

describe("оцінювач не пропускає невалідні tool-виклики", () => {
  it("помічає вигаданий інструмент", () => {
    expect(schemaViolations(call("delete_everything", {}))).toContainEqual(
      expect.objectContaining({ tool: "delete_everything", kind: "unknown" }),
    );
  });
  it.each([null, undefined, [], "{}", 42, false].map((input) => ({ input })))(
    "відхиляє input $input замість object",
    ({ input }) => {
      expect(schemaViolations(call("query_habits", input))).toContainEqual(
        expect.objectContaining({ field: "$input", kind: "type" }),
      );
    },
  );
  it.each([
    "2026-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-01",
    "2026-01-00",
    "0000-01-01",
  ])("помічає неможливу дату %s", (date) => {
    expect(
      schemaViolations(call("mark_habit_done", { habit_id: "h1", date })),
    ).toContainEqual(expect.objectContaining({ field: "date", kind: "date" }));
  });
  it.each(["2000-02-29", "2024-02-29", "2026-04-30", "0099-01-01"])(
    "приймає справжню дату %s",
    (date) => {
      expect(
        schemaViolations(call("mark_habit_done", { habit_id: "h1", date })),
      ).toEqual([]);
    },
  );
  it.each(["24:00", "12:60", "99:99"])("помічає неможливий час %s", (time) => {
    expect(
      schemaViolations(call("create_reminder", { habit_id: "h1", time })),
    ).toContainEqual(expect.objectContaining({ field: "time", kind: "time" }));
  });
  it.each(["00:00", "23:59"])("приймає час %s", (time) => {
    expect(
      schemaViolations(call("create_reminder", { habit_id: "h1", time })),
    ).toEqual([]);
  });
  it("перевіряє тип кожного елемента масиву", () => {
    expect(
      schemaViolations(
        call("create_habit", { name: "Вода", weekdays: [0, "1"] }),
      ),
    ).toContainEqual(
      expect.objectContaining({ field: "weekdays[1]", kind: "type" }),
    );
  });
  it("помічає null у необовʼязковому string-полі", () => {
    expect(
      schemaViolations(call("mark_habit_done", { habit_id: "h1", date: null })),
    ).toContainEqual(expect.objectContaining({ field: "date", kind: "type" }));
  });
});

describe("вигаданий opaque ID не стає відомим через підрядок", () => {
  it.each([
    ["h1", "habit_id=h10"],
    ["h1", "habit_id=prefix-h1-suffix"],
    ["H1", "habit_id=h1"],
    ["1", "сьогодні 2026-10-21"],
    ["habit", "habit_id=habit_water"],
  ])("відхиляє %s у контексті %s", (id, context) => {
    expect(
      hallucinatedIds(call("mark_habit_done", { habit_id: id }), context),
    ).toEqual([`mark_habit_done.habit_id=${id}`]);
  });
  it.each(["habit_id=h1", '{"habit_id":"h1"}', "ID: h1.", "(h1)"])(
    "приймає точний ID: %s",
    (context) => {
      expect(
        hallucinatedIds(call("mark_habit_done", { habit_id: "h1" }), context),
      ).toEqual([]);
    },
  );
});

describe("вкладені аргументи теж проходять суддю", () => {
  it("ловить хибну суму у вкладеній частині транзакції", () => {
    expect(
      schemaViolations(
        call("split_transaction", {
          tx_id: "t1",
          parts: [{ category_id: "food", amount: "250" }],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({ field: "parts[0].amount", kind: "type" }),
    );
  });
  it("ловить відсутню вкладену категорію", () => {
    expect(
      schemaViolations(
        call("split_transaction", { tx_id: "t1", parts: [{ amount: 250 }] }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        field: "parts[0].category_id",
        kind: "required",
      }),
    );
  });
  it("ловить невідоме поле strict-вкладеного object", () => {
    expect(
      schemaViolations(
        call("split_transaction", {
          tx_id: "t1",
          parts: [{ category_id: "food", amount: 250, currency: "USD" }],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({ field: "parts[0].currency", kind: "unknown" }),
    );
  });
  it("приймає валідну вкладену частину", () => {
    expect(
      schemaViolations(
        call("split_transaction", {
          tx_id: "t1",
          parts: [{ category_id: "food", amount: 250 }],
        }),
      ),
    ).toEqual([]);
  });
  it("не плутає prototype key із полем схеми", () => {
    expect(
      schemaViolations(call("query_habits", { constructor: "fake" })),
    ).toContainEqual(
      expect.objectContaining({ field: "constructor", kind: "unknown" }),
    );
  });
  it.each([NaN, Infinity, -Infinity])("відхиляє не-JSON число %s", (amount) => {
    expect(
      schemaViolations(
        call("split_transaction", {
          tx_id: "t1",
          parts: [{ category_id: "food", amount }],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({ field: "parts[0].amount", kind: "type" }),
    );
  });
});

describe("безіменна спроба tool-виклику не є стриманістю чи відмовою", () => {
  it.each(
    [undefined, "", "  "].flatMap((name) =>
      ["expectNoTool", "acceptRefusal"].map((mode) => ({ name, mode })),
    ),
  )("name=$name / $mode", ({ name, mode }) => {
    const blocks = [
      { type: "tool_use", ...(name === undefined ? {} : { name }), input: {} },
    ];
    expect(schemaViolations(blocks)).toContainEqual(
      expect.objectContaining({ field: "$tool", kind: "unknown" }),
    );
    const result = replayCase(
      {
        name: "unnamed",
        user: "Привіт",
        accept: ["query_habits"],
        ...(mode === "expectNoTool"
          ? { expectNoTool: true }
          : { acceptRefusal: true }),
      },
      { name: "unnamed", turns: [{ blocks, fedResult: null }] },
    );
    expect(result.correct).toBe(false);
  });
});
