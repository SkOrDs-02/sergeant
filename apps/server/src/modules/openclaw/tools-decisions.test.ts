import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

/**
 * `recordDecision` — INSERT into openclaw_decisions + best-effort GitHub PR.
 *
 * `tools-ops.test.ts` already covers the happy-path (all 4 fetch calls
 * succeed), the no-auth branch, the Kyiv-day filename boundary, and the
 * base-ref HTTP failure. This file targets the three remaining uncovered
 * fetch-failure branches inside `openDecisionPr` (create-branch,
 * create-file, open-PR), plus the 422-already-exists non-throw branch and
 * the missing-html_url guard.
 */

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    OPENCLAW_GITHUB_REPO: "owner/repo",
    OPENCLAW_GITHUB_BASE_BRANCH: "main",
  } as Record<string, unknown>,
}));

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

vi.mock("./github-auth.js", () => ({
  getOpenclawGithubAuth: vi.fn(async () => ({
    token: "ghs_tok",
    source: "github_app" as const,
  })),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { recordDecision } from "./tools-decisions.js";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface RecordedCall {
  text: string;
  values: unknown[];
}

function makeFakePool(rows: Record<string, unknown>[]): {
  pool: Pool;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      calls.push({ text, values });
      // First call is always the `INSERT ... openclaw_decisions`; second
      // (if any) is `UPDATE ... git_pr_url`.
      if (calls.length === 1) return { rows, rowCount: rows.length };
      return { rows: [], rowCount: 0 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

let capturedFetch: Array<{ url: string; init: RequestInit | undefined }>;
let originalFetch: typeof globalThis.fetch;

function installFetch(handler: (callIndex: number) => Response): void {
  let count = 0;
  globalThis.fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      capturedFetch.push({ url: String(input), init });
      const res = handler(count);
      count++;
      return res;
    },
  ) as typeof globalThis.fetch;
}

beforeEach(() => {
  capturedFetch = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

const baseInput = {
  founderUserId: "user-1",
  topic: "Use PostgreSQL for reminders",
  context: "We evaluated Redis and PG.",
  decision: "Use PG.",
  rationale: "Already in stack.",
};

describe("recordDecision: openDecisionPr fetch-failure branches", () => {
  it("fails soft when branch creation returns a non-422 error status", async () => {
    const { pool } = makeFakePool([{ id: "1" }]);
    installFetch((i) => {
      if (i === 0) return jsonRes({ object: { sha: "base_sha" } });
      // create-branch fails with 500 (not the benign 422 already-exists case)
      return jsonRes({ message: "boom" }, 500);
    });
    const result = await recordDecision(pool, baseInput);
    expect(result.decisionId).toBe(1);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("Failed to create branch: HTTP 500");
  });

  it("treats 422 (branch already exists) as non-fatal and proceeds", async () => {
    const { pool } = makeFakePool([{ id: "2" }]);
    installFetch((i) => {
      if (i === 0) return jsonRes({ object: { sha: "base_sha" } });
      if (i === 1) return jsonRes({ message: "Reference already exists" }, 422);
      if (i === 2) return jsonRes({ content: { sha: "new_sha" } });
      return jsonRes({ html_url: "https://github.com/owner/repo/pull/3" });
    });
    const result = await recordDecision(pool, baseInput);
    expect(result.prUrl).toBe("https://github.com/owner/repo/pull/3");
    expect(result.prError).toBeUndefined();
  });

  it("fails soft when file creation (PUT contents) fails", async () => {
    const { pool } = makeFakePool([{ id: "3" }]);
    installFetch((i) => {
      if (i === 0) return jsonRes({ object: { sha: "base_sha" } });
      if (i === 1) return jsonRes({ ref: "refs/heads/branch" }, 201);
      // PUT contents fails
      return jsonRes({ message: "conflict" }, 409);
    });
    const result = await recordDecision(pool, baseInput);
    expect(result.decisionId).toBe(3);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("Failed to create file: HTTP 409");
  });

  it("fails soft when opening the PR fails", async () => {
    const { pool } = makeFakePool([{ id: "4" }]);
    installFetch((i) => {
      if (i === 0) return jsonRes({ object: { sha: "base_sha" } });
      if (i === 1) return jsonRes({ ref: "refs/heads/branch" }, 201);
      if (i === 2) return jsonRes({ content: { sha: "new_sha" } });
      return jsonRes({ message: "server error" }, 502);
    });
    const result = await recordDecision(pool, baseInput);
    expect(result.decisionId).toBe(4);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("Failed to open PR: HTTP 502");
  });

  it("fails soft when the PR response is missing html_url", async () => {
    const { pool } = makeFakePool([{ id: "5" }]);
    installFetch((i) => {
      if (i === 0) return jsonRes({ object: { sha: "base_sha" } });
      if (i === 1) return jsonRes({ ref: "refs/heads/branch" }, 201);
      if (i === 2) return jsonRes({ content: { sha: "new_sha" } });
      return jsonRes({ number: 9 }); // no html_url field
    });
    const result = await recordDecision(pool, baseInput);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("PR response missing html_url");
  });

  it("fails soft when the base ref has no sha", async () => {
    const { pool } = makeFakePool([{ id: "6" }]);
    installFetch(() => jsonRes({ object: {} })); // no sha
    const result = await recordDecision(pool, baseInput);
    expect(result.prUrl).toBeNull();
    expect(result.prError).toContain("Base ref has no sha");
  });
});
