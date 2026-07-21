import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function makeApp(queryMock = vi.fn().mockResolvedValue({ rows: [] })) {
  const { createGovernanceInternalRouter } = await import("./governance.js");
  const app = express();
  app.use(express.json());
  app.use(
    createGovernanceInternalRouter({ pool: { query: queryMock } as never }),
  );
  return app;
}

describe("createGovernanceInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing numeric ruleId before reaching the DB", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/governance/audit")
      .send({ message: "Rule violated" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "ruleId is required (number)" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects missing message before reaching the DB", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/governance/audit")
      .send({ ruleId: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "message is required" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("inserts audit rows with defaults, truncation, raw JSON, and numeric id", async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "123" }] });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/governance/audit")
      .send({
        ruleId: 1.9,
        ruleTitle: "DB types",
        severity: "critical",
        prNumber: 382.8,
        commitSha: "abcdef",
        filePath: "apps/server/src/routes/internal/governance.ts",
        lineNumber: 86.7,
        message: "id leaked as string",
        raw: { route: "governance" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 123 });
    const [, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(values).toEqual([
      1,
      "DB types",
      "blocker",
      382,
      "abcdef",
      "apps/server/src/routes/internal/governance.ts",
      86,
      "id leaked as string",
      JSON.stringify({ route: "governance" }),
    ]);
  });
});
