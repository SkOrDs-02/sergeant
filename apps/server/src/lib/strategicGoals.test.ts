/**
 * PR-34 — `strategicGoals` unit tests.
 *
 * Тестуємо лише pure helpers + mocked `pg.Pool` shape. Реальна table
 * round-trip / index-check / trigger живе в integration-тесті
 * `migrations/__tests__/062-strategic-goals.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import {
  carryGoalToNextWeek,
  createGoal,
  createGoalsBatch,
  getGoalById,
  listGoals,
  listGoalsForWeek,
  MAX_GOAL_TEXT_BYTES,
  STRATEGIC_GOAL_PERSONAS,
  STRATEGIC_GOAL_STATUSES,
  toKyivDateString,
  updateGoalStatus,
} from "./strategicGoals.js";

vi.mock("../obs/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

interface FakeRow {
  id: string;
  persona: string;
  founder_user_id: string;
  week_start: Date | string;
  goal_text: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function makeFakeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "42",
    persona: "finyk",
    founder_user_id: "user-1",
    week_start: "2026-05-11",
    goal_text: "Test goal",
    status: "active",
    created_at: new Date("2026-05-13T09:00:00Z"),
    updated_at: new Date("2026-05-13T09:00:00Z"),
    ...overrides,
  };
}

function mockPool(rows: FakeRow[]): {
  pool: Pool;
  queryFn: ReturnType<typeof vi.fn>;
} {
  const queryFn = vi.fn(
    async <T extends QueryResultRow = QueryResultRow>(): Promise<
      QueryResult<T>
    > => ({
      rows: rows as unknown as T[],
      rowCount: rows.length,
      command: "INSERT",
      oid: 0,
      fields: [],
    }),
  );
  const pool = { query: queryFn } as unknown as Pool;
  return { pool, queryFn };
}

function failingPool(error: Error): Pool {
  const queryFn = vi.fn(async () => {
    throw error;
  });
  return { query: queryFn } as unknown as Pool;
}

describe("toKyivDateString", () => {
  it("returns ISO date string unchanged when input is already YYYY-MM-DD", () => {
    expect(toKyivDateString("2026-05-11")).toBe("2026-05-11");
  });

  it("converts Date to Kyiv local YYYY-MM-DD", () => {
    // 2026-05-11T21:30:00Z (UTC) = 2026-05-12T00:30:00 Kyiv (in summer DST)
    const d = new Date("2026-05-11T21:30:00Z");
    expect(toKyivDateString(d)).toBe("2026-05-12");
  });

  it("handles edge of year boundary correctly", () => {
    // 2026-01-01T00:00:00 Kyiv = 2025-12-31T22:00:00Z UTC
    const d = new Date("2025-12-31T22:00:00Z");
    expect(toKyivDateString(d)).toBe("2026-01-01");
  });
});

describe("createGoal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("INSERTs and returns the row with bigint id coerced to number", async () => {
    const { pool, queryFn } = mockPool([
      makeFakeRow({ id: "9007199254740991" }),
    ]);
    const result = await createGoal(pool, {
      persona: "finyk",
      founderUserId: "user-1",
      weekStart: "2026-05-11",
      goalText: "test",
    });
    expect(result).not.toBeNull();
    expect(typeof result!.id).toBe("number");
    expect(result!.id).toBe(9007199254740991);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("includes status column when status is provided", async () => {
    const { pool, queryFn } = mockPool([
      makeFakeRow({ status: "carried_over" }),
    ]);
    const result = await createGoal(pool, {
      persona: "fizruk",
      founderUserId: "user-1",
      weekStart: "2026-05-11",
      goalText: "test",
      status: "carried_over",
    });
    expect(result?.status).toBe("carried_over");
    const callArgs = queryFn.mock.calls[0]!;
    // 5-column INSERT варіант (зі status-ом).
    expect(callArgs[0]).toContain("status");
    expect(callArgs[0]).toContain("$5");
    expect(callArgs[1]).toEqual([
      "fizruk",
      "user-1",
      "2026-05-11",
      "test",
      "carried_over",
    ]);
  });

  it("converts Date weekStart to Kyiv YYYY-MM-DD", async () => {
    const { pool, queryFn } = mockPool([makeFakeRow()]);
    await createGoal(pool, {
      persona: "finyk",
      founderUserId: "user-1",
      weekStart: new Date("2026-05-11T08:00:00Z"),
      goalText: "test",
    });
    const params = queryFn.mock.calls[0]![1] as unknown[];
    expect(params[2]).toBe("2026-05-11");
  });

  it("truncates goalText to MAX_GOAL_TEXT_BYTES", async () => {
    const oversized = "x".repeat(MAX_GOAL_TEXT_BYTES + 100);
    const { pool, queryFn } = mockPool([
      makeFakeRow({ goal_text: oversized.slice(0, MAX_GOAL_TEXT_BYTES) }),
    ]);
    await createGoal(pool, {
      persona: "finyk",
      founderUserId: "user-1",
      weekStart: "2026-05-11",
      goalText: oversized,
    });
    const params = queryFn.mock.calls[0]![1] as unknown[];
    const sentText = params[3] as string;
    expect(Buffer.byteLength(sentText, "utf8")).toBeLessThanOrEqual(
      MAX_GOAL_TEXT_BYTES,
    );
  });

  it("throws on invalid persona — caught by fail-open and returns null", async () => {
    const { pool } = mockPool([makeFakeRow()]);
    const result = await createGoal(pool, {
      // @ts-expect-error invalid persona at runtime
      persona: "invalid",
      founderUserId: "user-1",
      weekStart: "2026-05-11",
      goalText: "test",
    });
    expect(result).toBeNull();
  });

  it("fail-open: returns null on DB error", async () => {
    const pool = failingPool(new Error("pg connection lost"));
    const result = await createGoal(pool, {
      persona: "finyk",
      founderUserId: "user-1",
      weekStart: "2026-05-11",
      goalText: "test",
    });
    expect(result).toBeNull();
  });
});

describe("listGoalsForWeek", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped goals with bigint id coerced", async () => {
    const { pool } = mockPool([
      makeFakeRow({ id: "1", persona: "finyk" }),
      makeFakeRow({ id: "2", persona: "fizruk" }),
    ]);
    const goals = await listGoalsForWeek(pool, { weekStart: "2026-05-11" });
    expect(goals).toHaveLength(2);
    expect(goals.every((g) => typeof g.id === "number")).toBe(true);
    expect(goals[0]!.persona).toBe("finyk");
  });

  it("converts Date weekStart column to YYYY-MM-DD", async () => {
    const { pool } = mockPool([
      makeFakeRow({ week_start: new Date("2026-05-11T00:00:00Z") }),
    ]);
    const goals = await listGoalsForWeek(pool, { weekStart: "2026-05-11" });
    expect(goals[0]!.weekStart).toBe("2026-05-11");
  });

  it("adds persona filter when provided", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoalsForWeek(pool, {
      weekStart: "2026-05-11",
      persona: "nutrition",
    });
    const sql = queryFn.mock.calls[0]![0] as string;
    const params = queryFn.mock.calls[0]![1] as unknown[];
    expect(sql).toMatch(/persona\s*=\s*\$2/);
    expect(params).toEqual(["2026-05-11", "nutrition"]);
  });

  it("adds both persona and founderUserId filters when provided", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoalsForWeek(pool, {
      weekStart: "2026-05-11",
      persona: "routine",
      founderUserId: "user-1",
    });
    const sql = queryFn.mock.calls[0]![0] as string;
    const params = queryFn.mock.calls[0]![1] as unknown[];
    expect(sql).toMatch(/persona\s*=\s*\$2/);
    expect(sql).toMatch(/founder_user_id\s*=\s*\$3/);
    expect(params).toEqual(["2026-05-11", "routine", "user-1"]);
  });

  it("adds only founderUserId filter when persona absent", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoalsForWeek(pool, {
      weekStart: "2026-05-11",
      founderUserId: "user-7",
    });
    const sql = queryFn.mock.calls[0]![0] as string;
    const params = queryFn.mock.calls[0]![1] as unknown[];
    expect(sql).toMatch(/founder_user_id\s*=\s*\$2/);
    expect(sql).not.toMatch(/persona\s*=/);
    expect(params).toEqual(["2026-05-11", "user-7"]);
  });

  it("fail-open: returns [] on DB error", async () => {
    const pool = failingPool(new Error("pg connection lost"));
    const goals = await listGoalsForWeek(pool, { weekStart: "2026-05-11" });
    expect(goals).toEqual([]);
  });
});

describe("updateGoalStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status and returns updated row", async () => {
    const { pool } = mockPool([makeFakeRow({ id: "7", status: "achieved" })]);
    const result = await updateGoalStatus(pool, 7, "achieved");
    expect(result?.id).toBe(7);
    expect(result?.status).toBe("achieved");
  });

  it("returns null when no row matched", async () => {
    const { pool } = mockPool([]);
    const result = await updateGoalStatus(pool, 999, "achieved");
    expect(result).toBeNull();
  });

  it("throws on invalid status — caught by fail-open and returns null", async () => {
    const { pool } = mockPool([makeFakeRow()]);
    const result = await updateGoalStatus(
      pool,
      1,
      // @ts-expect-error invalid status at runtime
      "invalid",
    );
    expect(result).toBeNull();
  });

  it("fail-open: returns null on DB error", async () => {
    const pool = failingPool(new Error("pg connection lost"));
    const result = await updateGoalStatus(pool, 1, "achieved");
    expect(result).toBeNull();
  });
});

describe("createGoalsBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns array of created goals; skips failures", async () => {
    let callCount = 0;
    const queryFn = vi.fn(async () => {
      callCount += 1;
      if (callCount === 2) throw new Error("simulated fail");
      return {
        rows: [makeFakeRow({ id: String(callCount) })],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      };
    });
    const pool = { query: queryFn } as unknown as Pool;
    const goals = await createGoalsBatch(pool, [
      {
        persona: "finyk",
        founderUserId: "u",
        weekStart: "2026-05-11",
        goalText: "a",
      },
      {
        persona: "fizruk",
        founderUserId: "u",
        weekStart: "2026-05-11",
        goalText: "b",
      },
      {
        persona: "nutrition",
        founderUserId: "u",
        weekStart: "2026-05-11",
        goalText: "c",
      },
    ]);
    expect(goals).toHaveLength(2);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });
});

describe("getGoalById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns coerced row when goal exists", async () => {
    const { pool, queryFn } = mockPool([makeFakeRow({ id: "55" })]);
    const goal = await getGoalById(pool, 55);
    expect(goal).not.toBeNull();
    expect(goal!.id).toBe(55);
    expect(typeof goal!.id).toBe("number");
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryFn.mock.calls[0]![1]).toEqual([55]);
  });

  it("returns null when row not found (rowCount=0)", async () => {
    const { pool } = mockPool([]);
    expect(await getGoalById(pool, 1)).toBeNull();
  });

  it("fail-open on DB error", async () => {
    const pool = failingPool(new Error("pg connection lost"));
    expect(await getGoalById(pool, 1)).toBeNull();
  });
});

describe("listGoals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs the no-filter variant when nothing passed", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoals(pool, {});
    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0]!;
    expect(sql).toContain("FROM strategic_goals");
    expect(sql).not.toMatch(/WHERE/);
    // Limit-only param.
    expect(params).toEqual([50]);
  });

  it("binds founderUserId + persona + status", async () => {
    const { pool, queryFn } = mockPool([makeFakeRow()]);
    await listGoals(pool, {
      founderUserId: "user-1",
      persona: "finyk",
      status: "active",
      limit: 25,
    });
    const [sql, params] = queryFn.mock.calls[0]!;
    expect(sql).toContain("founder_user_id = $1");
    expect(sql).toContain("persona = $2");
    expect(sql).toContain("status = $3");
    expect(params).toEqual(["user-1", "finyk", "active", 25]);
  });

  it("binds status-only filter", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoals(pool, { status: "achieved" });
    const [sql, params] = queryFn.mock.calls[0]!;
    expect(sql).toContain("status = $1");
    expect(params).toEqual(["achieved", 50]);
  });

  it("applies hard-cap of 200 when caller asks for more", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoals(pool, { limit: 9999 });
    const params = queryFn.mock.calls[0]![1];
    expect(params[params.length - 1]).toBe(200);
  });

  it("clamps limit at minimum of 1", async () => {
    const { pool, queryFn } = mockPool([]);
    await listGoals(pool, { limit: 0 });
    const params = queryFn.mock.calls[0]![1];
    expect(params[params.length - 1]).toBe(1);
  });

  it("fail-open on DB error returns []", async () => {
    const pool = failingPool(new Error("pg gone"));
    expect(await listGoals(pool, {})).toEqual([]);
  });
});

describe("carryGoalToNextWeek", () => {
  beforeEach(() => vi.clearAllMocks());

  it("UPDATEs week_start += 7 days and sets status=carried_over", async () => {
    const { pool, queryFn } = mockPool([
      makeFakeRow({
        id: "42",
        week_start: "2026-05-18",
        status: "carried_over",
      }),
    ]);
    const goal = await carryGoalToNextWeek(pool, 42);
    expect(goal).not.toBeNull();
    expect(goal!.id).toBe(42);
    expect(goal!.status).toBe("carried_over");
    expect(goal!.weekStart).toBe("2026-05-18");
    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0]!;
    expect(sql).toMatch(/UPDATE\s+strategic_goals/i);
    expect(sql).toMatch(/week_start\s*=\s*week_start\s*\+/i);
    expect(sql).toMatch(/status\s*=\s*'carried_over'/i);
    expect(params).toEqual([42]);
  });

  it("returns null when goal does not exist (rowCount=0)", async () => {
    const { pool } = mockPool([]);
    expect(await carryGoalToNextWeek(pool, 999)).toBeNull();
  });

  it("fail-open on DB error", async () => {
    const pool = failingPool(new Error("pg gone"));
    expect(await carryGoalToNextWeek(pool, 1)).toBeNull();
  });
});

describe("listGoalsForWeek with status filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds week_start + status when only status is passed", async () => {
    const { pool, queryFn } = mockPool([makeFakeRow()]);
    await listGoalsForWeek(pool, {
      weekStart: "2026-05-11",
      status: "abandoned",
    });
    const [sql, params] = queryFn.mock.calls[0]!;
    expect(sql).toContain("week_start = $1");
    expect(sql).toContain("status = $2");
    expect(params).toEqual(["2026-05-11", "abandoned"]);
  });
});

describe("constants integrity", () => {
  it("has 4 personas", () => {
    expect(STRATEGIC_GOAL_PERSONAS).toHaveLength(4);
    expect(STRATEGIC_GOAL_PERSONAS).toEqual([
      "finyk",
      "fizruk",
      "nutrition",
      "routine",
    ]);
  });

  it("has 4 lifecycle statuses (matches CHECK constraint in migration 062)", () => {
    expect(STRATEGIC_GOAL_STATUSES).toEqual([
      "active",
      "achieved",
      "abandoned",
      "carried_over",
    ]);
  });
});
