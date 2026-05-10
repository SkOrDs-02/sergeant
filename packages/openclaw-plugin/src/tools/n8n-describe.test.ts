import { describe, it, expect } from "vitest";
import { createN8nDescribeTool } from "./n8n-describe.js";
import { OpenClawHttpClient } from "../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown) => { status?: number; body: unknown },
): OpenClawHttpClient {
  return new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body));
      const { status, body } = responder(parsed);
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
}

describe("createN8nDescribeTool", () => {
  it("forwards workflowId to /n8n/describe", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return {
        body: {
          workflowId: "WF_A1",
          name: "Growth Acq",
          active: true,
          tier: "A",
          category: "growth",
          approvalRequired: false,
          nodes: [],
          triggers: [],
          updatedAt: null,
        },
      };
    });
    const tool = createN8nDescribeTool({ http });

    await tool.execute("inv_1", { workflowId: "WF_A1" });

    expect(captured).toEqual({ workflowId: "WF_A1" });
  });

  it("formats tier + approval + node count", async () => {
    const http = makeHttp(() => ({
      body: {
        workflowId: "WF_C1",
        name: "Approve Refund",
        active: true,
        tier: "C",
        category: null,
        approvalRequired: true,
        nodes: [
          { name: "Start", type: "n8n-nodes-base.start", disabled: false },
          {
            name: "Webhook",
            type: "n8n-nodes-base.webhook",
            disabled: false,
          },
        ],
        triggers: ["n8n-nodes-base.webhook"],
        updatedAt: "2026-04-01T00:00:00Z",
      },
    }));
    const tool = createN8nDescribeTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_C1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Tier C");
    expect(text).toContain("approvalRequired=true");
    expect(text).toContain("triggers: n8n-nodes-base.webhook");
    expect(text).toContain("nodes: 2");
  });

  it("annotates notConfigured environments", async () => {
    const http = makeHttp(() => ({
      body: {
        workflowId: "WF_A1",
        name: null,
        active: null,
        tier: "A",
        category: "growth",
        approvalRequired: false,
        nodes: [],
        triggers: [],
        updatedAt: null,
        notConfigured: true,
      },
    }));
    const tool = createN8nDescribeTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_A1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("n8n not configured");
    expect(text).toContain("active=?");
  });
});
