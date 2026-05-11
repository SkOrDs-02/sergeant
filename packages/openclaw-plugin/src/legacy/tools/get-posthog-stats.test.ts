import { describe, it, expect } from "vitest";
import { createGetPostHogStatsTool } from "./get-posthog-stats.js";
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

describe("createGetPostHogStatsTool", () => {
  it("forwards days to /metrics/posthog", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { signups: 12, mau: 340 } };
    });
    const tool = createGetPostHogStatsTool({ http });

    await tool.execute("inv_1", { days: 30 });
    expect(captured).toEqual({ days: 30 });
  });

  it("returns stats JSON", async () => {
    const http = makeHttp(() => ({
      body: { signups: 5, mau: 100, keyEvents: 42 },
    }));
    const tool = createGetPostHogStatsTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("signups");
    expect(textBlock.text).toContain("100");
  });
});
