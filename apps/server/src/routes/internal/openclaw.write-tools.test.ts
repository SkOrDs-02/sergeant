import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  // T2 audit #3 — these tests exercise write tools with `repo: 'owner/repo'`,
  // which is a fixture rather than the real OPENCLAW_GITHUB_REPO. Widen the
  // allowlist so the route-level guard accepts it.
  vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "owner/repo");
});

afterEach(() => {
  vi.unstubAllEnvs();
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
        repo: "owner/repo",
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      error: "allowlist_fail",
      message: "bad path",
    });
  });

  it("rejects strategy-doc writes whose `repo` is outside the allowlist with 400", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write/strategy-doc")
      .send({
        path: "docs/strategy/roadmap.md",
        content: "# Roadmap\n",
        message: "refresh roadmap",
        repo: "evil-org/owned-repo",
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "allowlist_fail",
    });
    // Must reject BEFORE the tool layer is reached — no GitHub token mint.
    expect(commitToStrategyDocMock).not.toHaveBeenCalled();
  });

  it("rejects github-issue writes whose `repo` is outside the allowlist with 400", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write/github-issue")
      .send({
        title: "oops",
        body: "oops",
        repo: "evil-org/owned-repo",
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "allowlist_fail",
    });
    expect(createGithubIssueMock).not.toHaveBeenCalled();
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

  it("mints an approval nonce when the secret is set, and reports not_configured otherwise", async () => {
    const { env } = await import("../../env.js");
    const app = await makeApp();

    // Feature disabled by default → graceful degradation.
    const off = await request(app)
      .post("/api/internal/openclaw/approval-nonce")
      .send({ tool: "pause_workflow", args: { workflowId: "wf_1" } });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ status: "not_configured" });

    // Rejects a non-write tool at the schema boundary.
    const badTool = await request(app)
      .post("/api/internal/openclaw/approval-nonce")
      .send({ tool: "read_github", args: {} });
    expect(badTool.status).toBe(400);

    const prevSecret = env.OPENCLAW_APPROVAL_NONCE_SECRET;
    try {
      env.OPENCLAW_APPROVAL_NONCE_SECRET = "route-test-secret";
      const issued = await request(app)
        .post("/api/internal/openclaw/approval-nonce")
        .send({ tool: "pause_workflow", args: { workflowId: "wf_1" } });
      expect(issued.status).toBe(200);
      expect(issued.body.status).toBe("issued");
      expect(typeof issued.body.nonce).toBe("string");
      expect(issued.body.nonce.startsWith("oc1.")).toBe(true);
      expect(typeof issued.body.expiresAt).toBe("string");
    } finally {
      env.OPENCLAW_APPROVAL_NONCE_SECRET = prevSecret;
    }
  });

  it("rejects a write with no nonce once enforcement is required (401)", async () => {
    const { env } = await import("../../env.js");
    const app = await makeApp();
    const prevSecret = env.OPENCLAW_APPROVAL_NONCE_SECRET;
    const prevRequired = env.OPENCLAW_WRITE_NONCE_REQUIRED;
    try {
      env.OPENCLAW_APPROVAL_NONCE_SECRET = "route-test-secret";
      env.OPENCLAW_WRITE_NONCE_REQUIRED = true;
      const res = await request(app)
        .post("/api/internal/openclaw/write/pause-workflow")
        .send({ workflowId: "wf_1", reason: "noisy" });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        code: "OPENCLAW_APPROVAL_NONCE_INVALID",
        reason: "missing_nonce",
      });
      // Must reject BEFORE the tool layer.
      expect(pauseWorkflowMock).not.toHaveBeenCalled();
    } finally {
      env.OPENCLAW_APPROVAL_NONCE_SECRET = prevSecret;
      env.OPENCLAW_WRITE_NONCE_REQUIRED = prevRequired;
    }
  });

  it("mints then replays a nonce end-to-end via the real HTTP header (required mode)", async () => {
    const { env } = await import("../../env.js");
    const { createOpenClawInternalRouter } = await import("./openclaw.js");
    const { APPROVAL_NONCE_HEADER } =
      await import("../../modules/openclaw/index.js");

    // Stateful in-memory ledger so mint (INSERT) and consume (UPDATE RETURNING)
    // both behave like the real table — required to exercise the success path.
    const ledger = new Map<
      string,
      { tool: string; argsHash: string; consumed: boolean }
    >();
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes("INSERT INTO openclaw_approval_nonce")) {
          ledger.set(params[0] as string, {
            tool: params[1] as string,
            argsHash: params[2] as string,
            consumed: false,
          });
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("UPDATE openclaw_approval_nonce")) {
          const row = ledger.get(params[0] as string);
          if (row && !row.consumed) {
            row.consumed = true;
            return {
              rows: [{ tool: row.tool, args_hash: row.argsHash }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as never;

    const app = express();
    app.use(express.json());
    app.use(createOpenClawInternalRouter({ pool }));

    pauseWorkflowMock.mockResolvedValueOnce({
      status: "paused",
      workflowId: "wf_9",
    });

    const prevSecret = env.OPENCLAW_APPROVAL_NONCE_SECRET;
    const prevRequired = env.OPENCLAW_WRITE_NONCE_REQUIRED;
    try {
      env.OPENCLAW_APPROVAL_NONCE_SECRET = "e2e-secret";
      env.OPENCLAW_WRITE_NONCE_REQUIRED = true;

      const body = { workflowId: "wf_9", reason: "e2e" };
      const minted = await request(app)
        .post("/api/internal/openclaw/approval-nonce")
        .send({ tool: "pause_workflow", args: body });
      expect(minted.status).toBe(200);
      const nonce = minted.body.nonce as string;
      expect(nonce).toBeTruthy();

      // Correct header name + valid nonce → write proceeds (would 401 with
      // `missing_nonce` if the mint/verify header names disagreed).
      const written = await request(app)
        .post("/api/internal/openclaw/write/pause-workflow")
        .set(APPROVAL_NONCE_HEADER, nonce)
        .send(body);
      expect(written.status).toBe(200);
      expect(pauseWorkflowMock).toHaveBeenCalledWith({
        workflowId: "wf_9",
        reason: "e2e",
      });

      // Replay must fail closed — single-use nonce already consumed.
      const replay = await request(app)
        .post("/api/internal/openclaw/write/pause-workflow")
        .set(APPROVAL_NONCE_HEADER, nonce)
        .send(body);
      expect(replay.status).toBe(401);
      expect(replay.body).toMatchObject({ reason: "already_consumed" });
    } finally {
      env.OPENCLAW_APPROVAL_NONCE_SECRET = prevSecret;
      env.OPENCLAW_WRITE_NONCE_REQUIRED = prevRequired;
    }
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
