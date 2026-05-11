import { describe, it, expect } from "vitest";
import {
  createSeoPsiAuditTool,
  SeoPsiAuditParamsSchema,
} from "./seo-psi-audit.js";
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

describe("SeoPsiAuditParamsSchema", () => {
  it("requires url (URL format)", () => {
    expect(() => SeoPsiAuditParamsSchema.parse({})).toThrow();
    expect(() => SeoPsiAuditParamsSchema.parse({ url: "not-a-url" })).toThrow();
  });
});

describe("createSeoPsiAuditTool", () => {
  it("reports not_configured", async () => {
    const { http } = makeHttp(() => ({
      body: {
        notConfigured: true,
        missing: ["OPENCLAW_PSI_API_KEY"],
      },
    }));
    const tool = createSeoPsiAuditTool({ http });
    const result = await tool.execute("inv_1", {
      url: "https://sergeant.app",
    });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("not configured");
  });

  it("returns score summary", async () => {
    const { http } = makeHttp(() => ({
      body: {
        url: "https://sergeant.app",
        strategy: "mobile",
        performance: 0.85,
        accessibility: 0.95,
        bestPractices: 0.9,
        seo: 1.0,
        fetchedAt: "2026-05-10T22:00:00Z",
      },
    }));
    const tool = createSeoPsiAuditTool({ http });
    const result = await tool.execute("inv_1", {
      url: "https://sergeant.app",
    });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("strategy=mobile");
    expect(text.text).toContain("perf=0.85");
  });
});
