import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import {
  resolveServerBuildId,
  serverBuildIdMiddleware,
} from "./buildIdHeader.js";

describe("resolveServerBuildId", () => {
  it("повертає null коли всі змінні порожні", () => {
    expect(resolveServerBuildId({})).toBeNull();
  });

  it("ігнорує whitespace-only значення", () => {
    expect(
      resolveServerBuildId({
        SENTRY_RELEASE: "   ",
        RAILWAY_GIT_COMMIT_SHA: "   ",
      }),
    ).toBeNull();
  });

  it("віддає SENTRY_RELEASE з найвищим пріоритетом", () => {
    expect(
      resolveServerBuildId({
        SENTRY_RELEASE: "explicit",
        RAILWAY_GIT_COMMIT_SHA: "railsha",
        VERCEL_GIT_COMMIT_SHA: "vercel0",
        GITHUB_SHA: "github0",
        BUILD_ID: "build00",
      }),
    ).toBe("explici");
  });

  it("падає на RAILWAY_GIT_COMMIT_SHA коли SENTRY_RELEASE відсутній", () => {
    expect(
      resolveServerBuildId({
        RAILWAY_GIT_COMMIT_SHA: "railwayfull",
        VERCEL_GIT_COMMIT_SHA: "vercelfull",
      }),
    ).toBe("railway");
  });

  it("падає на VERCEL_GIT_COMMIT_SHA → GITHUB_SHA → BUILD_ID", () => {
    expect(resolveServerBuildId({ VERCEL_GIT_COMMIT_SHA: "abcdef123" })).toBe(
      "abcdef1",
    );
    expect(resolveServerBuildId({ GITHUB_SHA: "gh1234567" })).toBe("gh12345");
    expect(resolveServerBuildId({ BUILD_ID: "b1234567" })).toBe("b123456");
  });

  it("обрізає до 7 символів незалежно від довжини джерела", () => {
    expect(
      resolveServerBuildId({
        SENTRY_RELEASE: "1234567890abcdef",
      }),
    ).toBe("1234567");
  });
});

describe("serverBuildIdMiddleware", () => {
  it("ставить X-Server-Build-Id коли env містить SHA", async () => {
    const app = express();
    app.use(serverBuildIdMiddleware({ RAILWAY_GIT_COMMIT_SHA: "abc1234567" }));
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.headers["x-server-build-id"]).toBe("abc1234");
  });

  it("не ставить хедер коли env порожній (локальний dev)", async () => {
    const app = express();
    app.use(serverBuildIdMiddleware({}));
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.headers["x-server-build-id"]).toBeUndefined();
  });
});
