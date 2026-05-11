import { describe, it, expect } from "vitest";
import {
  createGithubSearchTool,
  GithubSearchParamsSchema,
} from "./github-search.js";
import { OpenClawHttpClient } from "../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown, url: string) => { status?: number; body: unknown },
): { http: OpenClawHttpClient; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const http = new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      calls.push({ url, body });
      const { status, body: respBody } = responder(body, url);
      return Promise.resolve(
        new Response(JSON.stringify(respBody), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
  return { http, calls };
}

describe("GithubSearchParamsSchema", () => {
  it("requires query", () => {
    expect(() => GithubSearchParamsSchema.parse({})).toThrow();
  });

  it("clamps page/perPage out-of-range", () => {
    expect(() =>
      GithubSearchParamsSchema.parse({ query: "x", perPage: 100 }),
    ).toThrow();
    expect(() =>
      GithubSearchParamsSchema.parse({ query: "x", page: 20 }),
    ).toThrow();
  });
});

describe("createGithubSearchTool", () => {
  it("forwards params to /github/search", async () => {
    const { http, calls } = makeHttp(() => ({
      body: {
        url: "https://api.github.com/search/code?q=x",
        status: 200,
        body: { items: [] },
      },
    }));
    const tool = createGithubSearchTool({ http });
    await tool.execute("inv_1", { query: "useState", scope: "code" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/api\/internal\/openclaw\/github\/search/);
    expect(calls[0]!.body).toEqual({ query: "useState", scope: "code" });
  });

  it("returns structured payload on success", async () => {
    const { http } = makeHttp(() => ({
      body: {
        url: "u",
        status: 200,
        body: { total_count: 0, items: [] },
      },
    }));
    const tool = createGithubSearchTool({ http });
    const result = await tool.execute("inv_1", { query: "x" });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("github_search status=200");
  });

  it("formats HTTP error gracefully", async () => {
    const { http } = makeHttp(() => ({
      status: 500,
      body: { error: "github_error", message: "fail" },
    }));
    const tool = createGithubSearchTool({ http });
    const result = await tool.execute("inv_1", { query: "x" });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("github_search error");
  });
});
