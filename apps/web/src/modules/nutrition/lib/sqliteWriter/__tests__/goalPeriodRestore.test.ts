/**
 * Аудит 2026-10-01, data-35: відновлення сходинок журналу цілей з бекапу.
 * Сходинка повертається з ТИМ САМИМ id, днем і `created_at`, що були у файлі, а
 * не штампується «сьогодні» (як `goal-period-insert`).
 */
vi.mock("../../../../../core/syncEngine/fireSyncOutboxUpsert.js", () => ({
  fireSyncOutboxUpsert: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { fireSyncOutboxUpsert } from "../../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import { applyNutritionDualWriteOps } from "../adapter";
import {
  diffNutritionDualWriteOps,
  EMPTY_NUTRITION_DUAL_WRITE_STATE,
  type NutritionGoalPeriodRestoreSnapshot,
} from "../diff.js";

const PERIOD: NutritionGoalPeriodRestoreSnapshot = {
  id: "gp::2026-03-01::2200:-:-:-:2500::dev-old",
  effectiveFrom: "2026-03-01",
  goal: { kcal: 2200, proteinG: null, fatG: null, carbsG: null, waterMl: 2500 },
  origin: "tdee",
  createdAt: "2026-03-01T08:00:00.000Z",
};

describe("diff — goal-period-restore", () => {
  it("емітить op лише для нових елементів черги", () => {
    const second = { ...PERIOD, id: "gp::second" };
    const ops = diffNutritionDualWriteOps(
      { ...EMPTY_NUTRITION_DUAL_WRITE_STATE, goalPeriodRestores: [PERIOD] },
      {
        ...EMPTY_NUTRITION_DUAL_WRITE_STATE,
        goalPeriodRestores: [PERIOD, second],
      },
    );
    expect(ops).toEqual([{ kind: "goal-period-restore", period: second }]);
  });

  it("без черги нічого не емітить", () => {
    expect(
      diffNutritionDualWriteOps(
        EMPTY_NUTRITION_DUAL_WRITE_STATE,
        EMPTY_NUTRITION_DUAL_WRITE_STATE,
      ),
    ).toEqual([]);
  });
});

describe("adapter — goal-period-restore", () => {
  beforeEach(() => vi.mocked(fireSyncOutboxUpsert).mockClear());

  it("пише INSERT OR IGNORE з id, днем і created_at з файлу та ставить outbox", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      run: vi.fn((sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return Promise.resolve(undefined);
      }),
      all: vi.fn(() => Promise.resolve([])),
      exec: vi.fn(() => Promise.resolve(undefined)),
      get: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as SqliteMigrationClient;

    await applyNutritionDualWriteOps(
      client,
      [{ kind: "goal-period-restore", period: PERIOD }],
      { userId: "user_1", clientTs: "2026-10-08T10:00:00.000Z" },
    );

    const insert = calls.find((c) => c.sql.includes("nutrition_goal_periods"))!;
    expect(insert.sql).toMatch(/INSERT OR IGNORE INTO nutrition_goal_periods/);
    expect(insert.params[0]).toBe(PERIOD.id);
    expect(insert.params[2]).toBe("2026-03-01");
    expect(insert.params.slice(3, 9)).toEqual([
      2200,
      null,
      null,
      null,
      2500,
      "tdee",
    ]);
    expect(insert.params[10]).toBe("2026-03-01T08:00:00.000Z");

    const payload = vi.mocked(fireSyncOutboxUpsert).mock.calls[0]![1];
    expect(payload.table).toBe("nutrition_goal_periods");
    expect(payload.op).toBe("insert");
    expect(payload.row["id"]).toBe(PERIOD.id);
    expect(payload.row["effective_from"]).toBe("2026-03-01");
    expect(payload.row["created_at"]).toBe("2026-03-01T08:00:00.000Z");
  });
});
