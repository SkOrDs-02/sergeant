import { describe, it, expect } from "vitest";
import { createGithubTreeTool, GithubTreeParamsSchema } from "./github-tree.js";
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

describe("GithubTreeParamsSchema", () => {
  it("accepts empty input (all optional)", () => {
    expect(GithubTreeParamsSchema.parse({})).toEqual({});
  });

  it("accepts recursive=true", () => {
    const parsed = GithubTreeParamsSchema.parse({
      ref: "main",
      recursive: true,
    });
    expect(parsed.recursive).toBe(true);
  });
});

describe("createGithubTreeTool", () => {
  it("forwards params to /github/tree", async () => {
    const { http, calls } = makeHttp(() => ({
      body: {
        url: "https://api.github.com/repos/x/y/git/trees/main",
        status: 200,
        body: { tree: [] },
      },
    }));
    const tool = createGithubTreeTool({ http });
    await tool.execute("inv_1", { ref: "main", recursive: false });
    expect(calls[0]!.url).toMatch(/\/api\/internal\/openclaw\/github\/tree/);
    expect(calls[0]!.body).toEqual({ ref: "main", recursive: false });
  });
});
