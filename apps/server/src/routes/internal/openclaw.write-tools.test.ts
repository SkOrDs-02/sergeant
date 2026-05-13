import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  commitToStrategyDocMock,
  createGithubIssueMock,
  postToTopicMock,
  pauseWorkflowMock,
  muteSentryAlertMock,
  recordTopicMessageMock,
} = vi.hoisted(() => ({
  commitToStrategyDocMock: vi.fn(),
  createGithubIssueMock: vi.fn(),
  postToTopicMock: vi.fn(),
  pauseWorkflowMock: vi.fn(),
  muteSentryAlertMock: vi.fn(),
  recordTopicMessageMock: vi.fn(),
}));

vi.mock("../../modules/openclaw/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/openclaw/index.js")>();
  return {
    ...actual,
    commitToStrategyDoc: commitToStrategyDocMock,
    createGithubIssue: createGithubIssueMock,
    postToTopic: postToTopicMock,
    pauseWorkflow: pauseWorkflowMock,
    muteSentryAlert: muteSentryAlertMock,
  };
});

vi.mock("../../modules/topic-archive/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../modules/topic-archive/index.js")
    >();
  return {
    ...actual,
    recordTopicMessage: recordTopicMessageMock,
  };
});

async function makeApp() {
  const { createOpenClawInternalRouter } = await import("./openclaw.js");
  const app = express();
  app.use(express.json());
  app.use(
    createOpenClawInternalRouter({
      pool: {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      } as never,
    }),
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/internal/openclaw/write/*", () => {
  it("forwards strategy-doc writes and maps allowlist failures to 400", async () => {
    commitToStrategyDocMock.mockResolvedValueOnce({
      status: "opened",
      prUrl: "https://github.com/owner/repo/pull/1",
    });
    const app = await makeApp();

    const ok = await request(app)
      .post("/api/internal/openclaw/write/strategy-doc")
      .send({
        path: "docs/strategy/roadmap.md",
        content: "# Roadmap\n",
        message: "refresh roadmap",
        repo: "owner/repo",
      });
    expect(ok.status).toBe(200);
    expect(commitToStrategyDocMock).toHaveBeenCalledWith({
      path: "docs/strategy/roadmap.md",
      content: "# Roadmap\n",
      message: "refresh roadmap",
      repo: "owner/repo",
    });

    const { OpenClawWriteAllowlistError } =
      await import("../../modules/openclaw/write-tools.js");
    commitToStrategyDocMock.mockRejectedValueOnce(
      new OpenClawWriteAllowlistError("bad path"),
    );
    const rejected = await request(app)
      .post("/api/internal/openclaw/write/strategy-doc")
      .send({
        path: "docs/secrets.md",
        content: "# nope\n",
        message: "bad",
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      error: "allowlist_fail",
      message: "bad path",
    });
  });

  it("validates and forwards github-issue writes", async () => {
    createGithubIssueMock.mockResolvedValueOnce({
      status: "opened",
      issueNumber: 77,
      issueUrl: "https://github.com/owner/repo/issues/77",
    });
    const app = await makeApp();

    const res = await request(app)
      .post("/api/internal/openclaw/write/github-issue")
      .send({
        title: "Check retries",
        body: "Retries are noisy",
        labels: ["ops"],
        repo: "owner/repo",
      });

    expect(res.status).toBe(200);
    expect(res.body.issueNumber).toBe(77);
    expect(createGithubIssueMock).toHaveBeenCalledWith({
      title: "Check retries",
      body: "Retries are noisy",
      labels: ["ops"],
      repo: "owner/repo",
    });

    const invalid = await request(app)
      .post("/api/internal/openclaw/write/github-issue")
      .send({ title: "", body: "x" });
    expect(invalid.status).toBe(400);
  });

  it("archives successful topic posts and skips failed posts", async () => {
    postToTopicMock.mockResolvedValueOnce({
      status: "posted",
      topic: "engineering",
      messageId: 4242,
    });
    recordTopicMessageMock.mockResolvedValueOnce({
      id: 10,
      alreadyArchived: false,
    });
    const app = await makeApp();

    const posted = await request(app)
      .post("/api/internal/openclaw/write/post-to-topic")
      .send({ topic: "engineering", text: "Release starts" });
    expect(posted.status).toBe(200);
    expect(recordTopicMessageMock).toHaveBeenCalledWith(expect.anything(), {
      topic: "engineering",
      text: "Release starts",
      source: "post_to_topic",
      messageId: 4242,
      dedupeKey: null,
      metadata: { messageId: 4242 },
    });

    postToTopicMock.mockResolvedValueOnce({
      status: "not_configured",
      topic: "engineering",
    });
    const softFail = await request(app)
      .post("/api/internal/openclaw/write/post-to-topic")
      .send({ topic: "engineering", text: "Release starts" });
    expect(softFail.status).toBe(200);
    expect(recordTopicMessageMock).toHaveBeenCalledTimes(1);
  });

  it("forwards pause-workflow and mute-alert payloads", async () => {
    pauseWorkflowMock.mockResolvedValueOnce({
      status: "paused",
      workflowId: "wf_1",
    });
    muteSentryAlertMock.mockResolvedValueOnce({
      status: "muted",
      issueId: "123",
      untilIso: "2026-05-13T01:30:00.000Z",
    });
    const app = await makeApp();

    const paused = await request(app)
      .post("/api/internal/openclaw/write/pause-workflow")
      .send({ workflowId: "wf_1", reason: "noisy" });
    expect(paused.status).toBe(200);
    expect(pauseWorkflowMock).toHaveBeenCalledWith({
      workflowId: "wf_1",
      reason: "noisy",
    });

    const muted = await request(app)
      .post("/api/internal/openclaw/write/mute-alert")
      .send({ issueId: "123", untilIso: "2026-05-13T01:30:00.000Z" });
    expect(muted.status).toBe(200);
    expect(muteSentryAlertMock).toHaveBeenCalledWith({
      issueId: "123",
      untilIso: "2026-05-13T01:30:00.000Z",
    });
  });
});
