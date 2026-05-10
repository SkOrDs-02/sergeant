import { describe, it, expect } from "vitest";
import { createReadTelegramTopicTool } from "./read-telegram-topic.js";
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

describe("createReadTelegramTopicTool", () => {
  it("forwards topic, since, limit to /telegram", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { messages: [] } };
    });
    const tool = createReadTelegramTopicTool({ http });

    await tool.execute("inv_1", {
      topic: "metrics",
      since: "2026-05-10T00:00:00Z",
      limit: 20,
    });
    expect(captured).toEqual({
      topic: "metrics",
      since: "2026-05-10T00:00:00Z",
      limit: 20,
    });
  });

  it("formats messages", async () => {
    const http = makeHttp(() => ({
      body: {
        messages: [
          {
            id: 1,
            text: "Revenue: $500",
            date: "2026-05-10T09:00:00Z",
            from: "n8n",
          },
        ],
      },
    }));
    const tool = createReadTelegramTopicTool({ http });

    const result = await tool.execute("inv_1", { topic: "metrics" });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("Revenue: $500");
    expect(textBlock.text).toContain("n8n");
  });

  it("handles empty messages", async () => {
    const http = makeHttp(() => ({ body: { messages: [] } }));
    const tool = createReadTelegramTopicTool({ http });

    const result = await tool.execute("inv_1", { topic: "metrics" });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("no messages");
  });
});
