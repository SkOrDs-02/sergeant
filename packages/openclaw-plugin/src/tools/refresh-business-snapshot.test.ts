import { describe, it, expect } from "vitest";
import { createRefreshBusinessSnapshotTool } from "./refresh-business-snapshot.js";
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

describe("createRefreshBusinessSnapshotTool", () => {
  it("omits workflowIds when not provided and hits /snapshot/refresh", async () => {
    let captured: unknown = null;
    const { http, lastPath } = makeHttp((body) => {
      captured = body;
      return {
        body: {
          triggered: 0,
          failed: 0,
          notConfigured: false,
          durationMs: 1,
          results: [],
        },
      };
    });
    const tool = createRefreshBusinessSnapshotTool({ http });

    await tool.execute("inv_1", {});

    expect(captured).toEqual({});
    expect(lastPath()).toContain("/api/internal/openclaw/snapshot/refresh");
  });

  it("forwards an explicit subset", async () => {
    let captured: unknown = null;
    const { http } = makeHttp((body) => {
      captured = body;
      return {
        body: {
          triggered: 1,
          failed: 0,
          notConfigured: false,
          durationMs: 4,
          results: [
            {
              workflowId: "WF_A1",
              name: "Growth Acq",
              status: "triggered",
            },
          ],
        },
      };
    });
    const tool = createRefreshBusinessSnapshotTool({ http });

    await tool.execute("inv_1", { workflowIds: ["WF_A1"] });

    expect(captured).toEqual({ workflowIds: ["WF_A1"] });
  });

  it("renders triggered + failed counts and per-workflow markers", async () => {
    const { http } = makeHttp(() => ({
      body: {
        triggered: 2,
        failed: 1,
        notConfigured: false,
        durationMs: 123,
        results: [
          {
            workflowId: "WF_A1",
            name: "Growth Acq",
            status: "triggered",
            executionId: "1",
          },
          { workflowId: "WF_A2", name: "Heartbeat", status: "triggered" },
          {
            workflowId: "WF_A3",
            name: "Funnel",
            status: "error",
            note: "boom",
          },
        ],
      },
    }));
    const tool = createRefreshBusinessSnapshotTool({ http });

    const result = await tool.execute("inv_1", {});
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("2 triggered, 1 failed (123ms)");
    expect(text).toContain("✓ WF_A1 — Growth Acq (triggered)");
    expect(text).toContain("✗ WF_A3 — Funnel (error: boom)");
  });

  it("flags notConfigured environments", async () => {
    const { http } = makeHttp(() => ({
      body: {
        triggered: 0,
        failed: 0,
        notConfigured: true,
        durationMs: 0,
        results: [],
      },
    }));
    const tool = createRefreshBusinessSnapshotTool({ http });

    const result = await tool.execute("inv_1", {});
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("n8n not configured");
  });
});
