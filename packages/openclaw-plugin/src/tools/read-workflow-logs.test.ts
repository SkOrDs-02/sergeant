import { describe, it, expect } from "vitest";
import { createReadWorkflowLogsTool } from "./read-workflow-logs.js";
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

describe("createReadWorkflowLogsTool", () => {
  it("forwards workflowId, since, limit to /workflow", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { executions: [] } };
    });
    const tool = createReadWorkflowLogsTool({ http });

    await tool.execute("inv_1", {
      workflowId: "OhDtiheODIp5nNLa",
      since: "2026-05-10T00:00:00Z",
      limit: 5,
    });
    expect(captured).toEqual({
      workflowId: "OhDtiheODIp5nNLa",
      since: "2026-05-10T00:00:00Z",
      limit: 5,
    });
  });

  it("formats executions list", async () => {
    const http = makeHttp(() => ({
      body: {
        executions: [
          {
            id: "ex1",
            status: "success",
            startedAt: "2026-05-10T08:00:00Z",
            finishedAt: "2026-05-10T08:01:00Z",
          },
        ],
      },
    }));
    const tool = createReadWorkflowLogsTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "abc" });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("success");
  });

  it("handles empty executions", async () => {
    const http = makeHttp(() => ({ body: { executions: [] } }));
    const tool = createReadWorkflowLogsTool({ http });

    const result = await tool.execute("inv_1", { workflowId: "abc" });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("no executions");
  });
});
