import { describe, it, expect } from "vitest";
import { createGithubPrsTool, GithubPrsParamsSchema } from "./github-prs.js";
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

describe("GithubPrsParamsSchema", () => {
  it("accepts all-optional input", () => {
    expect(GithubPrsParamsSchema.parse({})).toEqual({});
  });

  it("rejects unknown state", () => {
    expect(() => GithubPrsParamsSchema.parse({ state: "weird" })).toThrow();
  });
});

describe("createGithubPrsTool", () => {
  it("forwards filter params to /github/prs", async () => {
    const { http, calls } = makeHttp(() => ({
      body: {
        url: "https://api.github.com/repos/x/y/pulls?state=open",
        status: 200,
        body: [],
      },
    }));
    const tool = createGithubPrsTool({ http });
    await tool.execute("inv_1", {
      state: "open",
      sort: "updated",
      direction: "desc",
    });
    expect(calls[0]!.url).toMatch(/\/api\/internal\/openclaw\/github\/prs/);
    expect(calls[0]!.body).toEqual({
      state: "open",
      sort: "updated",
      direction: "desc",
    });
  });
});
