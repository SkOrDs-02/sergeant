import { describe, it, expect } from "vitest";
import { createN8nTriggerTool } from "./n8n-trigger.js";
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

describe("createN8nTriggerTool", () => {
  it("forwards workflowId to /n8n/trigger and renders triggered status", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return {
        body: {
          status: "triggered",
          workflowId: "WF_A1",
          tier: "A",
          approvalRequired: false,
          executionId: "42",
        },
      };
    });
    const tool = createN8nTriggerTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_A1" });

    expect(captured).toEqual({ workflowId: "WF_A1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("Tier A");
    expect(text).toContain("execution 42");
  });

  it("surfaces Tier C approvalRequired in the text", async () => {
    const http = makeHttp(() => ({
      body: {
        status: "triggered",
        workflowId: "WF_C1",
        tier: "C",
        approvalRequired: true,
        executionId: "55",
      },
    }));
    const tool = createN8nTriggerTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_C1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("approval was required");
  });

  it("renders not_configured status with note", async () => {
    const http = makeHttp(() => ({
      body: {
        status: "not_configured",
        workflowId: "WF_A1",
        tier: "A",
        approvalRequired: false,
        note: "N8N_API_URL missing",
      },
    }));
    const tool = createN8nTriggerTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_A1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("skipped");
    expect(text).toContain("N8N_API_URL missing");
  });

  it("parses allowlist_fail body into a structured refusal", async () => {
    const http = makeHttp(() => ({
      status: 400,
      body: {
        error: "allowlist_fail",
        op: "trigger",
        workflowId: "WF_B1",
        tier: "B",
        message: "Tier B not triggerable",
      },
    }));
    const tool = createN8nTriggerTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_B1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("refused");
    expect(text).toContain("Tier B");
    expect(text).toContain("Tier B not triggerable");

    const structured = result.content[1] as {
      type: string;
      data: { error: string; tier: string };
    };
    expect(structured.data.error).toBe("allowlist_fail");
    expect(structured.data.tier).toBe("B");
  });

  it("falls back to generic HTTP error for non-allowlist failures", async () => {
    const http = makeHttp(() => ({
      status: 500,
      body: { error: "boom" },
    }));
    const tool = createN8nTriggerTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "WF_A1" });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("n8n_trigger failed");
    expect(text).toContain("500");
  });
});
