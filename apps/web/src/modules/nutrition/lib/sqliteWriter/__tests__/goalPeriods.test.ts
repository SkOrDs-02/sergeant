/**
 * W1-KBJU-APPEND, СТАДІЯ 1 — дуал-райт сходинок журналу цілей КБЖВ.
 *
 * Два питання, на які цей файл відповідає:
 *
 *   1. **Чи емітить diff сходинку тоді й лише тоді, коли треба?** Шум тут
 *      дорожчий за пропуск: журнал НАМІРУ, забитий порожніми сходинками
 *      «ціль та сама», зробить майбутній резолвер нечитаним.
 *   2. **Чи лишився старий шлях недоторканим?** `prefs-upsert` мусить
 *      їхати як раніше, `nutrition_prefs` — лишатись єдиним джерелом цілі
 *      для всіх екранів. Це критерій приймання стадії 1.
 */
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
vi.mock("../../../../../core/syncEngine/fireSyncOutboxUpsert.js", () => ({
  fireSyncOutboxUpsert: vi.fn(),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { fireSyncOutboxUpsert } from "../../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import { applyNutritionDualWriteOps } from "../adapter";
import { buildGoalPeriodId, goalPeriodEnv } from "../adapter.goalPeriods.js";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteOp,
  type NutritionDualWriteState,
  type NutritionPrefsSnapshot,
} from "../diff.js";

const EMPTY: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
  waterLog: {},
  shoppingList: null,
};

interface GoalFields {
  dailyTargetKcal?: number | null;
  dailyTargetProtein_g?: number | null;
  dailyTargetFat_g?: number | null;
  dailyTargetCarbs_g?: number | null;
  waterGoalMl?: number | null;
  [key: string]: unknown;
}

function prefs(fields: GoalFields): NutritionPrefsSnapshot {
  return {
    prefsJson: JSON.stringify({ goal: "balanced", ...fields }),
    activePantryId: "p1",
  };
}

function stateWith(p: NutritionPrefsSnapshot | null): NutritionDualWriteState {
  return { ...EMPTY, prefs: p };
}

function goalOps(ops: NutritionDualWriteOp[]) {
  return ops.filter((o) => o.kind === "goal-period-insert");
}

const FULL_GOAL: GoalFields = {
  dailyTargetKcal: 2400,
  dailyTargetProtein_g: 150,
  dailyTargetFat_g: 70,
  dailyTargetCarbs_g: 260,
  waterGoalMl: 2500,
};

describe("diff — коли емітується goal-period-insert", () => {
  it("емітить сходинку, коли змінився dailyTargetKcal", () => {
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs(FULL_GOAL)),
      stateWith(prefs({ ...FULL_GOAL, dailyTargetKcal: 1800 })),
    );
    const goals = goalOps(ops);
    expect(goals).toHaveLength(1);
    expect(goals[0]!.goal).toEqual({
      kcal: 1800,
      proteinG: 150,
      fatG: 70,
      carbsG: 260,
      waterMl: 2500,
    });
  });

  it("емітить сходинку на зміну БУДЬ-ЯКОГО макросу і води", () => {
    for (const field of [
      "dailyTargetProtein_g",
      "dailyTargetFat_g",
      "dailyTargetCarbs_g",
      "waterGoalMl",
    ] as const) {
      const ops = diffNutritionDualWriteOps(
        stateWith(prefs(FULL_GOAL)),
        stateWith(prefs({ ...FULL_GOAL, [field]: 999 })),
      );
      expect(goalOps(ops)).toHaveLength(1);
    }
  });

  it("НЕ емітить, коли змінилось не-цільове поле блоба", () => {
    // Тут і ховається шум: `prefsJson` — це весь `NutritionPrefs`, і
    // зміна нагадувань чи шаблонів страв породжувала б сходинку «ціль та
    // сама» щотижня.
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs({ ...FULL_GOAL, reminderHour: 12 })),
      stateWith(prefs({ ...FULL_GOAL, reminderHour: 20 })),
    );
    expect(goalOps(ops)).toHaveLength(0);
    // Старий шлях при цьому ПОЇХАВ — блоб таки змінився.
    expect(ops.some((o) => o.kind === "prefs-upsert")).toBe(true);
  });

  it("НЕ емітить, коли перший знімок узагалі без цілей", () => {
    // Юзер щойно відкрив модуль і ще нічого не хотів.
    const ops = diffNutritionDualWriteOps(
      stateWith(null),
      stateWith(prefs({ dailyTargetKcal: null, waterGoalMl: null })),
    );
    expect(goalOps(ops)).toHaveLength(0);
  });

  it("емітить на першу ж задану ціль (prev === null)", () => {
    const ops = diffNutritionDualWriteOps(
      stateWith(null),
      stateWith(prefs(FULL_GOAL)),
    );
    expect(goalOps(ops)).toHaveLength(1);
  });

  it("емітить, коли ціль ЗНЯЛИ (значення → null)", () => {
    // Зняття цілі — теж намір, і історія має його зафіксувати; інакше
    // резолвер вічно показував би стару ціль.
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs(FULL_GOAL)),
      stateWith(prefs({ ...FULL_GOAL, dailyTargetKcal: null })),
    );
    expect(goalOps(ops)[0]!.goal.kcal).toBeNull();
  });

  it("НЕ емітить на пошкоджений prefsJson, старий шлях не ламається", () => {
    const broken: NutritionPrefsSnapshot = {
      prefsJson: "{ це не json",
      activePantryId: "p1",
    };
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs(FULL_GOAL)),
      stateWith(broken),
    );
    expect(goalOps(ops)).toHaveLength(0);
    expect(ops.some((o) => o.kind === "prefs-upsert")).toBe(true);
  });

  it("нечислова ціль у блобі читається як null, а не як NaN", () => {
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs(FULL_GOAL)),
      stateWith(prefs({ ...FULL_GOAL, dailyTargetKcal: "2400" as never })),
    );
    expect(goalOps(ops)[0]!.goal.kcal).toBeNull();
  });
});

describe("diff — старий шлях лишився недоторканим", () => {
  it("prefs-upsert їде РАЗОМ зі сходинкою, а не замість неї", () => {
    // Критерій приймання стадії 1: `nutrition_prefs` і далі оновлюється,
    // тож жоден екран не змінює поведінку.
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs(FULL_GOAL)),
      stateWith(prefs({ ...FULL_GOAL, dailyTargetKcal: 1800 })),
    );
    expect(ops.map((o) => o.kind)).toEqual([
      "prefs-upsert",
      "goal-period-insert",
    ]);
  });

  it("зміна лише activePantryId не породжує сходинки", () => {
    const ops = diffNutritionDualWriteOps(
      stateWith(prefs(FULL_GOAL)),
      stateWith({ ...prefs(FULL_GOAL), activePantryId: "p2" }),
    );
    expect(goalOps(ops)).toHaveLength(0);
    expect(ops.some((o) => o.kind === "prefs-upsert")).toBe(true);
  });
});

describe("buildGoalPeriodId — детермінований id", () => {
  const goal = {
    kcal: 1800,
    proteinG: 140,
    fatG: 55,
    carbsG: 180,
    waterMl: 2500,
  };

  it("однаковий вхід → однаковий id (ретрай схлопується)", () => {
    expect(buildGoalPeriodId("2026-07-25", goal, "dev-1")).toBe(
      buildGoalPeriodId("2026-07-25", goal, "dev-1"),
    );
  });

  it("різні значення → різні id (справжня друга зміна лишається)", () => {
    expect(buildGoalPeriodId("2026-07-25", goal, "dev-1")).not.toBe(
      buildGoalPeriodId("2026-07-25", { ...goal, kcal: 1700 }, "dev-1"),
    );
  });

  it("null-и в різних полях НЕ схлопуються в один id", () => {
    // Без маркера `-` хвости `::1800::` збіглися б, і дві різні цілі
    // стали б однією сходинкою.
    const a = buildGoalPeriodId(
      "2026-07-25",
      { ...goal, proteinG: null },
      "dev-1",
    );
    const b = buildGoalPeriodId("2026-07-25", { ...goal, fatG: null }, "dev-1");
    expect(a).not.toBe(b);
  });

  it("різні дні і різні пристрої дають різні id", () => {
    expect(buildGoalPeriodId("2026-07-25", goal, "dev-1")).not.toBe(
      buildGoalPeriodId("2026-07-26", goal, "dev-1"),
    );
    expect(buildGoalPeriodId("2026-07-25", goal, "dev-1")).not.toBe(
      buildGoalPeriodId("2026-07-25", goal, "dev-2"),
    );
  });

  it("відсутній device-id не валить id", () => {
    expect(buildGoalPeriodId("2026-07-25", goal, null)).toContain(
      "unknown-device",
    );
  });
});

describe("adapter — запис сходинки і outbox", () => {
  function makeRecordingClient(): {
    client: SqliteMigrationClient;
    calls: Array<{ sql: string; params: unknown[] }>;
  } {
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
    return { client, calls };
  }

  const OP: NutritionDualWriteOp = {
    kind: "goal-period-insert",
    goal: {
      kcal: 1800,
      proteinG: 140,
      fatG: 55,
      carbsG: 180,
      waterMl: 2500,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fireSyncOutboxUpsert).mockClear();
    vi.spyOn(goalPeriodEnv, "deviceId").mockReturnValue("device-A");
    vi.spyOn(goalPeriodEnv, "tzOffsetMin").mockReturnValue(180);
  });

  it("пише INSERT OR IGNORE, без ON CONFLICT DO UPDATE", async () => {
    // Сходинка незмінна: виправлення — це НОВА сходинка.
    const { client, calls } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });
    const insert = calls.find((c) => c.sql.includes("nutrition_goal_periods"))!;
    expect(insert.sql).toMatch(/INSERT OR IGNORE INTO nutrition_goal_periods/);
    expect(insert.sql).not.toMatch(/ON CONFLICT/);
    expect(insert.sql).not.toMatch(/deleted_at/);
  });

  it("рахує effective_from у Kyiv, а не в UTC", async () => {
    // 2026-07-25T21:30Z — це вже 26-те в Києві (UTC+3 влітку). Юзер, що
    // міняє ціль о 23:30 у Лісабоні, має отримати київський день.
    const { client, calls } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T21:30:00.000Z",
    });
    const insert = calls.find((c) => c.sql.includes("nutrition_goal_periods"))!;
    expect(insert.params[2]).toBe("2026-07-26");
  });

  it("кладе origin='manual' і всі пʼять значень", async () => {
    const { client, calls } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });
    const insert = calls.find((c) => c.sql.includes("nutrition_goal_periods"))!;
    expect(insert.params.slice(3, 9)).toEqual([
      1800,
      140,
      55,
      180,
      2500,
      // 'backfill' ставить ЛИШЕ серверна міграція 087 і ніхто інший.
      "manual",
    ]);
  });

  it("ставить операцію в outbox для крос-девайсу", async () => {
    const { client } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });
    expect(fireSyncOutboxUpsert).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(fireSyncOutboxUpsert).mock.calls[0]![1];
    expect(payload.table).toBe("nutrition_goal_periods");
    expect(payload.op).toBe("insert");
    expect(payload.row["effective_from"]).toBe("2026-07-25");
    expect(payload.row["origin"]).toBe("manual");
    // id в outbox і в локальному INSERT — один і той самий.
    expect(payload.row["id"]).toBe(
      buildGoalPeriodId(
        "2026-07-25",
        {
          kcal: 1800,
          proteinG: 140,
          fatG: 55,
          carbsG: 180,
          waterMl: 2500,
        },
        "device-A",
      ),
    );
  });

  it("НЕ чіпає nutrition_prefs — його вже оновив старий шлях", async () => {
    // Дублювати означало б два UPDATE на одну дію користувача.
    const { client, calls } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });
    expect(calls.filter((c) => c.sql.includes("nutrition_prefs"))).toEqual([]);
  });

  it("пише tz_offset_min пристрою в локальний INSERT і в outbox (той самий патерн, що routine_completion_events)", async () => {
    const { client, calls } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });
    const insert = calls.find((c) => c.sql.includes("nutrition_goal_periods"))!;
    expect(insert.sql).toMatch(/tz_offset_min/);
    // Column order: id, user_id, effective_from, kcal, protein_g, fat_g,
    // carbs_g, water_ml, origin, tz_offset_min, created_at, updated_at.
    expect(insert.params[9]).toBe(180);

    const payload = vi.mocked(fireSyncOutboxUpsert).mock.calls[0]![1];
    expect(payload.row["tz_offset_min"]).toBe(180);
  });

  it("tz_offset_min падає на null, коли Date.getTimezoneOffset недоступний", async () => {
    vi.spyOn(goalPeriodEnv, "tzOffsetMin").mockReturnValue(null);
    const { client, calls } = makeRecordingClient();
    await applyNutritionDualWriteOps(client, [OP], {
      userId: "user_1",
      clientTs: "2026-07-25T10:00:00.000Z",
    });
    const insert = calls.find((c) => c.sql.includes("nutrition_goal_periods"))!;
    expect(insert.params[9]).toBeNull();
  });
});
