import { describe, it, expect } from "vitest";
import {
  createQueryAppDbTool,
  QueryAppDbParamsSchema,
} from "./query-app-db.js";
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

describe("QueryAppDbParamsSchema", () => {
  it("requires non-empty sql", () => {
    expect(() => QueryAppDbParamsSchema.parse({ sql: "" })).toThrow();
  });

  it("accepts valid sql with params", () => {
    const result = QueryAppDbParamsSchema.parse({
      sql: "SELECT * FROM users WHERE id = $1",
      params: ["user_1"],
      limit: 10,
    });
    expect(result.sql).toContain("SELECT");
    expect(result.params).toEqual(["user_1"]);
  });
});

describe("createQueryAppDbTool", () => {
  it("forwards sql, params, limit to /query", async () => {
    let captured: unknown = null;
    const http = makeHttp((body) => {
      captured = body;
      return { body: { rows: [], rowCount: 0, truncated: false } };
    });
    const tool = createQueryAppDbTool({ http });

    await tool.execute("inv_1", {
      sql: "SELECT count(*) FROM users",
      params: [],
      limit: 50,
    });
    expect(captured).toEqual({
      sql: "SELECT count(*) FROM users",
      params: [],
      limit: 50,
    });
  });

  it("formats rows as JSON", async () => {
    const http = makeHttp(() => ({
      body: {
        rows: [{ id: 1, name: "Alice" }],
        rowCount: 1,
        truncated: false,
      },
    }));
    const tool = createQueryAppDbTool({ http });

    const result = await tool.execute("inv_1", { sql: "SELECT * FROM users" });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.type).toBe("text");
    expect(textBlock.text).toContain("Alice");
  });

  it("indicates truncation", async () => {
    const http = makeHttp(() => ({
      body: {
        rows: [{ id: 1 }],
        rowCount: 500,
        truncated: true,
      },
    }));
    const tool = createQueryAppDbTool({ http });

    const result = await tool.execute("inv_1", { sql: "SELECT * FROM users" });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("truncated");
  });

  it("handles allowlist failure", async () => {
    const http = makeHttp(() => ({
      status: 400,
      body: { error: "allowlist_fail", message: "table not allowed" },
    }));
    const tool = createQueryAppDbTool({ http });

    const result = await tool.execute("inv_1", {
      sql: "SELECT * FROM secrets",
    });
    const textBlock = result.content[0] as { type: string; text: string };
    expect(textBlock.text).toContain("rejected");
  });
});
