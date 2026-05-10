import { describe, it, expect } from "vitest";
import {
  createReadStrategyDocsTool,
  ReadStrategyDocsParamsSchema,
} from "./read-strategy-docs.js";
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

describe("ReadStrategyDocsParamsSchema", () => {
  it("requires non-empty path", () => {
    expect(() => ReadStrategyDocsParamsSchema.parse({ path: "" })).toThrow();
  });

  it("accepts valid path", () => {
    const result = ReadStrategyDocsParamsSchema.parse({
      path: "docs/adr/0031-openclaw-v0-telegram-cofounder.md",
    });
    expect(result.path).toBe("docs/adr/0031-openclaw-v0-telegram-cofounder.md");
  });
});

describe("createReadStrategyDocsTool", () => {
  it("forwards path to /strategy", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { content: "# Test", path: "docs/test.md" } };
    });
    const tool = createReadStrategyDocsTool({ http });

    await tool.execute("inv_1", { path: "docs/test.md" });
    expect(captured).toEqual({ path: "docs/test.md" });
  });

  it("returns content in text block", async () => {
    const http = makeHttp(() => ({
      body: { content: "# Hello World", path: "docs/hello.md" },
    }));
    const tool = createReadStrategyDocsTool({ http });

    const result = await tool.execute("inv_1", { path: "docs/hello.md" });
    expect(result.content[0]).toEqual({
      type: "text",
      text: "# Hello World",
    });
  });

  it("handles 404 gracefully", async () => {
    const http = makeHttp(() => ({
      status: 404,
      body: { error: "not_found", message: "file not found" },
    }));
    const tool = createReadStrategyDocsTool({ http });

    const result = await tool.execute("inv_1", { path: "docs/missing.md" });
    expect(result.content[0]!.type).toBe("text");
    expect((result.content[0] as { text: string }).text).toContain("not found");
  });
});
