import { describe, it, expect } from "vitest";
import { createRecordDecisionTool } from "./record-decision.js";
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

describe("createRecordDecisionTool", () => {
  it("forwards all params + founderUserId to /decision", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { id: 42, createdAt: "2026-05-10T12:00:00Z" } };
    });
    const tool = createRecordDecisionTool({
      http,
      founderUserId: "user_founder",
    });

    await tool.execute("inv_1", {
      topic: "OpenClaw migration",
      context: "Need to replace grammy bot",
      decision: "Use OpenClaw Gateway",
      rationale: "More channels, better UX",
      alternatives: "Keep grammy, build custom",
    });

    expect(captured).toEqual({
      founderUserId: "user_founder",
      topic: "OpenClaw migration",
      context: "Need to replace grammy bot",
      decision: "Use OpenClaw Gateway",
      rationale: "More channels, better UX",
      alternatives: "Keep grammy, build custom",
      metadata: undefined,
    });
  });

  it("returns success message with id", async () => {
    const http = makeHttp(() => ({
      body: { id: 99, createdAt: "2026-05-10T15:30:00Z" },
    }));
    const tool = createRecordDecisionTool({
      http,
      founderUserId: "user_x",
    });

    const result = await tool.execute("inv_1", {
      topic: "Test decision",
      context: "Context",
      decision: "Decision",
      rationale: "Rationale",
    });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("Decision recorded");
    expect(textBlock.text).toContain("id=99");
  });
});
