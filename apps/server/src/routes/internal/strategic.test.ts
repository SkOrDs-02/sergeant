import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const goalMocks = vi.hoisted(() => ({
  carryGoalToNextWeek: vi.fn(),
  createGoal: vi.fn(),
  getGoalById: vi.fn(),
  listGoals: vi.fn(),
  listGoalsForWeek: vi.fn(),
  updateGoalStatus: vi.fn(),
}));

vi.mock("../../lib/strategicGoals.js", () => ({
  STRATEGIC_GOAL_PERSONAS: ["finyk", "fizruk", "nutrition", "routine"],
  STRATEGIC_GOAL_STATUSES: ["active", "achieved", "dropped", "carried_over"],
  ...goalMocks,
}));

async function makeApp() {
  const { createStrategicInternalRouter } = await import("./strategic.js");
  const app = express();
  app.use(express.json());
  app.use(createStrategicInternalRouter({ pool: {} as never }));
  app.use(
    (
      err: { status?: number; statusCode?: number; code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(err.status ?? err.statusCode ?? 500).json({
        ok: false,
        code: err.code ?? "ERROR",
      });
    },
  );
  return app;
}

const goal = {
  id: 7,
  persona: "finyk",
  founderUserId: "founder-1",
  weekStart: "2026-06-22",
  goalText: "Ship the thing",
  status: "active",
};

describe("createStrategicInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    goalMocks.createGoal.mockResolvedValue(goal);
    goalMocks.listGoalsForWeek.mockResolvedValue([goal]);
    goalMocks.listGoals.mockResolvedValue([goal]);
    goalMocks.getGoalById.mockResolvedValue(goal);
    goalMocks.updateGoalStatus.mockResolvedValue({
      ...goal,
      status: "achieved",
    });
    goalMocks.carryGoalToNextWeek.mockResolvedValue({
      ...goal,
      status: "carried_over",
      weekStart: "2026-06-29",
    });
  });

  it("creates weekly check-in and manual goals", async () => {
    const app = await makeApp();

    const weekly = await request(app)
      .post("/api/internal/strategic/weekly-checkin")
      .send({
        persona: "finyk",
        founderUserId: "founder-1",
        weekStart: "2026-06-22",
      });
    expect(weekly.body).toEqual({ ok: true, goal });
    expect(goalMocks.createGoal).toHaveBeenCalledWith(
      {},
      {
        persona: "finyk",
        founderUserId: "founder-1",
        weekStart: "2026-06-22",
        goalText: "Weekly strategic kickoff (placeholder)",
      },
    );

    const manual = await request(app)
      .post("/api/internal/strategic/goals")
      .send({
        persona: "finyk",
        founderUserId: "founder-1",
        weekStart: "2026-06-22",
        goalText: "Ship the thing",
        status: "active",
      });
    expect(manual.body).toEqual({ ok: true, goal });
    expect(goalMocks.createGoal).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({ status: "active" }),
    );
  });

  it("lists, fetches, updates and carries goals", async () => {
    const app = await makeApp();

    const weekList = await request(app)
      .post("/api/internal/strategic/goals/list")
      .send({
        weekStart: "2026-06-22",
        persona: "finyk",
        founderUserId: "founder-1",
        status: "active",
      });
    const globalList = await request(app)
      .post("/api/internal/strategic/list")
      .send({ founderUserId: "founder-1", limit: 25 });
    const fetched = await request(app)
      .post("/api/internal/strategic/goal")
      .send({ id: 7 });
    const updated = await request(app)
      .post("/api/internal/strategic/goals/status")
      .send({ id: 7, status: "achieved" });
    const carried = await request(app)
      .post("/api/internal/strategic/goals/carry")
      .send({ id: 7 });

    expect(weekList.body).toEqual({ ok: true, goals: [goal] });
    expect(globalList.body).toEqual({ ok: true, goals: [goal] });
    expect(fetched.body).toEqual({ ok: true, goal });
    expect(updated.body).toEqual({
      ok: true,
      goal: { ...goal, status: "achieved" },
    });
    expect(carried.body).toEqual({
      ok: true,
      goal: { ...goal, status: "carried_over", weekStart: "2026-06-29" },
    });

    expect(goalMocks.listGoalsForWeek).toHaveBeenCalledWith(
      {},
      {
        weekStart: "2026-06-22",
        persona: "finyk",
        founderUserId: "founder-1",
        status: "active",
      },
    );
    expect(goalMocks.listGoals).toHaveBeenCalledWith(
      {},
      { founderUserId: "founder-1", limit: 25 },
    );
    expect(goalMocks.getGoalById).toHaveBeenCalledWith({}, 7);
    expect(goalMocks.updateGoalStatus).toHaveBeenCalledWith({}, 7, "achieved");
    expect(goalMocks.carryGoalToNextWeek).toHaveBeenCalledWith({}, 7);
  });

  it("returns fail-open bodies when helper operations return null", async () => {
    const app = await makeApp();
    goalMocks.createGoal
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    goalMocks.getGoalById.mockResolvedValueOnce(null);
    goalMocks.updateGoalStatus.mockResolvedValueOnce(null);
    goalMocks.carryGoalToNextWeek.mockResolvedValueOnce(null);

    const weekly = await request(app)
      .post("/api/internal/strategic/weekly-checkin")
      .send({
        persona: "finyk",
        founderUserId: "founder-1",
        weekStart: "2026-06-22",
      });
    const manual = await request(app)
      .post("/api/internal/strategic/goals")
      .send({
        persona: "finyk",
        founderUserId: "founder-1",
        weekStart: "2026-06-22",
        goalText: "Ship the thing",
      });
    const fetched = await request(app)
      .post("/api/internal/strategic/goal")
      .send({ id: 7 });
    const updated = await request(app)
      .post("/api/internal/strategic/goals/status")
      .send({ id: 7, status: "achieved" });
    const carried = await request(app)
      .post("/api/internal/strategic/goals/carry")
      .send({ id: 7 });

    expect(weekly.body).toEqual({ ok: false, error: "create_failed" });
    expect(manual.body).toEqual({ ok: false, error: "create_failed" });
    expect(fetched.body).toEqual({ ok: false, error: "not_found" });
    expect(updated.body).toEqual({ ok: false, error: "update_failed" });
    expect(carried.body).toEqual({ ok: false, error: "carry_failed" });
  });

  it("passes validation errors to the app error handler", async () => {
    const app = await makeApp();

    const res = await request(app).post("/api/internal/strategic/goals").send({
      persona: "finyk",
      founderUserId: "",
      weekStart: "not-a-date",
      goalText: "",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, code: "VALIDATION" });
    expect(goalMocks.createGoal).not.toHaveBeenCalled();
  });
});
