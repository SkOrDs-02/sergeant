import { describe, it, expect } from "vitest";
import {
  createSeoGscQueryTool,
  SeoGscQueryParamsSchema,
} from "./seo-gsc-query.js";
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

describe("SeoGscQueryParamsSchema", () => {
  it("rejects days>90", () => {
    expect(() => SeoGscQueryParamsSchema.parse({ days: 365 })).toThrow();
  });

  it("rejects unknown dimension", () => {
    expect(() =>
      SeoGscQueryParamsSchema.parse({ dimension: "weird" }),
    ).toThrow();
  });
});

describe("createSeoGscQueryTool", () => {
  it("reports not_configured payload from server", async () => {
    const { http } = makeHttp(() => ({
      body: {
        notConfigured: true,
        missing: ["OPENCLAW_GSC_API_KEY"],
      },
    }));
    const tool = createSeoGscQueryTool({ http });
    const result = await tool.execute("inv_1", { dimension: "query" });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("not configured");
    expect(text.text).toContain("OPENCLAW_GSC_API_KEY");
  });

  it("returns rows summary when configured", async () => {
    const { http } = makeHttp(() => ({
      body: {
        siteUrl: "sc-domain:sergeant.app",
        startDate: "2026-05-03",
        endDate: "2026-05-10",
        dimension: "query",
        rows: [
          { keys: ["a"], clicks: 1, impressions: 10, ctr: 0.1, position: 2 },
        ],
      },
    }));
    const tool = createSeoGscQueryTool({ http });
    const result = await tool.execute("inv_1", { dimension: "query" });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("rows=1");
  });
});
