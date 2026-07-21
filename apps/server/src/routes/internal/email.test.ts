import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function makeApp(queryMock = vi.fn().mockResolvedValue({ rows: [] })) {
  const { createEmailInternalRouter } = await import("./email.js");
  const app = express();
  app.use(express.json());
  app.use(createEmailInternalRouter({ pool: { query: queryMock } as never }));
  return app;
}

describe("createEmailInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects /email/sent when required campaign fields are missing", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/email/sent")
      .send({ campaignKey: "launch-drip" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "campaignKey, recipientId and recipientEmailHash are required",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("upserts /email/sent with defaults and coerces bigint id to number", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "42", xmax: "0" }],
    });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/email/sent")
      .send({
        campaignKey: "launch-drip",
        recipientId: "user_opaque",
        recipientEmailHash: "sha256:abc",
        raw: { provider: "resend", tags: ["welcome"] },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 42, isNew: true });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(values).toEqual([
      "launch-drip",
      "user_opaque",
      "sha256:abc",
      "resend",
      null,
      null,
      JSON.stringify({ provider: "resend", tags: ["welcome"] }),
    ]);
  });

  it("rejects unknown email event types before writing", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);

    const res = await request(app).post("/api/internal/email/event").send({
      providerMessageId: "msg_1",
      eventType: "processed",
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid eventType" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("inserts /email/event with default provider/time and numeric id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T08:30:00.000Z"));
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ id: "77" }] });
    const app = await makeApp(queryMock);

    const res = await request(app)
      .post("/api/internal/email/event")
      .send({
        providerMessageId: "msg_1",
        eventType: "opened",
        raw: { userAgent: "test" },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 77 });
    const [, values] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(values).toEqual([
      "resend",
      "msg_1",
      "opened",
      "2026-05-15T08:30:00.000Z",
      null,
      null,
      JSON.stringify({ userAgent: "test" }),
    ]);
  });
});
