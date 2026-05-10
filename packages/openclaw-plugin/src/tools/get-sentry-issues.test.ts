import { describe, it, expect } from "vitest";
import { createGetSentryIssuesTool } from "./get-sentry-issues.js";
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

describe("createGetSentryIssuesTool", () => {
  it("forwards level and limit to /metrics/sentry", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { issues: [] } };
    });
    const tool = createGetSentryIssuesTool({ http });

    await tool.execute("inv_1", { level: "error", limit: 10 });
    expect(captured).toEqual({ level: "error", limit: 10 });
  });

  it("formats issues list", async () => {
    const http = makeHttp(() => ({
      body: {
        issues: [
          {
            id: "1",
            title: "TypeError",
            level: "error",
            count: 42,
            lastSeen: "2026-05-10T12:00:00Z",
          },
        ],
      },
    }));
    const tool = createGetSentryIssuesTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("TypeError");
    expect(textBlock.text).toContain("×42");
  });

  it("handles empty issues", async () => {
    const http = makeHttp(() => ({ body: { issues: [] } }));
    const tool = createGetSentryIssuesTool({ http });

    const result = await tool.execute("inv_1", {});
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("no unresolved");
  });
});
