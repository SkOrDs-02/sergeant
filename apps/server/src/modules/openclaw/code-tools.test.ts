import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  githubDiff,
  githubPrs,
  githubSearch,
  githubTree,
} from "./code-tools.js";

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
      return makeResponse({ items: [] });
    },
  ) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("githubSearch", () => {
  it("defaults scope to 'code' and prepends repo qualifier", async () => {
    await githubSearch({ query: "useState" });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toMatch(
      /https:\/\/api\.github\.com\/search\/code\?/,
    );
    // URLSearchParams encodes spaces as `+` (form-urlencoded).
    expect(captured[0]!.url).toContain("repo%3ASkords-01%2FSergeant+useState");
  });

  it("routes issues scope to /search/issues with is:issue qualifier", async () => {
    await githubSearch({ query: "auth bug", scope: "issues" });
    expect(captured[0]!.url).toMatch(/\/search\/issues\?/);
    expect(captured[0]!.url).toContain("is%3Aissue");
  });

  it("routes prs scope to /search/issues with is:pr qualifier", async () => {
    await githubSearch({ query: "openclaw", scope: "prs" });
    expect(captured[0]!.url).toMatch(/\/search\/issues\?/);
    expect(captured[0]!.url).toContain("is%3Apr");
  });

  it("clamps perPage / page to safe bounds", async () => {
    await githubSearch({ query: "x", perPage: 100, page: 50 });
    const url = captured[0]!.url;
    expect(url).toContain("per_page=30");
    expect(url).toContain("page=10");
  });

  it("uses Bearer auth + GitHub API version header", async () => {
    await githubSearch({ query: "x" });
    const headers = captured[0]!.init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fake-token");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });
});

describe("githubTree", () => {
  it("hits /git/trees/{ref} without recursive by default", async () => {
    await githubTree({ ref: "main" });
    expect(captured[0]!.url).toBe(
      "https://api.github.com/repos/Skords-01/Sergeant/git/trees/main",
    );
  });

  it("appends recursive=1 when requested", async () => {
    await githubTree({ ref: "develop", recursive: true });
    expect(captured[0]!.url).toBe(
      "https://api.github.com/repos/Skords-01/Sergeant/git/trees/develop?recursive=1",
    );
  });
});

describe("githubDiff", () => {
  // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- GitHub compare-API syntax requires literal `...` between refs
  it("hits /compare/{base}...{head}", async () => {
    await githubDiff({ base: "main", head: "feature/x" });
    expect(captured[0]!.url).toBe(
      // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- GitHub compare-API syntax requires literal `...` between refs
      "https://api.github.com/repos/Skords-01/Sergeant/compare/main...feature%2Fx",
    );
  });

  it("rejects empty base/head", async () => {
    await expect(githubDiff({ base: "", head: "x" })).rejects.toThrow(
      /github_diff/,
    );
  });
});

describe("githubPrs", () => {
  it("lists /pulls with state/sort/direction defaults", async () => {
    await githubPrs({});
    const url = captured[0]!.url;
    expect(url).toMatch(
      /\/repos\/Skords-01\/Sergeant\/pulls\?state=open&sort=updated&direction=desc/,
    );
  });

  it("routes through /search/issues when author is provided", async () => {
    await githubPrs({ author: "Skords-01" });
    const url = captured[0]!.url;
    expect(url).toMatch(/\/search\/issues\?/);
    expect(url).toContain("author%3ASkords-01");
  });
});
