import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGithub } from "./tools-github.js";

/**
 * `readGithub` — thin GitHub REST wrapper (mode: file | issue | pr).
 * Follows the fake-fetch + mocked github-auth pattern from
 * `code-tools.test.ts`.
 */

vi.mock("./github-auth.js", () => ({
  getOpenclawGithubAuth: vi.fn(async () => ({
    token: "fake-token",
    source: "github_app" as const,
  })),
}));

interface CapturedFetch {
  url: string;
  init: RequestInit | undefined;
}

let captured: CapturedFetch[];
let originalFetch: typeof globalThis.fetch;

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  captured = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      captured.push({ url: String(input), init });
      return makeResponse({ ok: true });
    },
  ) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("readGithub: mode='file'", () => {
  it("builds the contents URL with default ref (OPENCLAW_GITHUB_BASE_BRANCH)", async () => {
    const out = await readGithub({ mode: "file", filePath: "README.md" });
    expect(captured[0]!.url).toBe(
      "https://api.github.com/repos/Skords-01/Sergeant/contents/README.md?ref=main",
    );
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true });
  });

  it("uses a caller-supplied ref over the default", async () => {
    await readGithub({
      mode: "file",
      filePath: "docs/foo.md",
      ref: "feature/x",
    });
    expect(captured[0]!.url).toBe(
      "https://api.github.com/repos/Skords-01/Sergeant/contents/docs/foo.md?ref=feature%2Fx",
    );
  });

  it("throws when filePath is missing", async () => {
    await expect(readGithub({ mode: "file" })).rejects.toThrow(
      /filePath required for mode='file'/,
    );
    expect(captured).toHaveLength(0);
  });
});

describe("readGithub: mode='issue'", () => {
  it("hits /issues/{number}", async () => {
    await readGithub({ mode: "issue", number: 42 });
    expect(captured[0]!.url).toBe(
      "https://api.github.com/repos/Skords-01/Sergeant/issues/42",
    );
  });

  it("throws when number is missing", async () => {
    await expect(readGithub({ mode: "issue" })).rejects.toThrow(
      /number required for mode='issue'/,
    );
    expect(captured).toHaveLength(0);
  });
});

describe("readGithub: mode='pr'", () => {
  it("hits /pulls/{number}", async () => {
    await readGithub({ mode: "pr", number: 7 });
    expect(captured[0]!.url).toBe(
      "https://api.github.com/repos/Skords-01/Sergeant/pulls/7",
    );
  });

  it("throws when number is missing", async () => {
    await expect(readGithub({ mode: "pr" })).rejects.toThrow(
      /number required for mode='pr'/,
    );
    expect(captured).toHaveLength(0);
  });
});

describe("readGithub: request shape", () => {
  it("sends Bearer auth + GitHub API version header", async () => {
    await readGithub({ mode: "issue", number: 1 });
    const headers = captured[0]!.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fake-token");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    expect(headers["Accept"]).toBe("application/vnd.github+json");
  });

  it("returns null body when the response isn't valid JSON", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("not json", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
    ) as typeof globalThis.fetch;
    const out = await readGithub({ mode: "issue", number: 1 });
    expect(out.status).toBe(502);
    expect(out.body).toBeNull();
  });
});

describe("readGithub: auth failure", () => {
  it("throws a fail-closed error when GitHub auth is not configured", async () => {
    const authModule = await import("./github-auth.js");
    vi.mocked(authModule.getOpenclawGithubAuth).mockResolvedValueOnce(null);
    await expect(readGithub({ mode: "issue", number: 1 })).rejects.toThrow(
      /OpenClaw GitHub auth not configured/,
    );
    expect(captured).toHaveLength(0);
  });
});
