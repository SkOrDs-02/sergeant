/**
 * Unit-тести для per-tool metrics helper-у (PR-12.C аудиту 2026-04-26).
 *
 * Покриваємо чисті функції без реального prom-client: інкремент-функцію
 * передаємо як останній аргумент, щоб не торкатися глобального register-у.
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildToolUseIdToNameMap,
  recordToolExecutions,
  recordToolProposals,
} from "./toolMetrics.js";

describe("buildToolUseIdToNameMap", () => {
  it("маперить tool_use-блоки за id у name", () => {
    const map = buildToolUseIdToNameMap([
      {
        type: "tool_use",
        id: "toolu_1",
        name: "delete_transaction",
        input: {},
      },
      { type: "text", text: "Видаляю…" },
      { type: "tool_use", id: "toolu_2", name: "start_workout", input: {} },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("toolu_1")).toBe("delete_transaction");
    expect(map.get("toolu_2")).toBe("start_workout");
  });

  it("ігнорує блоки без type/id/name", () => {
    const map = buildToolUseIdToNameMap([
      null,
      "string",
      42,
      { type: "tool_use" }, // no id/name
      { type: "tool_use", id: "x" }, // no name
      { type: "tool_use", name: "foo" }, // no id
      { type: "text", id: "y", name: "z" }, // wrong type
      { type: "tool_use", id: "", name: "delete_transaction" }, // empty id
    ]);
    expect(map.size).toBe(0);
  });

  it("приймає порожній масив", () => {
    expect(buildToolUseIdToNameMap([]).size).toBe(0);
  });
});

describe("recordToolProposals", () => {
  it("інкрементить per-tool лічильник для кожного tool_use-блоку", () => {
    const inc = vi.fn();
    recordToolProposals(
      [
        { type: "text", text: "Ок…" },
        { type: "tool_use", name: "delete_transaction" },
        { type: "tool_use", name: "start_workout" },
      ],
      inc,
    );
    expect(inc).toHaveBeenCalledTimes(2);
    expect(inc).toHaveBeenCalledWith({
      tool: "delete_transaction",
      outcome: "proposed",
    });
    expect(inc).toHaveBeenCalledWith({
      tool: "start_workout",
      outcome: "proposed",
    });
  });

  it("маркує невідомі tool-імена як 'unknown' (anti-cardinality)", () => {
    const inc = vi.fn();
    recordToolProposals(
      [
        { type: "tool_use", name: "evil_tool_injected_by_client" },
        { type: "tool_use", name: "" }, // skipped
      ],
      inc,
    );
    expect(inc).toHaveBeenCalledTimes(1);
    expect(inc).toHaveBeenCalledWith({ tool: "unknown", outcome: "proposed" });
  });

  it("ігнорує не-tool_use і блоки без name", () => {
    const inc = vi.fn();
    recordToolProposals(
      [{ type: "text", text: "…" }, { type: "tool_use" }],
      inc,
    );
    expect(inc).not.toHaveBeenCalled();
  });

  it("на пустому content нічого не інкрементить", () => {
    const inc = vi.fn();
    recordToolProposals([], inc);
    expect(inc).not.toHaveBeenCalled();
  });
});

describe("recordToolExecutions", () => {
  const toolCallsRaw = [
    { type: "tool_use", id: "toolu_a", name: "delete_transaction", input: {} },
    { type: "tool_use", id: "toolu_b", name: "start_workout", input: {} },
  ];

  it("інкрементить executed-лічильник з імʼям з мапи tool_calls_raw", () => {
    const inc = vi.fn();
    recordToolExecutions(
      [{ tool_use_id: "toolu_a" }, { tool_use_id: "toolu_b" }],
      toolCallsRaw,
      inc,
    );
    expect(inc).toHaveBeenCalledTimes(2);
    expect(inc).toHaveBeenNthCalledWith(1, {
      tool: "delete_transaction",
      outcome: "executed",
    });
    expect(inc).toHaveBeenNthCalledWith(2, {
      tool: "start_workout",
      outcome: "executed",
    });
  });

  it("незмаплений tool_use_id → outcome=unknown_tool, tool=unknown", () => {
    const inc = vi.fn();
    recordToolExecutions(
      [{ tool_use_id: "toolu_z_orphan" }],
      toolCallsRaw,
      inc,
    );
    expect(inc).toHaveBeenCalledTimes(1);
    expect(inc).toHaveBeenCalledWith({
      tool: "unknown",
      outcome: "unknown_tool",
    });
  });

  it("якщо tool_calls_raw порожній — усі tool_results стають unknown_tool", () => {
    const inc = vi.fn();
    recordToolExecutions(
      [{ tool_use_id: "toolu_a" }, { tool_use_id: "toolu_b" }],
      [],
      inc,
    );
    expect(inc).toHaveBeenCalledTimes(2);
    expect(inc.mock.calls.every(([l]) => l.outcome === "unknown_tool")).toBe(
      true,
    );
  });

  it("на пустому tool_results нічого не інкрементить", () => {
    const inc = vi.fn();
    recordToolExecutions([], toolCallsRaw, inc);
    expect(inc).not.toHaveBeenCalled();
  });

  it("name поза whitelist (TOOLS) маркується як 'unknown'", () => {
    const inc = vi.fn();
    recordToolExecutions(
      [{ tool_use_id: "toolu_x" }],
      [{ type: "tool_use", id: "toolu_x", name: "fabricated_evil_tool" }],
      inc,
    );
    expect(inc).toHaveBeenCalledTimes(1);
    expect(inc).toHaveBeenCalledWith({ tool: "unknown", outcome: "executed" });
  });
});

describe("recordToolProposals/recordToolExecutions — default-моки", () => {
  it("без 'inc'-аргументу не падають (хоч і інкрементать справжній prom counter)", () => {
    expect(() =>
      recordToolProposals([{ type: "tool_use", name: "delete_transaction" }]),
    ).not.toThrow();
    expect(() =>
      recordToolExecutions(
        [{ tool_use_id: "toolu_a" }],
        [
          {
            type: "tool_use",
            id: "toolu_a",
            name: "delete_transaction",
            input: {},
          },
        ],
      ),
    ).not.toThrow();
  });
});
