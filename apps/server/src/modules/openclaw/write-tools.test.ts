import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { env } from "../../env.js";
import {
  _clearOpenclawGithubAuthCacheForTests,
  getOpenclawGithubAuth,
} from "./github-auth.js";
import {
  assertStrategyDocPath,
  commitToStrategyDoc,
  createGithubIssue,
  muteSentryAlert,
  OpenClawWriteAllowlistError,
  OPENCLAW_WRITE_TOOL_NAMES,
  pauseWorkflow,
  postToTopic,
  POST_TO_TOPIC_ALLOWLIST,
} from "./write-tools.js";

const originalEnv = {
  OPENCLAW_USE_GITHUB_APP: env.OPENCLAW_USE_GITHUB_APP,
  OPENCLAW_GITHUB_APP_ID: env.OPENCLAW_GITHUB_APP_ID,
  OPENCLAW_GITHUB_APP_PRIVATE_KEY: env.OPENCLAW_GITHUB_APP_PRIVATE_KEY,
  OPENCLAW_GITHUB_APP_INSTALLATION_ID: env.OPENCLAW_GITHUB_APP_INSTALLATION_ID,
  OPENCLAW_GITHUB_REPO: env.OPENCLAW_GITHUB_REPO,
  OPENCLAW_GITHUB_BASE_BRANCH: env.OPENCLAW_GITHUB_BASE_BRANCH,
};

const ORIGINAL_PROCESS_ENV = { ...process.env };

function patchEnv(overrides: Partial<typeof originalEnv>): void {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(env, key, {
      value,
      writable: false,
      configurable: true,
      enumerable: true,
    });
  }
}

function restoreEnv(): void {
  patchEnv(originalEnv);
  process.env = { ...ORIGINAL_PROCESS_ENV };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchSpy(): MockInstance<typeof fetch> {
  return vi.spyOn(globalThis, "fetch") as unknown as MockInstance<typeof fetch>;
}

beforeEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
  _clearOpenclawGithubAuthCacheForTests();
  // T2 audit #3 — the existing fixtures target `owner/repo` (and one
  // falls through to the schema-default `Skords-01/Sergeant`). Widen
  // the allowlist so the tool-layer assert (`assertOpenClawRepoAllowed`)
  // accepts both.
  vi.stubEnv("OPENCLAW_GITHUB_REPO_ALLOWLIST", "owner/repo,Skords-01/Sergeant");
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
  _clearOpenclawGithubAuthCacheForTests();
  vi.unstubAllEnvs();
});

describe("assertStrategyDocPath", () => {
  it("normalizes valid strategy doc paths", () => {
    expect(assertStrategyDocPath("/docs/strategy/roadmap.md")).toBe(
      "docs/strategy/roadmap.md",
    );
  });

  it("rejects files outside docs/strategy", () => {
    expect(() => assertStrategyDocPath("docs/decisions/roadmap.md")).toThrow(
      OpenClawWriteAllowlistError,
    );
  });

  it("rejects path traversal and non-markdown targets", () => {
    expect(() => assertStrategyDocPath("docs/strategy/../secrets.md")).toThrow(
      /not under/,
    );
    expect(() => assertStrategyDocPath("docs/strategy/roadmap.txt")).toThrow(
      /must end with .md/,
    );
  });
});

describe("OpenClaw write-tool registry", () => {
  it("keeps write-tool names stable for console dispatch", () => {
    expect(OPENCLAW_WRITE_TOOL_NAMES).toEqual([
      "commit_to_strategy_doc",
      "create_github_issue",
      "post_to_topic",
      "pause_workflow",
      "mute_alert",
    ]);
  });
});

describe("commitToStrategyDoc", () => {
  it("returns not_configured without GitHub App auth", async () => {
    patchEnv({ OPENCLAW_USE_GITHUB_APP: false });
    const fetchSpy = installFetchSpy();

    const result = await commitToStrategyDoc({
      path: "docs/strategy/roadmap.md",
      content: "# Roadmap\n",
      message: "update roadmap",
    });

    expect(result.status).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens a PR with normalized path, encoded content, and existing sha", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_778_000_000_000);
    vi.spyOn(
      await import("./github-auth.js"),
      "getOpenclawGithubAuth",
    ).mockResolvedValue({ token: "ghs_install", source: "app" });
    patchEnv({
      OPENCLAW_GITHUB_REPO: "owner/repo",
      OPENCLAW_GITHUB_BASE_BRANCH: "main",
    });
    const fetchSpy = installFetchSpy();
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base_sha" } }))
      .mockResolvedValueOnce(jsonResponse({ ref: "refs/heads/branch" }, 201))
      .mockResolvedValueOnce(jsonResponse({ sha: "old_sha" }))
      .mockResolvedValueOnce(jsonResponse({ content: { sha: "new_sha" } }))
      .mockResolvedValueOnce(
        jsonResponse({ html_url: "https://github.com/owner/repo/pull/42" }),
      );

    const result = await commitToStrategyDoc({
      path: "/docs/strategy/Q2 Plan.md",
      content: "# Q2\n",
      message: "refresh Q2 strategy",
    });

    expect(result).toEqual({
      status: "opened",
      prUrl: "https://github.com/owner/repo/pull/42",
      branch: "openclaw/strategy-Q2-Plan-1778000000",
      filePath: "docs/strategy/Q2 Plan.md",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/owner/repo/git/ref/heads/main",
    );
    const putInit = fetchSpy.mock.calls[3]?.[1] as RequestInit;
    expect(JSON.parse(String(putInit.body))).toMatchObject({
      message: "refresh Q2 strategy",
      content: Buffer.from("# Q2\n", "utf-8").toString("base64"),
      branch: "openclaw/strategy-Q2-Plan-1778000000",
      sha: "old_sha",
    });
    const prInit = fetchSpy.mock.calls[4]?.[1] as RequestInit;
    expect(JSON.parse(String(prInit.body))).toMatchObject({
      title: "chore(openclaw): refresh Q2 strategy",
      head: "openclaw/strategy-Q2-Plan-1778000000",
      base: "main",
      maintainer_can_modify: true,
    });
  });

  it("surfaces GitHub API and malformed PR responses as error statuses", async () => {
    vi.spyOn(
      await import("./github-auth.js"),
      "getOpenclawGithubAuth",
    ).mockResolvedValue({ token: "ghs_install", source: "app" });
    const fetchSpy = installFetchSpy();
    fetchSpy.mockResolvedValueOnce(jsonResponse({ message: "nope" }, 500));

    await expect(getOpenclawGithubAuth()).resolves.toMatchObject({
      token: "ghs_install",
    });
    const baseError = await commitToStrategyDoc({
      path: "docs/strategy/roadmap.md",
      content: "# Roadmap\n",
      message: "update roadmap",
      repo: "owner/repo",
    });
    expect(baseError).toEqual({
      status: "error",
      note: "Failed to read base ref: HTTP 500",
    });

    fetchSpy.mockReset();
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ object: { sha: "base_sha" } }))
      .mockResolvedValueOnce(jsonResponse({}, 201))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    const prShapeError = await commitToStrategyDoc({
      path: "docs/strategy/roadmap.md",
      content: "# Roadmap\n",
      message: "update roadmap",
      repo: "owner/repo",
    });
    expect(prShapeError).toEqual({
      status: "error",
      note: "PR response missing html_url",
    });
  });
});

describe("createGithubIssue", () => {
  it("returns not_configured when GitHub auth is unavailable", async () => {
    patchEnv({ OPENCLAW_USE_GITHUB_APP: false });

    await expect(
      createGithubIssue({ title: "Incident", body: "Details" }),
    ).resolves.toMatchObject({ status: "not_configured" });
  });

  it("opens an issue with founder-facing footer and labels", async () => {
    vi.spyOn(
      await import("./github-auth.js"),
      "getOpenclawGithubAuth",
    ).mockResolvedValue({ token: "ghs_install", source: "app" });
    const fetchSpy = installFetchSpy().mockResolvedValueOnce(
      jsonResponse({
        html_url: "https://github.com/owner/repo/issues/7",
        number: 7,
      }),
    );

    const result = await createGithubIssue({
      repo: "owner/repo",
      title: "Investigate churn",
      body: "MRR dipped",
      labels: ["growth"],
    });

    expect(result).toEqual({
      status: "opened",
      issueUrl: "https://github.com/owner/repo/issues/7",
      issueNumber: 7,
    });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      title: "Investigate churn",
      labels: ["growth"],
    });
    expect(String((init as RequestInit).body)).toContain(
      "Issue opened automatically by OpenClaw",
    );
  });
});

describe("postToTopic", () => {
  it("rejects topics outside the reporting allowlist", async () => {
    expect(POST_TO_TOPIC_ALLOWLIST.has("incidents")).toBe(false);
    await expect(
      postToTopic({ topic: "incidents", text: "prod is down" }),
    ).rejects.toThrow(OpenClawWriteAllowlistError);
  });

  it("returns not_configured when Telegram env vars are missing", async () => {
    await expect(
      postToTopic({ topic: "ops", text: "Daily heads-up" }),
    ).resolves.toMatchObject({ status: "not_configured", topic: "ops" });
  });

  it("posts to the configured Telegram topic", async () => {
    process.env["SERGEANT_ALERT_BOT_TOKEN"] = "bot-token";
    process.env["SERGEANT_OPS_CHAT_ID"] = "-1001";
    process.env["TELEGRAM_TOPIC_ENGINEERING"] = "42";
    const fetchSpy = installFetchSpy().mockResolvedValueOnce(
      jsonResponse({ ok: true, result: { message_id: 123 } }),
    );

    const result = await postToTopic({
      topic: "engineering",
      text: "Ship window starts now",
    });

    expect(result).toEqual({
      status: "posted",
      topic: "engineering",
      messageId: 123,
    });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.telegram.org/botbot-token/sendMessage",
    );
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      chat_id: "-1001",
      message_thread_id: 42,
      text: "Ship window starts now",
      disable_notification: true,
    });
  });
});

describe("pauseWorkflow and muteSentryAlert", () => {
  it("fails soft when n8n and Sentry secrets are absent", async () => {
    await expect(pauseWorkflow({ workflowId: "wf_1" })).resolves.toMatchObject({
      status: "not_configured",
      workflowId: "wf_1",
    });
    await expect(muteSentryAlert({ issueId: "123" })).resolves.toMatchObject({
      status: "not_configured",
      issueId: "123",
    });
  });

  it("calls n8n deactivate and Sentry ignore endpoints", async () => {
    process.env["N8N_API_URL"] = "https://n8n.example.test/";
    process.env["N8N_API_KEY"] = "n8n-key";
    process.env["SENTRY_AUTH_TOKEN"] = "sentry-token";
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-05-13T00:00:00Z"));
    const fetchSpy = installFetchSpy()
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(pauseWorkflow({ workflowId: "wf/1" })).resolves.toEqual({
      status: "paused",
      workflowId: "wf/1",
    });
    await expect(
      muteSentryAlert({
        issueId: "issue/123",
        untilIso: "2026-05-13T01:30:00.000Z",
      }),
    ).resolves.toEqual({
      status: "muted",
      issueId: "issue/123",
      untilIso: "2026-05-13T01:30:00.000Z",
    });

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "https://n8n.example.test/api/v1/workflows/wf%2F1/deactivate",
    );
    expect(String(fetchSpy.mock.calls[1]?.[0])).toBe(
      "https://sentry.io/api/0/issues/issue%2F123/",
    );
    const sentryInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(sentryInit.body))).toEqual({
      status: "ignored",
      ignoreDuration: 90,
    });
  });
});
