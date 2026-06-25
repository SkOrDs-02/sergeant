/**
 * Route-level coverage for `/api/internal/openclaw/*` — focused on the
 * Wave-1 §3.3 follow-up: `write-audit/list` now accepts `recordedAfterIso`
 * and forwards it to the store as a `Date`. The rest of the openclaw
 * router is exercised by the registerRoutes snapshot, so we only need
 * to pin down the schema-validation + store-call wiring here.
 *
 * We deliberately mock the store-layer functions (not pool.query) so the
 * test stays fast and doesn't have to mirror raw SQL — the store layer
 * has its own dedicated unit tests in `modules/openclaw/store.test.ts`.
 */
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  recallCofounderMemoryMock,
  forgetByIdMock,
  forgetByTopicMock,
  forgetSinceMock,
  previewForgetMock,
  confirmForgetMock,
  cancelForgetMock,
  readStrategyDocMock,
  readGithubMock,
  readWorkflowLogsMock,
  readTelegramTopicHistoryMock,
  recordDecisionMock,
  listRecentDecisionsMock,
  checkDailyBudgetMock,
  buildAiCostSummaryMock,
  buildPerfSnapshotMock,
  openInvocationMock,
  finalizeInvocationMock,
  getStripeMetricsMock,
  getSentryIssuesMock,
  getServerStatsMock,
  getPostHogStatsMock,
  getGithubReleasesMock,
  assembleMorningBriefingMock,
  assembleWeeklyReviewMock,
  assembleMonthlyOkrReviewMock,
  listRecentWriteAuditsMock,
  recordWriteAuditMock,
  listRecentInvocationsMock,
  listN8nWorkflowsMock,
  describeN8nWorkflowMock,
  triggerN8nWorkflowMock,
  activateN8nWorkflowMock,
  refreshBusinessSnapshotMock,
  classifyMessageMock,
  setFounderMuteMock,
  clearFounderMuteMock,
  getFounderMuteMock,
  isFounderMutedMock,
  lookupWhoisMock,
  githubSearchMock,
  githubTreeMock,
  githubDiffMock,
  githubPrsMock,
  seoGscQueryMock,
  seoPsiAuditMock,
  seoSerpLookupMock,
  setReminderMock,
  listDueRemindersMock,
  markReminderSentMock,
  markReminderFailedMock,
  markReminderCancelledMock,
  listFounderRemindersMock,
} = vi.hoisted(() => ({
  recallCofounderMemoryMock: vi.fn(),
  forgetByIdMock: vi.fn(),
  forgetByTopicMock: vi.fn(),
  forgetSinceMock: vi.fn(),
  previewForgetMock: vi.fn(),
  confirmForgetMock: vi.fn(),
  cancelForgetMock: vi.fn(),
  readStrategyDocMock: vi.fn(),
  readGithubMock: vi.fn(),
  readWorkflowLogsMock: vi.fn(),
  readTelegramTopicHistoryMock: vi.fn(),
  recordDecisionMock: vi.fn(),
  listRecentDecisionsMock: vi.fn(),
  checkDailyBudgetMock: vi.fn(),
  buildAiCostSummaryMock: vi.fn(),
  buildPerfSnapshotMock: vi.fn(),
  openInvocationMock: vi.fn(),
  finalizeInvocationMock: vi.fn(),
  getStripeMetricsMock: vi.fn(),
  getSentryIssuesMock: vi.fn(),
  getServerStatsMock: vi.fn(),
  getPostHogStatsMock: vi.fn(),
  getGithubReleasesMock: vi.fn(),
  assembleMorningBriefingMock: vi.fn(),
  assembleWeeklyReviewMock: vi.fn(),
  assembleMonthlyOkrReviewMock: vi.fn(),
  listRecentWriteAuditsMock: vi.fn(),
  recordWriteAuditMock: vi.fn(),
  listRecentInvocationsMock: vi.fn(),
  listN8nWorkflowsMock: vi.fn(),
  describeN8nWorkflowMock: vi.fn(),
  triggerN8nWorkflowMock: vi.fn(),
  activateN8nWorkflowMock: vi.fn(),
  refreshBusinessSnapshotMock: vi.fn(),
  classifyMessageMock: vi.fn(),
  setFounderMuteMock: vi.fn(),
  clearFounderMuteMock: vi.fn(),
  getFounderMuteMock: vi.fn(),
  isFounderMutedMock: vi.fn(),
  lookupWhoisMock: vi.fn(),
  githubSearchMock: vi.fn(),
  githubTreeMock: vi.fn(),
  githubDiffMock: vi.fn(),
  githubPrsMock: vi.fn(),
  seoGscQueryMock: vi.fn(),
  seoPsiAuditMock: vi.fn(),
  seoSerpLookupMock: vi.fn(),
  setReminderMock: vi.fn(),
  listDueRemindersMock: vi.fn(),
  markReminderSentMock: vi.fn(),
  markReminderFailedMock: vi.fn(),
  markReminderCancelledMock: vi.fn(),
  listFounderRemindersMock: vi.fn(),
}));

vi.mock("../../modules/openclaw/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/openclaw/index.js")>();
  return {
    ...actual,
    recallCofounderMemory: recallCofounderMemoryMock,
    readStrategyDoc: readStrategyDocMock,
    readGithub: readGithubMock,
    readWorkflowLogs: readWorkflowLogsMock,
    readTelegramTopicHistory: readTelegramTopicHistoryMock,
    recordDecision: recordDecisionMock,
    listRecentDecisions: listRecentDecisionsMock,
    checkDailyBudget: checkDailyBudgetMock,
    buildAiCostSummary: buildAiCostSummaryMock,
    buildPerfSnapshot: buildPerfSnapshotMock,
    openInvocation: openInvocationMock,
    finalizeInvocation: finalizeInvocationMock,
    getStripeMetrics: getStripeMetricsMock,
    getSentryIssues: getSentryIssuesMock,
    getServerStats: getServerStatsMock,
    getPostHogStats: getPostHogStatsMock,
    getGithubReleases: getGithubReleasesMock,
    assembleMorningBriefing: assembleMorningBriefingMock,
    assembleWeeklyReview: assembleWeeklyReviewMock,
    assembleMonthlyOkrReview: assembleMonthlyOkrReviewMock,
    listRecentWriteAudits: listRecentWriteAuditsMock,
    recordWriteAudit: recordWriteAuditMock,
    listRecentInvocations: listRecentInvocationsMock,
    listN8nWorkflows: listN8nWorkflowsMock,
    describeN8nWorkflow: describeN8nWorkflowMock,
    triggerN8nWorkflow: triggerN8nWorkflowMock,
    activateN8nWorkflow: activateN8nWorkflowMock,
    refreshBusinessSnapshot: refreshBusinessSnapshotMock,
    classifyMessage: classifyMessageMock,
    setFounderMute: setFounderMuteMock,
    clearFounderMute: clearFounderMuteMock,
    getFounderMute: getFounderMuteMock,
    isFounderMuted: isFounderMutedMock,
    lookupWhois: lookupWhoisMock,
    githubSearch: githubSearchMock,
    githubTree: githubTreeMock,
    githubDiff: githubDiffMock,
    githubPrs: githubPrsMock,
    seoGscQuery: seoGscQueryMock,
    seoPsiAudit: seoPsiAuditMock,
    seoSerpLookup: seoSerpLookupMock,
    setReminder: setReminderMock,
    listDueReminders: listDueRemindersMock,
    markReminderSent: markReminderSentMock,
    markReminderFailed: markReminderFailedMock,
    markReminderCancelled: markReminderCancelledMock,
    listFounderReminders: listFounderRemindersMock,
  };
});

vi.mock("../../modules/ai-memory/forget.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../modules/ai-memory/forget.js")>();
  return {
    ...actual,
    forgetById: forgetByIdMock,
    forgetByTopic: forgetByTopicMock,
    forgetSince: forgetSinceMock,
    previewForget: previewForgetMock,
    confirmForget: confirmForgetMock,
    cancelForget: cancelForgetMock,
  };
});

async function makeApp(
  queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
) {
  const { createOpenClawInternalRouter } = await import("./openclaw.js");
  const app = express();
  app.use(express.json());
  // We mount the openclaw router directly (no bearer-token guard) so
  // these tests stay focused on schema + store wiring; the auth middleware
  // is exercised by `routes/internal.test.ts`.
  app.use(
    createOpenClawInternalRouter({
      // query_app_db now runs inside a READ ONLY transaction via
      // `pool.connect()` → client (708b763), so the mock must expose a
      // client whose `query` is the same spy. BEGIN/SET LOCAL/COMMIT all
      // flow through it; only the SELECT result is read back.
      pool: {
        query: queryMock,
        connect: async () => ({ query: queryMock, release: () => {} }),
      } as never,
    }),
  );
  return app;
}

describe("/api/internal/openclaw core read tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards recall requests to the memory service", async () => {
    recallCofounderMemoryMock.mockResolvedValueOnce({
      memories: [{ id: 1, content: "launch note" }],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/recall")
      .send({ founderUserId: "f_1", query: "launch", topK: 3 });

    expect(res.status).toBe(200);
    expect(res.body.memories).toHaveLength(1);
    expect(recallCofounderMemoryMock).toHaveBeenCalledWith("f_1", {
      query: "launch",
      topK: 3,
    });
  }, 60_000);

  it("dispatches forget modes and confirm/cancel helpers", async () => {
    forgetByIdMock.mockResolvedValueOnce({ deleted: 1 });
    previewForgetMock.mockResolvedValueOnce({ token: "tok", preview: [] });
    confirmForgetMock.mockResolvedValueOnce({ deleted: 2 });
    cancelForgetMock.mockReturnValueOnce(true);
    const app = await makeApp();

    const byId = await request(app).post("/api/internal/openclaw/forget").send({
      mode: "byId",
      founderUserId: "f_1",
      founderTgUserId: 111,
      rawCommand: "/forget 42",
      memoryId: 42,
    });
    expect(byId.status).toBe(200);
    expect(forgetByIdMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
      founderTgUserId: 111,
      rawCommand: "/forget 42",
      memoryId: 42,
    });

    const preview = await request(app)
      .post("/api/internal/openclaw/forget")
      .send({
        mode: "previewQuery",
        founderUserId: "f_1",
        founderTgUserId: 111,
        rawCommand: "/forget about launch",
        query: "launch",
        topK: 5,
      });
    expect(preview.status).toBe(200);
    expect(previewForgetMock).toHaveBeenCalledWith({
      founderUserId: "f_1",
      founderTgUserId: 111,
      rawCommand: "/forget about launch",
      query: "launch",
      topK: 5,
    });

    const token = "11111111-1111-4111-8111-111111111111";
    const confirm = await request(app)
      .post("/api/internal/openclaw/forget/confirm")
      .send({
        founderUserId: "f_1",
        founderTgUserId: 111,
        rawCommand: "/forget confirm",
        token,
      });
    expect(confirm.status).toBe(200);
    expect(confirmForgetMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
      founderTgUserId: 111,
      rawCommand: "/forget confirm",
      token,
    });

    const cancel = await request(app)
      .post("/api/internal/openclaw/forget/cancel")
      .send({ founderUserId: "f_1", token });
    expect(cancel.body).toEqual({ cancelled: true });
  });

  it("routes strategy/github/workflow/telegram/decision read tools", async () => {
    readStrategyDocMock.mockResolvedValueOnce({
      path: "docs/x.md",
      text: "ok",
    });
    readGithubMock.mockResolvedValueOnce({ mode: "file", content: "file" });
    readWorkflowLogsMock.mockResolvedValueOnce({ logs: ["green"] });
    readTelegramTopicHistoryMock.mockResolvedValueOnce({ messages: ["hi"] });
    recordDecisionMock.mockResolvedValueOnce({ id: 9 });
    listRecentDecisionsMock.mockResolvedValueOnce([{ id: 9 }]);
    const app = await makeApp();

    expect(
      (
        await request(app)
          .post("/api/internal/openclaw/strategy")
          .send({ path: "docs/strategy.md" })
      ).status,
    ).toBe(200);
    expect(readStrategyDocMock).toHaveBeenCalledWith({
      path: "docs/strategy.md",
    });

    await request(app).post("/api/internal/openclaw/github").send({
      mode: "file",
      repo: "owner/repo",
      filePath: "README.md",
      ref: "main",
    });
    expect(readGithubMock).toHaveBeenCalledWith({
      mode: "file",
      repo: "owner/repo",
      filePath: "README.md",
      ref: "main",
      number: undefined,
    });

    await request(app)
      .post("/api/internal/openclaw/workflow")
      .send({ workflowId: "ci.yml", since: "2026-06-01", limit: 10 });
    expect(readWorkflowLogsMock).toHaveBeenCalledWith({
      workflowId: "ci.yml",
      since: "2026-06-01",
      limit: 10,
    });

    await request(app)
      .post("/api/internal/openclaw/telegram")
      .send({ topic: "ops", limit: 5 });
    expect(readTelegramTopicHistoryMock).toHaveBeenCalledWith(
      expect.anything(),
      { topic: "ops", limit: 5 },
    );

    await request(app).post("/api/internal/openclaw/decision").send({
      founderUserId: "f_1",
      topic: "launch",
      context: "ctx",
      decision: "ship",
      rationale: "ready",
    });
    expect(recordDecisionMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
      topic: "launch",
      context: "ctx",
      decision: "ship",
      rationale: "ready",
    });

    const list = await request(app)
      .post("/api/internal/openclaw/decisions/list")
      .send({ founderUserId: "f_1", limit: 7 });
    expect(list.body.decisions).toEqual([{ id: 9 }]);
    expect(listRecentDecisionsMock).toHaveBeenCalledWith(
      expect.anything(),
      "f_1",
      7,
    );
  });

  it("maps github and workflow service errors to 400 payloads", async () => {
    readGithubMock.mockRejectedValueOnce(new Error("bad ref"));
    readWorkflowLogsMock.mockRejectedValueOnce(new Error("workflow missing"));
    const app = await makeApp();

    const github = await request(app)
      .post("/api/internal/openclaw/github")
      .send({ mode: "pr", number: 1 });
    expect(github.status).toBe(400);
    expect(github.body).toEqual({
      error: "github_error",
      message: "bad ref",
    });

    const workflow = await request(app)
      .post("/api/internal/openclaw/workflow")
      .send({ workflowId: "missing.yml" });
    expect(workflow.status).toBe(400);
    expect(workflow.body).toEqual({
      error: "workflow_error",
      message: "workflow missing",
    });
  });
});

describe("/api/internal/openclaw operational read tools", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("routes budget, cost, perf, and invocation lifecycle endpoints", async () => {
    checkDailyBudgetMock.mockResolvedValueOnce({ allowed: true });
    buildAiCostSummaryMock.mockResolvedValueOnce({ today: { totalUsd: 1.25 } });
    buildPerfSnapshotMock.mockResolvedValueOnce({ uptimeSec: 12 });
    openInvocationMock.mockResolvedValueOnce(44);
    finalizeInvocationMock.mockResolvedValueOnce(undefined);
    const app = await makeApp();

    const budget = await request(app)
      .post("/api/internal/openclaw/budget")
      .send({ founderUserId: "f_1", tzName: "Europe/Kyiv" });
    expect(budget.body).toEqual({ allowed: true });
    expect(checkDailyBudgetMock).toHaveBeenCalledWith(
      expect.anything(),
      "f_1",
      "Europe/Kyiv",
    );

    await request(app)
      .post("/api/internal/openclaw/ai-cost-summary")
      .send({ trendDays: 7 });
    expect(buildAiCostSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: expect.anything(),
        trendDays: 7,
      }),
    );

    await request(app).post("/api/internal/openclaw/perf-snapshot").send({});
    expect(buildPerfSnapshotMock).toHaveBeenCalledTimes(1);

    const opened = await request(app)
      .post("/api/internal/openclaw/invocations/open")
      .send({
        founderUserId: "f_1",
        founderTgUserId: 111,
        trigger: "dm",
        userMessage: "status",
        metadata: { source: "test" },
      });
    expect(opened.body).toEqual({ invocationId: 44 });
    expect(openInvocationMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
      founderTgUserId: 111,
      trigger: "dm",
      userMessage: "status",
      metadata: { source: "test" },
    });

    const finalized = await request(app)
      .post("/api/internal/openclaw/invocations/finalize")
      .send({
        invocationId: 44,
        status: "success",
        assistantResponse: "done",
        toolCalls: [
          {
            tool: "recall_memory",
            input: {},
            output_chars: 2,
            output_preview: "ok",
            status: "ok",
            duration_ms: 3,
          },
        ],
        costUsd: 0.01,
        durationMs: 120,
        iterations: 1,
        toneMode: "direct",
      });
    expect(finalized.body).toEqual({ ok: true });
    expect(finalizeInvocationMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invocationId: 44,
        status: "success",
        assistantResponse: "done",
        toneMode: "direct",
      }),
    );
  });

  it("routes metrics and briefing ritual aggregators", async () => {
    getStripeMetricsMock.mockResolvedValueOnce({ revenueUsd: 10 });
    getSentryIssuesMock.mockResolvedValueOnce({ issues: [] });
    getServerStatsMock.mockResolvedValueOnce({ health: "ok" });
    getPostHogStatsMock.mockResolvedValueOnce({ activeUsers: 3 });
    getGithubReleasesMock.mockResolvedValueOnce({ releases: [] });
    assembleMorningBriefingMock.mockResolvedValueOnce({ markdown: "morning" });
    isFounderMutedMock.mockResolvedValueOnce({ muted: false });
    assembleWeeklyReviewMock.mockResolvedValueOnce({ markdown: "weekly" });
    assembleMonthlyOkrReviewMock.mockResolvedValueOnce({ markdown: "monthly" });
    const app = await makeApp();

    await request(app)
      .post("/api/internal/openclaw/metrics/stripe")
      .send({ days: 14 });
    expect(getStripeMetricsMock).toHaveBeenCalledWith({ days: 14 });

    await request(app)
      .post("/api/internal/openclaw/metrics/sentry")
      .send({ level: "error", limit: 5 });
    expect(getSentryIssuesMock).toHaveBeenCalledWith({
      level: "error",
      limit: 5,
    });

    await request(app).post("/api/internal/openclaw/metrics/server").send({});
    expect(getServerStatsMock).toHaveBeenCalledTimes(1);

    await request(app)
      .post("/api/internal/openclaw/metrics/posthog")
      .send({ days: 30 });
    expect(getPostHogStatsMock).toHaveBeenCalledWith({ days: 30 });

    await request(app)
      .post("/api/internal/openclaw/github/releases")
      .send({ repo: "owner/repo", limit: 3 });
    expect(getGithubReleasesMock).toHaveBeenCalledWith({
      repo: "owner/repo",
      limit: 3,
    });

    const morning = await request(app)
      .post("/api/internal/openclaw/briefing/morning")
      .send({
        windowDays: 3,
        githubRepo: "owner/repo",
        sentryLimit: 4,
        prLimit: 8,
        includeProposals: false,
        founderUserId: "f_1",
      });
    expect(morning.body).toEqual({
      markdown: "morning",
      mute: { muted: false },
    });
    expect(assembleMorningBriefingMock).toHaveBeenCalledWith({
      windowDays: 3,
      githubRepo: "owner/repo",
      sentryLimit: 4,
      prLimit: 8,
      includeProposals: false,
    });
    expect(isFounderMutedMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
    });

    await request(app).post("/api/internal/openclaw/ritual/weekly").send({
      windowDays: 7,
      staleDays: 10,
      githubRepo: "owner/repo",
      sentryLimit: 2,
      prLimit: 5,
    });
    expect(assembleWeeklyReviewMock).toHaveBeenCalledWith({
      windowDays: 7,
      staleDays: 10,
      githubRepo: "owner/repo",
      sentryLimit: 2,
      prLimit: 5,
    });

    await request(app).post("/api/internal/openclaw/ritual/monthly").send({
      githubRepo: "owner/repo",
      prLimit: 4,
      staleDays: 45,
      sentryLevel: "warning",
    });
    expect(assembleMonthlyOkrReviewMock).toHaveBeenCalledWith({
      githubRepo: "owner/repo",
      prLimit: 4,
      staleDays: 45,
      sentryLevel: "warning",
    });
  });

  it("routes github code tools and SEO tools", async () => {
    githubSearchMock.mockResolvedValueOnce({ items: [] });
    githubTreeMock.mockResolvedValueOnce({ tree: [] });
    githubDiffMock.mockResolvedValueOnce({ files: [] });
    githubPrsMock.mockResolvedValueOnce({ items: [] });
    seoGscQueryMock.mockResolvedValueOnce({ rows: [] });
    seoPsiAuditMock.mockResolvedValueOnce({ score: 0.9 });
    seoSerpLookupMock.mockResolvedValueOnce({ results: [] });
    const app = await makeApp();

    await request(app)
      .post("/api/internal/openclaw/github/search")
      .send({ scope: "code", query: "OpenClaw", repo: "owner/repo" });
    expect(githubSearchMock).toHaveBeenCalledWith({
      scope: "code",
      query: "OpenClaw",
      repo: "owner/repo",
    });

    await request(app)
      .post("/api/internal/openclaw/github/tree")
      .send({ ref: "main", repo: "owner/repo", recursive: true });
    expect(githubTreeMock).toHaveBeenCalledWith({
      ref: "main",
      repo: "owner/repo",
      recursive: true,
    });

    await request(app)
      .post("/api/internal/openclaw/github/diff")
      .send({ base: "main", head: "feature", repo: "owner/repo" });
    expect(githubDiffMock).toHaveBeenCalledWith({
      base: "main",
      head: "feature",
      repo: "owner/repo",
    });

    await request(app)
      .post("/api/internal/openclaw/github/prs")
      .send({ state: "open", sort: "updated", perPage: 10 });
    expect(githubPrsMock).toHaveBeenCalledWith({
      state: "open",
      sort: "updated",
      perPage: 10,
    });

    await request(app)
      .post("/api/internal/openclaw/seo/gsc")
      .send({ days: 28, dimension: "page", rowLimit: 20 });
    expect(seoGscQueryMock).toHaveBeenCalledWith({
      days: 28,
      dimension: "page",
      rowLimit: 20,
    });

    await request(app)
      .post("/api/internal/openclaw/seo/lighthouse")
      .send({ url: "https://example.com", strategy: "mobile" });
    expect(seoPsiAuditMock).toHaveBeenCalledWith({
      url: "https://example.com",
      strategy: "mobile",
    });

    await request(app)
      .post("/api/internal/openclaw/seo/serp")
      .send({ query: "sergeant app", hl: "uk", gl: "ua", num: 5 });
    expect(seoSerpLookupMock).toHaveBeenCalledWith({
      query: "sergeant app",
      hl: "uk",
      gl: "ua",
      num: 5,
    });
  });

  it("routes reminder CRUD and delivery state endpoints", async () => {
    const reminder = { id: 1, founder_user_id: "f_1", status: "pending" };
    setReminderMock.mockResolvedValueOnce(reminder);
    listDueRemindersMock.mockResolvedValueOnce([reminder]);
    markReminderSentMock.mockResolvedValueOnce({ ...reminder, status: "sent" });
    markReminderFailedMock.mockResolvedValueOnce({
      ...reminder,
      status: "failed",
    });
    markReminderCancelledMock.mockResolvedValueOnce({
      ...reminder,
      status: "cancelled",
    });
    listFounderRemindersMock.mockResolvedValueOnce([reminder]);
    const app = await makeApp();

    await request(app)
      .post("/api/internal/openclaw/reminders/set")
      .send({
        founderUserId: "f_1",
        reminderText: "ship report",
        dueAtIso: "2026-06-25T09:00:00+03:00",
        persona: "ops",
        topic: "daily",
        channel: "telegram",
        sourceInvocationId: 44,
        metadata: { source: "test" },
      });
    expect(setReminderMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
      reminderText: "ship report",
      dueAtIso: "2026-06-25T09:00:00+03:00",
      persona: "ops",
      topic: "daily",
      channel: "telegram",
      sourceInvocationId: 44,
      metadata: { source: "test" },
    });

    await request(app)
      .post("/api/internal/openclaw/reminders/list-due")
      .send({ limit: 5, nowIso: "2026-06-25T09:00:00+03:00" });
    expect(listDueRemindersMock).toHaveBeenCalledWith(expect.anything(), {
      limit: 5,
      nowIso: "2026-06-25T09:00:00+03:00",
    });

    await request(app)
      .post("/api/internal/openclaw/reminders/mark-sent")
      .send({ reminderId: 1 });
    expect(markReminderSentMock).toHaveBeenCalledWith(expect.anything(), 1);

    await request(app)
      .post("/api/internal/openclaw/reminders/mark-failed")
      .send({ reminderId: 1, reason: "telegram down" });
    expect(markReminderFailedMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "telegram down",
    );

    await request(app)
      .post("/api/internal/openclaw/reminders/cancel")
      .send({ reminderId: 1, founderUserId: "f_1" });
    expect(markReminderCancelledMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "f_1",
    );

    await request(app)
      .post("/api/internal/openclaw/reminders/list")
      .send({
        founderUserId: "f_1",
        statuses: ["pending", "sent"],
        limit: 20,
      });
    expect(listFounderRemindersMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "f_1",
      statuses: ["pending", "sent"],
      limit: 20,
    });
  });
});

describe("/api/internal/openclaw/query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rows for a valid allowlisted SELECT", async () => {
    const queryMock = vi.fn().mockResolvedValue({
      rows: [{ id: "u_1" }],
      rowCount: 1,
    });
    const app = await makeApp(queryMock);
    const res = await request(app)
      .post("/api/internal/openclaw/query")
      .send({ sql: "SELECT id FROM users", limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rowCount: 1,
      rows: [{ id: "u_1" }],
      tablesUsed: ["users"],
    });
  });

  it("keeps allowlist failures as 400 allowlist_fail", async () => {
    const queryMock = vi.fn();
    const app = await makeApp(queryMock);
    const res = await request(app)
      .post("/api/internal/openclaw/query")
      .send({ sql: "SELECT * FROM auth_secret" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("allowlist_fail");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("maps Postgres schema errors to 400 schema_error", async () => {
    const queryMock = vi.fn().mockRejectedValue(
      Object.assign(new Error('column "created_at" does not exist'), {
        code: "42703",
      }),
    );
    const app = await makeApp(queryMock);
    const res = await request(app).post("/api/internal/openclaw/query").send({
      sql: "SELECT * FROM openclaw_invocations ORDER BY created_at DESC",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "schema_error",
      message: expect.stringContaining('column "created_at" does not exist'),
    });
  });
});

describe("/api/internal/openclaw/write-audit/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listRecentWriteAuditsMock.mockResolvedValue([]);
    recordWriteAuditMock.mockResolvedValue(1);
    listRecentInvocationsMock.mockResolvedValue([]);
  });

  it("forwards filters to the store without a recordedAfter when omitted", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1", limit: 20, tool: "pause_workflow" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audits: [] });
    expect(listRecentWriteAuditsMock).toHaveBeenCalledTimes(1);
    const arg = listRecentWriteAuditsMock.mock.calls[0]?.[1];
    expect(arg).toEqual({
      founderUserId: "f_1",
      limit: 20,
      tool: "pause_workflow",
      action: undefined,
      persona: undefined,
      recordedAfter: undefined,
    });
  });

  it("parses recordedAfterIso into a Date before forwarding to the store", async () => {
    const app = await makeApp();
    const iso = "2026-04-26T12:00:00.000Z";
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1", limit: 100, recordedAfterIso: iso });

    expect(res.status).toBe(200);
    const arg = listRecentWriteAuditsMock.mock.calls[0]?.[1];
    expect(arg?.recordedAfter).toBeInstanceOf(Date);
    expect((arg?.recordedAfter as Date).toISOString()).toBe(iso);
  });

  it("rejects malformed recordedAfterIso with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1", recordedAfterIso: "yesterday" });

    expect(res.status).toBe(400);
    expect(listRecentWriteAuditsMock).not.toHaveBeenCalled();
  });

  it("returns audits payload from the store", async () => {
    listRecentWriteAuditsMock.mockResolvedValueOnce([
      {
        id: 7,
        recorded_at: "2026-04-30T10:00:00.000Z",
        approval_id: "ap_42",
        tool: "pause_workflow",
        founder_user_id: "f_1",
        founder_tg_user_id: 999,
        invocation_id: null,
        action: "executed",
        input: {},
        http_status: 200,
        ok: true,
        response_excerpt: null,
        persona: "ops",
        metadata: {},
      },
    ]);
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/write-audit/list")
      .send({ founderUserId: "f_1" });

    expect(res.status).toBe(200);
    expect(res.body.audits).toHaveLength(1);
    expect(res.body.audits[0].approval_id).toBe("ap_42");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PR-C1c — n8n delegation surface + snapshot/refresh meta-tool
// ─────────────────────────────────────────────────────────────────────────

describe("/api/internal/openclaw/n8n/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("/list forwards tiers + limit to listN8nWorkflows", async () => {
    listN8nWorkflowsMock.mockResolvedValueOnce({
      workflows: [
        {
          id: "WF_A1",
          name: "63 — Growth Acquisition Snapshot",
          active: true,
          tier: "A",
          category: "growth",
          updatedAt: null,
        },
      ],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/list")
      .send({ tiers: ["A", "C"], limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.workflows).toHaveLength(1);
    expect(listN8nWorkflowsMock).toHaveBeenCalledWith({
      tiers: ["A", "C"],
      limit: 50,
    });
  });

  it("/list rejects unknown tier values with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/list")
      .send({ tiers: ["Z"] });

    expect(res.status).toBe(400);
    expect(listN8nWorkflowsMock).not.toHaveBeenCalled();
  });

  it("/describe forwards workflowId and returns body", async () => {
    describeN8nWorkflowMock.mockResolvedValueOnce({
      workflowId: "WF_A1",
      name: "Growth Acq",
      active: true,
      tier: "A",
      category: "growth",
      approvalRequired: false,
      nodes: [],
      triggers: ["n8n-nodes-base.cronTrigger"],
      updatedAt: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/describe")
      .send({ workflowId: "WF_A1" });

    expect(res.status).toBe(200);
    expect(res.body.tier).toBe("A");
    expect(describeN8nWorkflowMock).toHaveBeenCalledWith({
      workflowId: "WF_A1",
    });
  });

  it("/trigger returns the trigger payload for an allowlisted workflow", async () => {
    triggerN8nWorkflowMock.mockResolvedValueOnce({
      status: "triggered",
      workflowId: "WF_A1",
      tier: "A",
      approvalRequired: false,
      executionId: "42",
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/trigger")
      .send({ workflowId: "WF_A1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "triggered",
      workflowId: "WF_A1",
      tier: "A",
      approvalRequired: false,
      executionId: "42",
    });
  });

  it("/trigger maps N8nAllowlistError to 400 allowlist_fail", async () => {
    const { N8nAllowlistError } = await import("../../modules/openclaw/n8n.js");
    triggerN8nWorkflowMock.mockRejectedValueOnce(
      new N8nAllowlistError({
        workflowId: "WF_B1",
        tier: "B",
        op: "trigger",
        message: "Tier B not triggerable",
      }),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/trigger")
      .send({ workflowId: "WF_B1" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "allowlist_fail",
      op: "trigger",
      workflowId: "WF_B1",
      tier: "B",
      message: "Tier B not triggerable",
    });
  });

  it("/activate forwards active flag and returns payload", async () => {
    activateN8nWorkflowMock.mockResolvedValueOnce({
      status: "deactivated",
      workflowId: "WF_C1",
      tier: "C",
      approvalRequired: true,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/activate")
      .send({ workflowId: "WF_C1", active: false });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("deactivated");
    expect(activateN8nWorkflowMock).toHaveBeenCalledWith({
      workflowId: "WF_C1",
      active: false,
    });
  });

  it("/activate maps N8nAllowlistError to 400 allowlist_fail", async () => {
    const { N8nAllowlistError } = await import("../../modules/openclaw/n8n.js");
    activateN8nWorkflowMock.mockRejectedValueOnce(
      new N8nAllowlistError({
        workflowId: "WF_D1",
        tier: "D",
        op: "activate",
        message: "Tier D not eligible",
      }),
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/activate")
      .send({ workflowId: "WF_D1", active: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("allowlist_fail");
    expect(res.body.op).toBe("activate");
  });

  it("/activate rejects missing `active` flag with 400 (Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/n8n/activate")
      .send({ workflowId: "WF_C1" });

    expect(res.status).toBe(400);
    expect(activateN8nWorkflowMock).not.toHaveBeenCalled();
  });
});

describe("/api/internal/openclaw/snapshot/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires every Tier A workflow when body is empty", async () => {
    refreshBusinessSnapshotMock.mockResolvedValueOnce({
      triggered: 2,
      failed: 0,
      notConfigured: false,
      durationMs: 12,
      results: [
        { workflowId: "WF_A1", name: "Growth Acq", status: "triggered" },
        { workflowId: "WF_A2", name: "Heartbeat", status: "triggered" },
      ],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/snapshot/refresh")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.triggered).toBe(2);
    expect(refreshBusinessSnapshotMock).toHaveBeenCalledWith({
      workflowIds: undefined,
    });
  });

  it("forwards an explicit workflowIds subset", async () => {
    refreshBusinessSnapshotMock.mockResolvedValueOnce({
      triggered: 1,
      failed: 0,
      notConfigured: false,
      durationMs: 4,
      results: [
        { workflowId: "WF_A1", name: "Growth Acq", status: "triggered" },
      ],
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/snapshot/refresh")
      .send({ workflowIds: ["WF_A1"] });

    expect(res.status).toBe(200);
    expect(refreshBusinessSnapshotMock).toHaveBeenCalledWith({
      workflowIds: ["WF_A1"],
    });
  });

  it("rejects unknown fields with 400 (.strict() Zod schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/snapshot/refresh")
      .send({ tier: "A" });

    expect(res.status).toBe(400);
    expect(refreshBusinessSnapshotMock).not.toHaveBeenCalled();
  });
});

// PR-Stage4c: Layer 1 cheap-router classify endpoint. Route отримує
// `{ userMessage, systemPrompt? }`, кличе `classifyMessage()` (mocked тут),
// повертає classification JSON. 503 коли ANTHROPIC_API_KEY відсутній;
// 502 коли Haiku фейлить — щоб plugin escalates до Layer 2 fail-closed.
describe("/api/internal/openclaw/classify", () => {
  // T2 audit follow-up — these tests previously mutated
  // `process.env.ANTHROPIC_API_KEY` directly, but the route reads the
  // parsed `env.ANTHROPIC_API_KEY` (captured at first env-module load),
  // so the assignment never reached the handler in vitest workers
  // where env.js had already been cached by an earlier suite. Switch
  // to `vi.stubEnv` + `vi.resetModules()` so each test gets a fresh
  // env snapshot before `makeApp()` dynamic-imports the router.
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns classification JSON for a routine_metrics question", async () => {
    classifyMessageMock.mockResolvedValueOnce({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "Як у нас з MRR?" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      class: "routine_metrics",
      shortcut: "metrics",
      persona: null,
      params: null,
      chat_response: null,
    });
    expect(classifyMessageMock).toHaveBeenCalledWith(
      { userMessage: "Як у нас з MRR?" },
      "test-key",
    );
  });

  it("forwards systemPrompt override when provided by the plugin", async () => {
    classifyMessageMock.mockResolvedValueOnce({ class: "thinking" });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({
        userMessage: "Як спланувати релізи на квартал?",
        systemPrompt: "TEST PROMPT",
      });

    expect(res.status).toBe(200);
    expect(classifyMessageMock).toHaveBeenCalledWith(
      {
        userMessage: "Як спланувати релізи на квартал?",
        systemPrompt: "TEST PROMPT",
      },
      "test-key",
    );
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "Привіт" });

    expect(res.status).toBe(503);
    expect(classifyMessageMock).not.toHaveBeenCalled();
  });

  it("returns 502 when the classifier throws (Haiku upstream error)", async () => {
    classifyMessageMock.mockRejectedValueOnce(new Error("upstream 503"));
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "тест" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "classify_upstream_error" });
  });

  it("rejects empty userMessage with 400 (Zod min(1))", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "" });

    expect(res.status).toBe(400);
    expect(classifyMessageMock).not.toHaveBeenCalled();
  });

  it("rejects unknown fields with 400 (.strict() schema)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/classify")
      .send({ userMessage: "hi", maxTokens: 200 });

    expect(res.status).toBe(400);
    expect(classifyMessageMock).not.toHaveBeenCalled();
  });
});

// ───── PR /mute (Phase 5b): mute-state endpoints ──────────────────────

describe("/api/internal/openclaw/mute/*", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("/mute/set forwards parsed ISO and reason to setFounderMute", async () => {
    setFounderMuteMock.mockResolvedValueOnce({
      founderUserId: "user-1",
      mutedUntilIso: "2026-05-13T22:00:00.000Z",
      setAtIso: "2026-05-13T18:00:00.000Z",
      reason: "sleep",
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/set")
      .send({
        founderUserId: "user-1",
        mutedUntilIso: "2026-05-13T22:00:00.000Z",
        reason: "sleep",
      });
    expect(res.status).toBe(200);
    expect(res.body.mutedUntilIso).toBe("2026-05-13T22:00:00.000Z");
    expect(setFounderMuteMock).toHaveBeenCalledTimes(1);
    const call = setFounderMuteMock.mock.calls[0]!;
    const arg = call[1] as Record<string, unknown>;
    expect(arg["founderUserId"]).toBe("user-1");
    expect(arg["mutedUntil"]).toBeInstanceOf(Date);
    expect((arg["mutedUntil"] as Date).toISOString()).toBe(
      "2026-05-13T22:00:00.000Z",
    );
    expect(arg["reason"]).toBe("sleep");
  });

  it("/mute/set accepts null mutedUntilIso (parses to null)", async () => {
    setFounderMuteMock.mockResolvedValueOnce({
      founderUserId: "user-1",
      mutedUntilIso: null,
      setAtIso: "2026-05-13T18:00:00.000Z",
      reason: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/set")
      .send({
        founderUserId: "user-1",
        mutedUntilIso: null,
      });
    expect(res.status).toBe(200);
    const call = setFounderMuteMock.mock.calls[0]!;
    const arg = call[1] as Record<string, unknown>;
    expect(arg["mutedUntil"]).toBeNull();
    expect(arg["reason"]).toBeNull();
  });

  it("/mute/set rejects malformed ISO timestamp (400)", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/set")
      .send({
        founderUserId: "user-1",
        mutedUntilIso: "not-an-iso",
      });
    expect(res.status).toBe(400);
    expect(setFounderMuteMock).not.toHaveBeenCalled();
  });

  it("/mute/clear forwards founderUserId to clearFounderMute", async () => {
    clearFounderMuteMock.mockResolvedValueOnce({
      founderUserId: "user-1",
      mutedUntilIso: null,
      setAtIso: "2026-05-13T18:00:00.000Z",
      reason: null,
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/clear")
      .send({ founderUserId: "user-1" });
    expect(res.status).toBe(200);
    expect(res.body.mutedUntilIso).toBeNull();
    expect(clearFounderMuteMock).toHaveBeenCalledWith(expect.anything(), {
      founderUserId: "user-1",
    });
  });

  it("/mute/status returns null state when no row exists", async () => {
    getFounderMuteMock.mockResolvedValueOnce(null);
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/status")
      .send({ founderUserId: "user-1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: null });
  });

  it("/mute/status returns hydrated state when row exists", async () => {
    getFounderMuteMock.mockResolvedValueOnce({
      founderUserId: "user-1",
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      setAtIso: "2026-05-13T22:00:00.000Z",
      reason: "deep-work",
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/status")
      .send({ founderUserId: "user-1" });
    expect(res.status).toBe(200);
    expect(res.body.state).toEqual({
      founderUserId: "user-1",
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      setAtIso: "2026-05-13T22:00:00.000Z",
      reason: "deep-work",
    });
  });

  it("/mute/check returns runtime guard result", async () => {
    isFounderMutedMock.mockResolvedValueOnce({
      muted: true,
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      reason: "sleep",
    });
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/check")
      .send({ founderUserId: "user-1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      muted: true,
      mutedUntilIso: "2026-05-14T06:00:00.000Z",
      reason: "sleep",
    });
  });

  it("/mute/check rejects missing founderUserId with 400", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/internal/openclaw/mute/check")
      .send({});
    expect(res.status).toBe(400);
    expect(isFounderMutedMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/internal/openclaw/whois", () => {
  beforeEach(() => {
    lookupWhoisMock.mockReset();
  });

  it("forwards numeric tgUserId + founder ids to lookupWhois", async () => {
    lookupWhoisMock.mockResolvedValueOnce({
      tgUserId: 123,
      resolvedFrom: "numeric",
      username: null,
      firstName: null,
      lastName: null,
      inAllowlist: false,
      isFounder: false,
      invocations7d: 0,
      lastSeenIso: null,
      topTools: [],
      muteState: null,
      telegramError: null,
    });
    const app = await makeApp();
    const res = await request(app).post("/api/internal/openclaw/whois").send({
      founderUserId: "user-1",
      founderTgUserId: 999,
      tgUserId: 123,
    });
    expect(res.status).toBe(200);
    expect(lookupWhoisMock).toHaveBeenCalledTimes(1);
    const arg = lookupWhoisMock.mock.calls[0]![1];
    expect(arg.founderUserId).toBe("user-1");
    expect(arg.founderTgUserId).toBe(999);
    expect(arg.tgUserId).toBe(123);
    expect(arg.username).toBeUndefined();
  });

  it("forwards @username (drops @ at boundary)", async () => {
    lookupWhoisMock.mockResolvedValueOnce({
      tgUserId: 42,
      resolvedFrom: "username",
      username: "foo",
      firstName: "Foo",
      lastName: null,
      inAllowlist: false,
      isFounder: false,
      invocations7d: 0,
      lastSeenIso: null,
      topTools: [],
      muteState: null,
      telegramError: null,
    });
    const app = await makeApp();
    const res = await request(app).post("/api/internal/openclaw/whois").send({
      founderUserId: "user-1",
      founderTgUserId: 999,
      username: "@foo",
    });
    expect(res.status).toBe(200);
    const arg = lookupWhoisMock.mock.calls[0]![1];
    expect(arg.username).toBe("@foo");
  });

  it("rejects when neither tgUserId nor username present with 400", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/internal/openclaw/whois").send({
      founderUserId: "user-1",
      founderTgUserId: 999,
    });
    expect(res.status).toBe(400);
    expect(lookupWhoisMock).not.toHaveBeenCalled();
  });

  it("rejects malformed username with 400", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/internal/openclaw/whois").send({
      founderUserId: "user-1",
      founderTgUserId: 999,
      username: "ab",
    });
    expect(res.status).toBe(400);
    expect(lookupWhoisMock).not.toHaveBeenCalled();
  });

  it("returns hydrated aggregator output", async () => {
    lookupWhoisMock.mockResolvedValueOnce({
      tgUserId: 999,
      resolvedFrom: "numeric",
      username: "founder",
      firstName: "Founder",
      lastName: null,
      inAllowlist: true,
      isFounder: true,
      invocations7d: 17,
      lastSeenIso: "2026-05-13T19:00:00.000Z",
      topTools: [{ tool: "recall_memory", count: 6 }],
      muteState: null,
      telegramError: null,
    });
    const app = await makeApp();
    const res = await request(app).post("/api/internal/openclaw/whois").send({
      founderUserId: "user-1",
      founderTgUserId: 999,
      tgUserId: 999,
    });
    expect(res.status).toBe(200);
    expect(res.body.isFounder).toBe(true);
    expect(res.body.invocations7d).toBe(17);
    expect(res.body.topTools).toEqual([{ tool: "recall_memory", count: 6 }]);
  });
});
