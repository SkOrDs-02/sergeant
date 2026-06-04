/**
 * Юніт-тести для ops/metrics tool-хендлерів у `tools.ts`:
 *   getStripeMetrics, getSentryIssues, getPostHogStats,
 *   getGithubReleases, getServerStats, readWorkflowLogs,
 *   readGithub, recordDecision.
 *
 * Всі тести — deterministic: `fetch` підмінюється inline mock-ом,
 * `pg.Pool` — fake-pool, GitHub auth та env — vi.mock.
 * Ніяких HTTP-дзвінків, жодного зовнішнього стану.
 *
 * Паттерн env-mock-у для env-fields що зберігаються в typed `env` object:
 * `vi.mock("../../env.js")` → Proxy → `mockEnv` (hoisted). Для полів що
 * читаються через `process.env` напряму — мутуємо/відновлюємо в afterEach.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

// ─── Hoisted mockEnv для typed env fields (N8N_API_URL, N8N_API_KEY, PORT) ─
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, unknown>,
}));

// Mock `env.js` (re-export of env/env.js). Returns undefined for unset keys
// so logger fallback (`env.LOG_LEVEL ?? "info"`) works correctly — same
// rationale as `n8n.test.ts`.
vi.mock("../../env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop: string) {
        return mockEnv[prop];
      },
    },
  ),
}));

// ─── Mock github-auth before importing tools ──────────────────────────────
vi.mock("./github-auth.js", () => ({
  getOpenclawGithubAuth: vi.fn(async () => null),
  _clearOpenclawGithubAuthCacheForTests: vi.fn(),
}));

// ─── Mock ai-memory bootstrap ─────────────────────────────────────────────
vi.mock("../ai-memory/bootstrap.js", () => ({
  getAiMemory: vi.fn(() => ({ recall: vi.fn(async () => []) })),
}));

// ─── Mock repoAllowlist so readGithub/getGithubReleases use test repo ──────
vi.mock("./repoAllowlist.js", () => ({
  assertOpenClawRepoAllowed: vi.fn((repo?: string) => repo ?? "Skords-01/Sergeant"),
}));

import {
  getStripeMetrics,
  getSentryIssues,
  getPostHogStats,
  getGithubReleases,
  getServerStats,
  readWorkflowLogs,
  readGithub,
  recordDecision,
} from "./tools.js";
import { getOpenclawGithubAuth } from "./github-auth.js";

// ─── Helpers ─────────────────────────────────────────────────────────────

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let capturedFetch: Array<{ url: string; init: RequestInit | undefined }> = [];
let originalFetch: typeof globalThis.fetch;

const savedProcessEnv: Record<string, string | undefined> = {};
const PROCESS_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "POSTHOG_API_KEY",
  "POSTHOG_PROJECT_ID",
  "SERVER_INTERNAL_URL",
] as const;

beforeEach(() => {
  capturedFetch = [];
  originalFetch = globalThis.fetch;
  vi.clearAllMocks();
  // Reset typed env proxy
  for (const key of Object.keys(mockEnv)) {
    delete mockEnv[key];
  }
  // Snapshot process.env keys
  for (const key of PROCESS_ENV_KEYS) {
    savedProcessEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  // Restore process.env
  for (const key of PROCESS_ENV_KEYS) {
    if (savedProcessEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedProcessEnv[key];
    }
  }
});

function installFetch(
  impl: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  globalThis.fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      capturedFetch.push({ url, init });
      return impl(url, init);
    },
  ) as typeof globalThis.fetch;
}

function makeFakePool(rows: Record<string, unknown>[] = []): Pool {
  return {
    async query(_text: string, _values?: unknown[]) {
      return { rows, rowCount: rows.length };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
}

// ─── getStripeMetrics ─────────────────────────────────────────────────────

describe("getStripeMetrics", () => {
  it("повертає notConfigured коли STRIPE_SECRET_KEY відсутній", async () => {
    const result = await getStripeMetrics({});
    expect(result.notConfigured).toBe(true);
    expect(capturedFetch).toHaveLength(0);
  });

  it("happy-path: повертає агрегати з Stripe charges API", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_xxx";
    installFetch(() =>
      jsonRes({
        data: [
          { amount: 29900, paid: true },
          { amount: 14900, paid: true },
          { amount: 9900, paid: false },
        ],
      }),
    );

    const result = await getStripeMetrics({ days: 7 });
    expect(result.notConfigured).toBeUndefined();
    expect(result.windowDays).toBe(7);
    expect(result.successfulCount).toBe(2);
    expect(result.failedCount).toBe(1);
    // grossAmountUah = (29900 + 14900) / 100 = 448
    expect(result.grossAmountUah).toBe(448);
    expect(capturedFetch).toHaveLength(1);
    expect(capturedFetch[0]!.url).toContain("api.stripe.com/v1/charges");
    const headers = capturedFetch[0]!.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toContain("Bearer sk_test_xxx");
  });

  it("clamps days до [1, 90]", async () => {
    process.env["STRIPE_SECRET_KEY"] = "sk_test_clamp";
    installFetch(() => jsonRes({ data: [] }));
    const result = await getStripeMetrics({ days: 9999 });
    expect(result.windowDays).toBe(90);
  });
});

// ─── getSentryIssues ──────────────────────────────────────────────────────

describe("getSentryIssues", () => {
  it("повертає notConfigured коли SENTRY_AUTH_TOKEN відсутній", async () => {
    const result = await getSentryIssues({});
    expect(result.notConfigured).toBe(true);
    expect(capturedFetch).toHaveLength(0);
  });

  it("happy-path: повертає нормалізовані issues з Sentry API", async () => {
    process.env["SENTRY_AUTH_TOKEN"] = "sntrys_token";
    installFetch(() =>
      jsonRes([
        {
          title: "TypeError: Cannot read property",
          level: "error",
          count: "42",
          permalink: "https://sentry.io/issues/1/",
        },
      ]),
    );

    const result = await getSentryIssues({ level: "error", limit: 5 });
    expect(result.notConfigured).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues![0]).toEqual({
      title: "TypeError: Cannot read property",
      level: "error",
      count: "42",
      permalink: "https://sentry.io/issues/1/",
    });
    expect(capturedFetch[0]!.url).toContain("level:error");
    expect(capturedFetch[0]!.url).toContain("limit=5");
  });

  it("повертає порожній масив + note коли Sentry API не масив (403)", async () => {
    process.env["SENTRY_AUTH_TOKEN"] = "sntrys_token";
    installFetch(() => jsonRes({ detail: "Forbidden" }, 403));

    const result = await getSentryIssues({});
    expect(result.issues).toEqual([]);
    expect(result.note).toContain("403");
  });
});

// ─── getPostHogStats ──────────────────────────────────────────────────────

describe("getPostHogStats", () => {
  it("повертає notConfigured коли немає POSTHOG_API_KEY або PROJECT_ID", async () => {
    const result = await getPostHogStats({});
    expect(result.notConfigured).toBe(true);
    expect(capturedFetch).toHaveLength(0);
  });

  it("happy-path: передає запит у PostHog API і повертає тіло", async () => {
    process.env["POSTHOG_API_KEY"] = "phc_key";
    process.env["POSTHOG_PROJECT_ID"] = "42";
    const fakeBody = { results: [{ data: [1, 2, 3] }] };
    installFetch(() => jsonRes(fakeBody));

    const result = await getPostHogStats({ days: 14 });
    expect(result.notConfigured).toBeUndefined();
    expect(result.body).toMatchObject(fakeBody);
    expect(capturedFetch[0]!.url).toContain("14d");
    expect(capturedFetch[0]!.url).toContain("projects/42");
  });

  it("clamps days до [1, 180]", async () => {
    process.env["POSTHOG_API_KEY"] = "phc_key";
    process.env["POSTHOG_PROJECT_ID"] = "1";
    installFetch(() => jsonRes({}));
    await getPostHogStats({ days: 9999 });
    expect(capturedFetch[0]!.url).toContain("180d");
  });
});

// ─── getGithubReleases ────────────────────────────────────────────────────

describe("getGithubReleases", () => {
  it("happy-path: нормалізує releases array з GitHub", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValueOnce({
      token: "ghs_token",
      source: "app",
    });
    installFetch(() =>
      jsonRes([
        {
          tag_name: "v1.2.3",
          name: "Release 1.2.3",
          published_at: "2026-05-01T10:00:00Z",
          body: "## Changes\n- Fix X\n- Add Y",
        },
        {
          tag_name: "v1.2.2",
          name: null,
          published_at: null,
          body: null,
        },
      ]),
    );

    const result = await getGithubReleases({ limit: 2 });
    expect(result.releases).toHaveLength(2);
    expect(result.releases[0]).toEqual({
      tagName: "v1.2.3",
      name: "Release 1.2.3",
      publishedAt: "2026-05-01T10:00:00Z",
      bodyExcerpt: "## Changes\n- Fix X\n- Add Y",
    });
    // name falls back to tagName when null
    expect(result.releases[1]!.name).toBe("v1.2.2");
    expect(capturedFetch[0]!.url).toContain("per_page=2");
  });

  it("повертає порожній масив + note коли GitHub не повертає масив (404)", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValueOnce({
      token: "ghs_token",
      source: "app",
    });
    installFetch(() => jsonRes({ message: "Not Found" }, 404));

    const result = await getGithubReleases({});
    expect(result.releases).toEqual([]);
    expect(result.note).toContain("404");
    expect(result.note).toContain("Not Found");
  });

  it("clamps limit до [1, 20]", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValueOnce({
      token: "tok",
      source: "app",
    });
    installFetch(() => jsonRes([]));
    await getGithubReleases({ limit: 999 });
    expect(capturedFetch[0]!.url).toContain("per_page=20");
  });
});

// ─── getServerStats ───────────────────────────────────────────────────────

describe("getServerStats", () => {
  it("happy-path: проксює /healthz і повертає { source, status, body }", async () => {
    process.env["SERVER_INTERNAL_URL"] = "http://test-server.internal";
    const fakeHealth = { status: "ok", db: "ok" };
    installFetch(() => jsonRes(fakeHealth));

    const result = await getServerStats();
    expect(result.source).toBe("/healthz");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject(fakeHealth);
    expect(capturedFetch[0]!.url).toBe("http://test-server.internal/healthz");
  });

  it("повертає body=null коли /healthz відповідає не-JSON", async () => {
    process.env["SERVER_INTERNAL_URL"] = "http://test-server.internal";
    globalThis.fetch = vi.fn(async () => {
      return new Response("not json", { status: 503 });
    }) as typeof globalThis.fetch;

    const result = await getServerStats();
    expect(result.status).toBe(503);
    expect(result.body).toBeNull();
  });
});

// ─── readWorkflowLogs ─────────────────────────────────────────────────────

describe("readWorkflowLogs", () => {
  it("повертає порожній масив коли N8N не налаштовано (env пусте)", async () => {
    // mockEnv has no N8N_API_URL / N8N_API_KEY — readWorkflowLogs reads env.N8N_API_URL
    const result = await readWorkflowLogs({ workflowId: "wf_001" });
    expect(result.workflowId).toBe("wf_001");
    expect(result.executions).toEqual([]);
    expect(capturedFetch).toHaveLength(0);
  });

  it("happy-path: повертає normalized executions", async () => {
    mockEnv["N8N_API_URL"] = "https://n8n.example.test";
    mockEnv["N8N_API_KEY"] = "n8n-key";
    installFetch(() =>
      jsonRes({
        data: [
          {
            id: "exec-1",
            finished: true,
            mode: "webhook",
            startedAt: "2026-05-13T10:00:00Z",
            stoppedAt: "2026-05-13T10:00:05Z",
            status: "success",
          },
        ],
      }),
    );

    const result = await readWorkflowLogs({ workflowId: "wf_001", limit: 5 });
    expect(result.workflowId).toBe("wf_001");
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]).toEqual({
      id: "exec-1",
      finished: true,
      mode: "webhook",
      startedAt: "2026-05-13T10:00:00Z",
      stoppedAt: "2026-05-13T10:00:05Z",
      status: "success",
    });
    expect(capturedFetch[0]!.url).toContain("workflowId=wf_001");
    expect(capturedFetch[0]!.url).toContain("limit=5");
  });

  it("throws коли n8n API повертає non-ok status", async () => {
    mockEnv["N8N_API_URL"] = "https://n8n.example.test";
    mockEnv["N8N_API_KEY"] = "n8n-key";
    globalThis.fetch = vi.fn(async () => {
      return new Response("Unauthorized", { status: 401 });
    }) as typeof globalThis.fetch;

    await expect(readWorkflowLogs({ workflowId: "wf_001" })).rejects.toThrow(
      /401/,
    );
  });
});

// ─── readGithub ───────────────────────────────────────────────────────────

describe("readGithub", () => {
  beforeEach(() => {
    // Set OPENCLAW_GITHUB_BASE_BRANCH for resolveRef() fallback
    mockEnv["OPENCLAW_GITHUB_BASE_BRANCH"] = "main";
  });

  it("throws коли GitHub auth не налаштовано (null)", async () => {
    // getOpenclawGithubAuth mocked to return null by default
    await expect(
      readGithub({ mode: "file", filePath: "README.md" }),
    ).rejects.toThrow(/not configured/i);
  });

  it("happy-path mode=file: хіттить contents API з правильним ref", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValueOnce({
      token: "ghs_tok",
      source: "app",
    });
    installFetch(() => jsonRes({ name: "README.md", content: "aGVsbG8=" }));

    const result = await readGithub({ mode: "file", filePath: "README.md" });
    expect(result.status).toBe(200);
    expect(capturedFetch[0]!.url).toContain("/contents/README.md");
  });

  it("throws коли mode=file без filePath", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValueOnce({
      token: "tok",
      source: "app",
    });
    await expect(readGithub({ mode: "file" })).rejects.toThrow(
      /filePath required/,
    );
  });

  it("mode=pr хіттить pulls API з номером PR", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValueOnce({
      token: "tok",
      source: "app",
    });
    installFetch(() => jsonRes({ number: 99, title: "My PR" }));

    const result = await readGithub({ mode: "pr", number: 99 });
    expect(result.status).toBe(200);
    expect(capturedFetch[0]!.url).toContain("/pulls/99");
  });
});

// ─── recordDecision ───────────────────────────────────────────────────────

describe("recordDecision", () => {
  const baseInput = {
    founderUserId: "user-1",
    topic: "Use PostgreSQL for reminders",
    context: "We evaluated Redis and PG.",
    decision: "Use PG.",
    rationale: "Already in stack.",
  };

  beforeEach(() => {
    mockEnv["OPENCLAW_GITHUB_REPO"] = "owner/repo";
    mockEnv["OPENCLAW_GITHUB_BASE_BRANCH"] = "main";
  });

  it("happy-path: повертає decisionId + prUrl коли GitHub auth OK", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValue({
      token: "ghs_tok",
      source: "app",
    });
    const pool = makeFakePool([{ id: "42" }]);
    let fetchCount = 0;
    installFetch(() => {
      fetchCount++;
      if (fetchCount === 1) return jsonRes({ object: { sha: "base_sha" } });
      if (fetchCount === 2) return jsonRes({ ref: "refs/heads/branch" }, 201);
      if (fetchCount === 3) return jsonRes({ content: { sha: "new_sha" } });
      return jsonRes({ html_url: "https://github.com/owner/repo/pull/1" });
    });

    const result = await recordDecision(pool, baseInput);
    expect(result.decisionId).toBe(42);
    expect(result.prUrl).toBe("https://github.com/owner/repo/pull/1");
    expect(result.prError).toBeUndefined();
  });

  it("повертає prUrl=null з prError коли GitHub auth відсутній (null)", async () => {
    // getOpenclawGithubAuth returns null (default mock)
    const pool = makeFakePool([{ id: "7" }]);

    const result = await recordDecision(pool, baseInput);
    expect(result.decisionId).toBe(7);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("not configured");
    expect(capturedFetch).toHaveLength(0);
  });

  it("fail-soft: PR-create failure повертає prUrl=null + prError без throw", async () => {
    vi.mocked(getOpenclawGithubAuth).mockResolvedValue({
      token: "ghs_tok",
      source: "app",
    });
    const pool = makeFakePool([{ id: "99" }]);
    // Simulate GitHub base-ref failing → openDecisionPr throws
    installFetch(() => jsonRes({ message: "nope" }, 500));

    const result = await recordDecision(pool, baseInput);
    expect(result.decisionId).toBe(99);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("HTTP 500");
  });
});
