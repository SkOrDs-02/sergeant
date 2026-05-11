import { describe, it, expect } from "vitest";
import { createN8nListTool } from "./n8n-list.js";
import { OpenClawHttpClient } from "../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown) => { status?: number; body: unknown },
): { http: OpenClawHttpClient; lastPath: () => string | null } {
  let lastPath: string | null = null;
  const http = new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      lastPath = String(input);
      const parsed = JSON.parse(String(init?.body));
      const { status, body } = responder(parsed);
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
  return { http, lastPath: () => lastPath };
}

describe("createN8nListTool", () => {
  it("forwards tiers + limit to /n8n/list", async () => {
    let captured: unknown = null;
    const { http, lastPath } = makeHttp((body) => {
      captured = body;
      return { body: { workflows: [] } };
    });
    const tool = createN8nListTool({ http });

    await tool.execute("inv_1", { tiers: ["A", "C"], limit: 50 });

    expect(captured).toEqual({ tiers: ["A", "C"], limit: 50 });
    expect(lastPath()).toContain("/api/internal/openclaw/n8n/list");
  });

  it("omits optional fields when not provided", async () => {
    let captured: unknown = null;
    const { http } = makeHttp((body) => {
      captured = body;
      return { body: { workflows: [] } };
    });
    const tool = createN8nListTool({ http });

    await tool.execute("inv_1", {});

    expect(captured).toEqual({});
  });

  it("renders a tier-prefixed line per workflow", async () => {
    const { http } = makeHttp(() => ({
      body: {
        workflows: [
          {
            id: "WF_A1",
            name: "Growth Acq",
            active: true,
            tier: "A",
            category: "growth",
            updatedAt: null,
          },
          {
            id: "WF_C1",
            name: "Approve Refund",
            active: false,
            tier: "C",
            category: null,
            updatedAt: null,
          },
        ],
      },
    }));
    const tool = createN8nListTool({ http });

    const result = await tool.execute("inv_1", {});
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("[A] ON  WF_A1 — Growth Acq [growth]");
    expect(text).toContain("[C] OFF WF_C1 — Approve Refund");
  });

  it("flags notConfigured environment with a friendly message", async () => {
    const { http } = makeHttp(() => ({
      body: { workflows: [], notConfigured: true },
    }));
    const tool = createN8nListTool({ http });

    const result = await tool.execute("inv_1", {});
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("n8n is not configured");
  });

  it("formats HTTP errors gracefully", async () => {
    const { http } = makeHttp(() => ({
      status: 500,
      body: { error: "boom" },
    }));
    const tool = createN8nListTool({ http });

    const result = await tool.execute("inv_1", {});
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("n8n_list failed");
    expect(text).toContain("500");
  });
});
