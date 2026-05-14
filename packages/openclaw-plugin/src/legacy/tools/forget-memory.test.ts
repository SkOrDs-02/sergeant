import { describe, it, expect } from "vitest";
import {
  createForgetMemoryTool,
  ForgetMemoryParamsSchema,
} from "./forget-memory.js";
import { OpenClawHttpClient } from "./../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (url: string, body: unknown) => { status?: number; body: unknown },
): OpenClawHttpClient {
  return new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const parsed = init?.body ? JSON.parse(String(init.body)) : {};
      const { status, body } = responder(url, parsed);
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
}

describe("ForgetMemoryParamsSchema", () => {
  it("accepts byId mode with positive memoryId", () => {
    expect(
      ForgetMemoryParamsSchema.parse({ mode: "byId", memoryId: 1 }),
    ).toEqual({ mode: "byId", memoryId: 1 });
    expect(() =>
      ForgetMemoryParamsSchema.parse({ mode: "byId", memoryId: 0 }),
    ).toThrow();
  });

  it("byTopic вимагає non-empty topic", () => {
    expect(() =>
      ForgetMemoryParamsSchema.parse({ mode: "byTopic", topic: "" }),
    ).toThrow();
    expect(
      ForgetMemoryParamsSchema.parse({ mode: "byTopic", topic: "foo" }).topic,
    ).toBe("foo");
  });

  it("since вимагає ISO 8601 формат", () => {
    expect(() =>
      ForgetMemoryParamsSchema.parse({ mode: "since", sinceDate: "yesterday" }),
    ).toThrow();
    expect(
      ForgetMemoryParamsSchema.parse({ mode: "since", sinceDate: "2025-04-01" })
        .sinceDate,
    ).toBe("2025-04-01");
  });

  it("confirm/cancel вимагають UUID", () => {
    expect(() =>
      ForgetMemoryParamsSchema.parse({ mode: "confirm", token: "x" }),
    ).toThrow();
    const uuid = "00000000-0000-0000-0000-000000000000";
    expect(
      ForgetMemoryParamsSchema.parse({ mode: "confirm", token: uuid }).token,
    ).toBe(uuid);
  });
});

describe("createForgetMemoryTool", () => {
  it("byId форвардить запит на /forget і форматує deletedCount", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | undefined;
    const http = makeHttp((url, body) => {
      capturedUrl = url;
      capturedBody = body as Record<string, unknown>;
      return {
        body: { deletedCount: 1, invocationId: 99, mode: "byId" },
      };
    });
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 12345,
    });

    const result = await tool.execute("inv_1", { mode: "byId", memoryId: 42 });

    expect(capturedUrl).toMatch(/\/forget$/);
    expect(capturedBody?.["founderUserId"]).toBe("u1");
    expect(capturedBody?.["founderTgUserId"]).toBe(12345);
    expect(capturedBody?.["memoryId"]).toBe(42);
    expect(capturedBody?.["mode"]).toBe("byId");

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/Видалено 1/);
  });

  it("previewQuery повертає structured token + matches", async () => {
    const http = makeHttp(() => ({
      body: {
        token: "00000000-0000-0000-0000-000000000001",
        matches: [
          {
            id: 1,
            content: "lorem ipsum",
            source: "cofounder",
            topic: "shared",
            similarity: 0.92,
            createdAt: "2025-04-01T12:00:00Z",
          },
        ],
        expiresAt: "2025-04-01T12:05:00Z",
      },
    }));
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 1,
    });

    const result = await tool.execute("inv_1", {
      mode: "previewQuery",
      query: "test",
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/Знайдено 1 кандидатів/);
    expect(text).toMatch(/Підтвердити/);
    expect(text).toMatch(/Скасувати/);
    const struct = result.content[1] as { type: "structured"; data: unknown };
    expect(struct.type).toBe("structured");
  });

  it("обрізає content до 80 символів у preview", async () => {
    const longContent = "x".repeat(150);
    const http = makeHttp(() => ({
      body: {
        token: "00000000-0000-0000-0000-000000000002",
        matches: [
          {
            id: 1,
            content: longContent,
            source: "cofounder",
            topic: null,
            similarity: 0.5,
            createdAt: "2025-04-01T12:00:00Z",
          },
        ],
        expiresAt: "2025-04-01T12:05:00Z",
      },
    }));
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 1,
    });
    const result = await tool.execute("inv_1", {
      mode: "previewQuery",
      query: "test",
    });
    const text = (result.content[0] as { text: string }).text;
    // Snippet truncated to 77 + "…" = 78 chars; перевіряємо що повного content немає.
    expect(text).not.toContain(longContent);
    expect(text).toMatch(/…/);
  });

  it("confirm посилає на /forget/confirm", async () => {
    let capturedUrl = "";
    const http = makeHttp((url) => {
      capturedUrl = url;
      return {
        body: { deletedCount: 3, invocationId: 100, mode: "previewQuery" },
      };
    });
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 1,
    });
    const result = await tool.execute("inv_1", {
      mode: "confirm",
      token: "00000000-0000-0000-0000-000000000003",
    });
    expect(capturedUrl).toMatch(/\/forget\/confirm$/);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/Видалено 3/);
  });

  it("cancel посилає на /forget/cancel", async () => {
    let capturedUrl = "";
    const http = makeHttp((url) => {
      capturedUrl = url;
      return { body: { cancelled: true } };
    });
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 1,
    });
    const result = await tool.execute("inv_1", {
      mode: "cancel",
      token: "00000000-0000-0000-0000-000000000004",
    });
    expect(capturedUrl).toMatch(/\/forget\/cancel$/);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/скасовано/);
  });

  it("rate-limit → 429 → friendly error message", async () => {
    const http = makeHttp(() => ({
      status: 429,
      body: { error: "rate_limited", retryAfterSec: 300 },
    }));
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 1,
    });
    const result = await tool.execute("inv_1", { mode: "byId", memoryId: 1 });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/Rate-limit/);
  });

  it("token expired → 410 → friendly error message", async () => {
    const http = makeHttp(() => ({
      status: 410,
      body: { error: "token_invalid", reason: "expired" },
    }));
    const tool = createForgetMemoryTool({
      http,
      founderUserId: "u1",
      founderTgUserId: 1,
    });
    const result = await tool.execute("inv_1", {
      mode: "confirm",
      token: "00000000-0000-0000-0000-000000000005",
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/Token expired/i);
  });
});
