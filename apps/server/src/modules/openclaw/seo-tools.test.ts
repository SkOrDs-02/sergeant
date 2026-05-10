import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seoGscQuery, seoPsiAudit, seoSerpLookup } from "./seo-tools.js";
import { env } from "../../env.js";

interface CapturedFetch {
  url: string;
  init: RequestInit | undefined;
}

let captured: CapturedFetch[];
let originalFetch: typeof globalThis.fetch;

const originalEnv: Record<string, unknown> = {};

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
      return makeResponse({});
    },
  ) as typeof globalThis.fetch;
  for (const key of [
    "OPENCLAW_PSI_API_KEY",
    "OPENCLAW_GSC_API_KEY",
    "OPENCLAW_GSC_SITE_URL",
    "OPENCLAW_SERP_API_KEY",
  ] as const) {
    originalEnv[key] = env[key];
    (env as unknown as Record<string, string>)[key] = "";
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of [
    "OPENCLAW_PSI_API_KEY",
    "OPENCLAW_GSC_API_KEY",
    "OPENCLAW_GSC_SITE_URL",
    "OPENCLAW_SERP_API_KEY",
  ] as const) {
    (env as unknown as Record<string, unknown>)[key] = originalEnv[key];
  }
});

describe("seoGscQuery", () => {
  it("returns notConfigured when API key/site URL missing", async () => {
    const result = await seoGscQuery({});
    expect(result.notConfigured).toBe(true);
    expect(result.missing).toEqual(
      expect.arrayContaining(["OPENCLAW_GSC_API_KEY", "OPENCLAW_GSC_SITE_URL"]),
    );
    expect(captured).toHaveLength(0);
  });

  it("hits searchAnalytics endpoint when configured", async () => {
    (env as unknown as Record<string, string>)["OPENCLAW_GSC_API_KEY"] = "k";
    (env as unknown as Record<string, string>)["OPENCLAW_GSC_SITE_URL"] =
      "sc-domain:sergeant.app";
    globalThis.fetch = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        captured.push({ url: String(input), init });
        return makeResponse({
          rows: [
            {
              keys: ["a"],
              clicks: 10,
              impressions: 100,
              ctr: 0.1,
              position: 2,
            },
          ],
        });
      },
    ) as typeof globalThis.fetch;

    const result = await seoGscQuery({ dimension: "query", days: 7 });
    expect(captured[0]!.url).toContain("searchAnalytics/query");
    expect(captured[0]!.url).toContain(
      encodeURIComponent("sc-domain:sergeant.app"),
    );
    expect(result.notConfigured).toBeUndefined();
    expect(result.rows).toHaveLength(1);
    expect(result.rows![0]!.clicks).toBe(10);
  });
});

describe("seoPsiAudit", () => {
  it("returns notConfigured when API key missing", async () => {
    const result = await seoPsiAudit({ url: "https://sergeant.app" });
    expect(result.notConfigured).toBe(true);
    expect(captured).toHaveLength(0);
  });

  it("hits runPagespeed and extracts category scores", async () => {
    (env as unknown as Record<string, string>)["OPENCLAW_PSI_API_KEY"] = "k";
    globalThis.fetch = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        captured.push({ url: String(input), init });
        return makeResponse({
          lighthouseResult: {
            categories: {
              performance: { score: 0.85 },
              accessibility: { score: 0.95 },
              "best-practices": { score: 0.9 },
              seo: { score: 1.0 },
            },
          },
        });
      },
    ) as typeof globalThis.fetch;

    const result = await seoPsiAudit({
      url: "https://sergeant.app",
      strategy: "desktop",
    });
    expect(captured[0]!.url).toContain("runPagespeed");
    expect(captured[0]!.url).toContain("strategy=desktop");
    expect(result.performance).toBe(0.85);
    expect(result.accessibility).toBe(0.95);
    expect(result.bestPractices).toBe(0.9);
    expect(result.seo).toBe(1.0);
  });
});

describe("seoSerpLookup", () => {
  it("returns notConfigured when API key missing", async () => {
    const result = await seoSerpLookup({ query: "sergeant app" });
    expect(result.notConfigured).toBe(true);
    expect(captured).toHaveLength(0);
  });

  it("normalizes SerpAPI response into ranked results", async () => {
    (env as unknown as Record<string, string>)["OPENCLAW_SERP_API_KEY"] = "k";
    globalThis.fetch = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        captured.push({ url: String(input), init });
        return makeResponse({
          organic_results: [
            {
              position: 1,
              title: "Sergeant",
              link: "https://sergeant.app",
              snippet: "Co-founder bot",
            },
            { title: "Without position", link: "https://example.com" },
          ],
        });
      },
    ) as typeof globalThis.fetch;

    const result = await seoSerpLookup({ query: "sergeant app", num: 5 });
    expect(captured[0]!.url).toMatch(/serpapi\.com\/search\.json/);
    expect(result.results).toHaveLength(2);
    expect(result.results![0]!.position).toBe(1);
    expect(result.results![1]!.position).toBe(2); // fallback index-based
  });
});
