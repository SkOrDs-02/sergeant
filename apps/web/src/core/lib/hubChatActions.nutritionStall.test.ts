// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Follow-up до data-22 (#1395): очікування черги Їжі між діями батча
 * обмежене. Якщо черга не звільнилась за NUTRITION_IDLE_TIMEOUT_MS, поточна
 * дія лишається виконаною, а решта sync-дій батча повертає явну відмову
 * замість того, щоб вішати хід чату або читати застарілий знімок.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatched: string[] = [];

vi.mock("../../modules/nutrition/lib/sqliteWriter/index", () => ({
  hasPendingNutritionDualWrites: () => true,
  nutritionDualWriteIdle: () => new Promise<void>(() => {}),
}));

vi.mock("./chatActions/nutritionActions", () => ({
  handleNutritionAction: (action: { name: string }) => {
    dispatched.push(action.name);
    return `ok:${action.name}`;
  },
}));

import { executeActions, NUTRITION_IDLE_TIMEOUT_MS } from "./hubChatActions";
import type { ChatAction } from "./chatActions/types";

beforeEach(() => {
  dispatched.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("executeActions — зависла черга Їжі", () => {
  it("після тайм-ауту не виконує решту sync-дій і повертає явну відмову", async () => {
    const actions = [
      { name: "log_water", input: { ml: 250 } },
      { name: "log_water", input: { ml: 300 } },
    ] as unknown as ChatAction[];
    const run = executeActions(actions);
    await vi.advanceTimersByTimeAsync(NUTRITION_IDLE_TIMEOUT_MS);
    const results = await run;

    expect(dispatched).toEqual(["log_water"]);
    expect(results[0]).toMatchObject({ ok: true, result: "ok:log_water" });
    expect(results[1]?.ok).toBe(false);
    expect(results[1]?.result).toMatch(/НЕ стверджуй, що дію виконано/);
  });
});
