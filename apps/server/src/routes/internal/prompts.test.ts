import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  readFile: readFileMock,
}));

async function makeApp(): Promise<express.Express> {
  const { createPromptsInternalRouter } = await import("./prompts.js");
  const app = express();
  app.use(createPromptsInternalRouter());
  return app;
}

describe("createPromptsInternalRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves markdown prompts for safe namespace and slug segments", async () => {
    readFileMock.mockResolvedValueOnce("# Prompt\n\nUse tools carefully.");
    const app = await makeApp();

    const res = await request(app).get(
      "/api/internal/prompts/openclaw/before-dispatch",
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.text).toBe("# Prompt\n\nUse tools carefully.");
    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(String(readFileMock.mock.calls[0]?.[0])).toContain(
      "ai-prompts/openclaw/before-dispatch.md",
    );
  });

  it("rejects unsafe prompt segments before reading from disk", async () => {
    const app = await makeApp();

    const res = await request(app).get("/api/internal/prompts/OpenClaw/prompt");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid prompt slug" });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("returns 404 when a safe prompt path is absent", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    const app = await makeApp();

    const res = await request(app).get(
      "/api/internal/prompts/openclaw/missing",
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Prompt not found" });
  });
});
