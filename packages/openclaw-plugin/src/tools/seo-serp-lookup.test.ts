import { describe, it, expect } from "vitest";
import {
  createSeoSerpLookupTool,
  SeoSerpLookupParamsSchema,
} from "./seo-serp-lookup.js";
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

describe("SeoSerpLookupParamsSchema", () => {
  it("requires non-empty query", () => {
    expect(() => SeoSerpLookupParamsSchema.parse({ query: "" })).toThrow();
  });

  it("rejects num>20", () => {
    expect(() =>
      SeoSerpLookupParamsSchema.parse({ query: "x", num: 100 }),
    ).toThrow();
  });
});

describe("createSeoSerpLookupTool", () => {
  it("reports not_configured", async () => {
    const { http } = makeHttp(() => ({
      body: { notConfigured: true, missing: ["OPENCLAW_SERP_API_KEY"] },
    }));
    const tool = createSeoSerpLookupTool({ http });
    const result = await tool.execute("inv_1", { query: "sergeant app" });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("not configured");
  });

  it("returns ranked results", async () => {
    const { http } = makeHttp(() => ({
      body: {
        query: "sergeant app",
        hl: "uk",
        gl: "ua",
        results: [
          {
            position: 1,
            title: "Sergeant",
            link: "https://sergeant.app",
            snippet: "Co-founder bot",
          },
        ],
      },
    }));
    const tool = createSeoSerpLookupTool({ http });
    const result = await tool.execute("inv_1", { query: "sergeant app" });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("results=1");
  });
});
