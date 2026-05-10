import { describe, it, expect } from "vitest";
import { createGithubDiffTool, GithubDiffParamsSchema } from "./github-diff.js";
import { OpenClawHttpClient } from "../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown) => { status?: number; body: unknown },
): { http: OpenClawHttpClient; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const http = new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      calls.push({ url, body });
      const { status, body: respBody } = responder(body);
      return Promise.resolve(
        new Response(JSON.stringify(respBody), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
  return { http, calls };
}

describe("GithubDiffParamsSchema", () => {
  it("requires base and head", () => {
    expect(() => GithubDiffParamsSchema.parse({ base: "" })).toThrow();
    expect(() => GithubDiffParamsSchema.parse({ base: "main" })).toThrow();
  });

  it("accepts repo override", () => {
    const parsed = GithubDiffParamsSchema.parse({
      base: "main",
      head: "feat/x",
      repo: "owner/repo",
    });
    expect(parsed.repo).toBe("owner/repo");
  });
});

describe("createGithubDiffTool", () => {
  it("forwards params to /github/diff", async () => {
    const { http, calls } = makeHttp(() => ({
      body: {
        url: "https://api.github.com/repos/x/y/compare/a\u2026b",
        status: 200,
        body: { files: [] },
      },
    }));
    const tool = createGithubDiffTool({ http });
    await tool.execute("inv_1", { base: "main", head: "feat/x" });
    expect(calls[0]!.url).toMatch(/\/api\/internal\/openclaw\/github\/diff/);
    expect(calls[0]!.body).toEqual({ base: "main", head: "feat/x" });
  });
});
