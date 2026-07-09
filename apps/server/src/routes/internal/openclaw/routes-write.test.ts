/**
 * Route-level coverage for `/api/internal/openclaw/write/post-to-topic`.
 *
 * Same pattern as `routes/internal/alerts.test.ts`: we mock the module
 * helpers (`postToTopic`, `recordTopicMessage`) — not `pool.query` — and mount
 * the write-router directly, without the bearer-auth middleware (that lives in
 * `routes/internal/index.ts`), so these tests stay focused on the handler's
 * post → archive wiring.
 *
 * Regression guard: коли Telegram-пост УЖЕ відправлено (`status: "posted"`),
 * збій дзеркалення в архів (`recordTopicMessage`) не має перетворюватись на
 * 5xx — інакше caller ретрайне і запостить ДУБЛЬ. Best-effort catch у
 * `routes-write.ts` тримає відповідь на 200.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postToTopicMock, recordTopicMessageMock } = vi.hoisted(() => ({
  postToTopicMock: vi.fn(),
  recordTopicMessageMock: vi.fn(),
}));

vi.mock("../../../modules/openclaw/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../modules/openclaw/index.js")>();
  return {
    ...actual,
    postToTopic: postToTopicMock,
  };
});

vi.mock("../../../modules/topic-archive/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../modules/topic-archive/index.js")
    >();
  return {
    ...actual,
    recordTopicMessage: recordTopicMessageMock,
  };
});

const COLD_IMPORT_TIMEOUT_MS = 60_000;

async function makeApp() {
  const { registerWriteRoutes } = await import("./routes-write.js");
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerWriteRoutes(router, {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  } as never);
  app.use(router);
  return app;
}

describe("POST /api/internal/openclaw/write/post-to-topic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordTopicMessageMock.mockResolvedValue({ id: 1, alreadyArchived: false });
  });

  it(
    "returns 200 with the post result on the happy path (both succeed)",
    async () => {
      postToTopicMock.mockResolvedValueOnce({
        status: "posted",
        messageId: 77,
      });
      const app = await makeApp();
      const res = await request(app)
        .post("/api/internal/openclaw/write/post-to-topic")
        .send({ topic: "control_plane", text: "deploy green" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "posted", messageId: 77 });
      expect(recordTopicMessageMock).toHaveBeenCalledTimes(1);
    },
    COLD_IMPORT_TIMEOUT_MS,
  );

  it(
    "still returns 200 when the Telegram send succeeded but the archive write throws (no duplicate-retry 500)",
    async () => {
      postToTopicMock.mockResolvedValueOnce({
        status: "posted",
        messageId: 42,
      });
      recordTopicMessageMock.mockRejectedValueOnce(
        new Error("db-archive-down"),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/internal/openclaw/write/post-to-topic")
        .send({ topic: "control_plane", text: "already sent to telegram" });
      // The non-idempotent Telegram send already happened; the archive failure
      // must be swallowed so the caller does NOT retry and post a duplicate.
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "posted", messageId: 42 });
      expect(postToTopicMock).toHaveBeenCalledTimes(1);
      expect(recordTopicMessageMock).toHaveBeenCalledTimes(1);
    },
    COLD_IMPORT_TIMEOUT_MS,
  );

  it(
    "does not touch the archive when the post was not_configured",
    async () => {
      postToTopicMock.mockResolvedValueOnce({ status: "not_configured" });
      const app = await makeApp();
      const res = await request(app)
        .post("/api/internal/openclaw/write/post-to-topic")
        .send({ topic: "control_plane", text: "no bot token" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "not_configured" });
      expect(recordTopicMessageMock).not.toHaveBeenCalled();
    },
    COLD_IMPORT_TIMEOUT_MS,
  );
});
