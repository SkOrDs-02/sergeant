import { describe, it, expect } from "vitest";
import { createN8nActivateTool } from "./n8n-activate.js";
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

describe("createN8nActivateTool", () => {
  it("forwards workflowId + active flag to /n8n/activate", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return {
        body: {
          status: "activated",
          workflowId: "WF_A1",
          tier: "A",
          approvalRequired: true,
        },
      };
    });
    const tool = createN8nActivateTool({ http });

    await tool.execute("inv_1", { workflowId: "WF_A1", active: true });

    expect(captured).toEqual({ workflowId: "WF_A1", active: true });
  });

  it("renders deactivated status", async () => {
    const http = makeHttp(() => ({
      body: {
        status: "deactivated",
        workflowId: "WF_C1",
        tier: "C",
        approvalRequired: true,
      },
    }));
    const tool = createN8nActivateTool({ http });

    const result = await tool.execute("inv_1", {
      workflowId: "WF_C1",
      active: false,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("deactivated");
    expect(text).toContain("Tier C");
  });

  it("parses allowlist_fail body into a structured refusal", async () => {
    const http = makeHttp(() => ({
      status: 400,
      body: {
        error: "allowlist_fail",
        op: "activate",
        workflowId: "WF_D1",
        tier: "D",
        message: "Tier D not eligible",
      },
    }));
    const tool = createN8nActivateTool({ http });

    const result = await tool.execute("inv_1", {
      workflowId: "WF_D1",
      active: true,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("refused");
    expect(text).toContain("Tier D");

    const structured = result.content[1] as {
      type: string;
      data: { op: string };
    };
    expect(structured.data.op).toBe("activate");
  });

  it("renders generic HTTP failure", async () => {
    const http = makeHttp(() => ({
      status: 502,
      body: { error: "bad_gateway" },
    }));
    const tool = createN8nActivateTool({ http });

    const result = await tool.execute("inv_1", {
      workflowId: "WF_A1",
      active: true,
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("n8n_activate failed");
    expect(text).toContain("502");
  });
});
