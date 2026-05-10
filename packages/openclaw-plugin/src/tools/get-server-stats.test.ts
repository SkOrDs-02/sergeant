import { describe, it, expect } from "vitest";
import { createGetServerStatsTool } from "./get-server-stats.js";
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

describe("createGetServerStatsTool", () => {
  it("sends empty body to /metrics/server", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { uptime: 3600, memoryMb: 120 } };
    });
    const tool = createGetServerStatsTool({ http });

    await tool.execute("inv_1", {});
    expect(captured).toEqual({});
  });

  it("returns server stats as JSON", async () => {
    const http = makeHttp(() => ({
      body: { uptime: 7200, memoryMb: 256, cpuPercent: 12 },
    }));
    const tool = createGetServerStatsTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("7200");
    expect(textBlock.text).toContain("256");
  });
});
