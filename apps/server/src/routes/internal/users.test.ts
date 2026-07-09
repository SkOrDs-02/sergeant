import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function makeApp(queryMock = vi.fn().mockResolvedValue({ rows: [] })) {
  const { createUsersInternalRouter } = await import("./users.js");
  const app = express();
  app.use(express.json());
  app.use(createUsersInternalRouter({ pool: { query: queryMock } as never }));
  return app;
}

describe("createUsersInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a fractional `days` before reaching the DB", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app).get("/api/internal/users/cohort?days=1.9");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "days must be a non-negative integer <= 365",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric `days` before reaching the DB", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app).get("/api/internal/users/cohort?days=abc");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "days must be a non-negative integer <= 365",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("selects the cohort by an Europe/Kyiv date, never UTC", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [] });
    const app = await makeApp(queryMock);

    const res = await request(app).get("/api/internal/users/cohort?days=7");

    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain("'Europe/Kyiv'");
    expect(sql).not.toContain("AT TIME ZONE 'UTC'");
    // integer `days` is forwarded verbatim, no truncation side-effects
    expect(queryMock.mock.calls[0]?.[1]?.[0]).toBe(7);
  });
});
