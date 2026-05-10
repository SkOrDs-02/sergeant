import { describe, it, expect } from "vitest";
import { createGetStripeMetricsTool } from "./get-stripe-metrics.js";
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

describe("createGetStripeMetricsTool", () => {
  it("forwards days param to /metrics/stripe", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { revenue: 1200, failedPayments: 0, refunds: 1 } };
    });
    const tool = createGetStripeMetricsTool({ http });

    await tool.execute("inv_1", { days: 7 });
    expect(captured).toEqual({ days: 7 });
  });

  it("returns metrics as JSON", async () => {
    const http = makeHttp(() => ({
      body: { revenue: 5000, failedPayments: 2, refunds: 0 },
    }));
    const tool = createGetStripeMetricsTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("5000");
  });
});
