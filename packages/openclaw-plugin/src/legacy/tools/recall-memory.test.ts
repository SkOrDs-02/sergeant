import { describe, it, expect } from "vitest";
import {
  createRecallMemoryTool,
  RecallMemoryParamsSchema,
} from "./recall-memory.js";
import { OpenClawHttpClient } from "./../http-client.js";

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

describe("RecallMemoryParamsSchema", () => {
  it("requires non-empty query", () => {
    expect(() => RecallMemoryParamsSchema.parse({ query: "" })).toThrow();
    expect(() =>
      RecallMemoryParamsSchema.parse({ query: "x".repeat(2001) }),
    ).toThrow();
  });

  it("clamps topK to [1, 20]", () => {
    expect(() =>
      RecallMemoryParamsSchema.parse({ query: "x", topK: 0 }),
    ).toThrow();
    expect(() =>
      RecallMemoryParamsSchema.parse({ query: "x", topK: 21 }),
    ).toThrow();
    expect(RecallMemoryParamsSchema.parse({ query: "x", topK: 5 }).topK).toBe(
      5,
    );
  });

  it("accepts optional persona filter", () => {
    expect(
      RecallMemoryParamsSchema.parse({ query: "x", persona: "eng" }).persona,
    ).toBe("eng");
  });
});

describe("createRecallMemoryTool", () => {
  it("forwards founderUserId + query + persona to /recall", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { memories: [] } };
    });
    const tool = createRecallMemoryTool({
      http,
      founderUserId: "user_X",
    });

    await tool.execute("inv_1", {
      query: "runway?",
      topK: 3,
      persona: "finance",
    });

    expect(captured).toEqual({
      founderUserId: "user_X",
      query: "runway?",
      topK: 3,
      persona: "finance",
    });
  });

  it("formats empty memories list as a friendly text block", async () => {
    const http = makeHttp(() => ({ body: { memories: [] } }));
    const tool = createRecallMemoryTool({ http, founderUserId: "u" });

    const result = await tool.execute("inv_1", { query: "q" });
    expect(result.content).toEqual([
      { type: "text", text: "(no memories matched this query)" },
    ]);
  });

  it("flags degraded results when embedding service is degraded", async () => {
    const http = makeHttp(() => ({
      body: { memories: [], degraded: true },
    }));
    const tool = createRecallMemoryTool({ http, founderUserId: "u" });

    const result = await tool.execute("inv_1", { query: "q" });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/degraded/);
  });

  it("formats memories with persona/topic/sim metadata", async () => {
    const http = makeHttp(() => ({
      body: {
        memories: [
          {
            id: 1,
            content: "decided Q3 OKR target = 100 users",
            source: "cofounder",
            persona: "cofounder",
            topic: "okr",
            similarity: 0.9123,
            createdAt: "2026-04-01T12:00:00Z",
          },
          {
            id: 2,
            content: "switched to voyage-3.5-lite embeddings",
            source: "cofounder",
            persona: "eng",
            topic: null,
            similarity: 0.876,
            createdAt: "2026-03-15T08:30:00Z",
          },
        ],
      },
    }));
    const tool = createRecallMemoryTool({ http, founderUserId: "u" });

    const result = await tool.execute("inv_1", { query: "okr" });
    const textBlock = result.content[0] as { type: "text"; text: string };
    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toMatch(/1\. \[cofounder\] <okr> \(sim=0\.912/);
    expect(textBlock.text).toMatch(/2\. \[eng\] \(sim=0\.876, 2026-03-15\)/);
    expect(textBlock.text).toMatch(/voyage-3\.5-lite/);

    const structured = result.content[1] as {
      type: "structured";
      data: { memories: Array<{ id: number }>; degraded: boolean };
    };
    expect(structured.type).toBe("structured");
    expect(structured.data.memories).toHaveLength(2);
    expect(structured.data.degraded).toBe(false);
  });

  it("surfaces HTTP errors as a tool-result text block (no throw)", async () => {
    const http = makeHttp(() => ({
      status: 403,
      body: { error: "forbidden" },
    }));
    const tool = createRecallMemoryTool({ http, founderUserId: "u" });

    const result = await tool.execute("inv_1", { query: "q" });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/HTTP 403/);
  });
});
