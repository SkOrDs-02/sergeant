import { describe, it, expect } from "vitest";
import {
  createSetReminderTool,
  SetReminderParamsSchema,
} from "./set-reminder.js";
import { OpenClawHttpClient } from "../http-client.js";

const API_KEY = "x".repeat(32);

function makeHttp(
  responder: (body: unknown) => { status?: number; body: unknown },
): { http: OpenClawHttpClient; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const http = new OpenClawHttpClient({
    baseUrl: "http://x",
    apiKey: API_KEY,
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      calls.push({ url, body });
      const { status, body: respBody } = responder(body);
      return Promise.resolve(
        new Response(JSON.stringify(respBody), { status: status ?? 200 }),
      );
    }) as typeof globalThis.fetch,
  });
  return { http, calls };
}

describe("SetReminderParamsSchema", () => {
  it("requires reminderText and dueAtIso", () => {
    expect(() => SetReminderParamsSchema.parse({})).toThrow();
    expect(() =>
      SetReminderParamsSchema.parse({ reminderText: "x" }),
    ).toThrow();
  });

  it("accepts optional persona/topic/channel/metadata", () => {
    const parsed = SetReminderParamsSchema.parse({
      reminderText: "review investor deck",
      dueAtIso: "2026-05-15T09:00:00+03:00",
      persona: "cofounder",
      topic: "investor-update",
      channel: "telegram",
      metadata: { tag: "qa" },
    });
    expect(parsed.persona).toBe("cofounder");
    expect(parsed.channel).toBe("telegram");
  });
});

describe("createSetReminderTool", () => {
  it("injects founderUserId from closure", async () => {
    const { http, calls } = makeHttp(() => ({
      body: {
        reminder: {
          id: 42,
          founderUserId: "u_1",
          persona: "cofounder",
          topic: null,
          reminderText: "x",
          dueAt: "2026-05-15T09:00:00.000Z",
          status: "pending",
          channel: "telegram",
          attempts: 0,
          metadata: {},
        },
      },
    }));
    const tool = createSetReminderTool({ http, founderUserId: "u_1" });
    await tool.execute("inv_1", {
      reminderText: "x",
      dueAtIso: "2026-05-15T09:00:00+03:00",
    });
    expect(calls[0]!.url).toMatch(/\/api\/internal\/openclaw\/reminders\/set/);
    expect((calls[0]!.body as { founderUserId: string }).founderUserId).toBe(
      "u_1",
    );
  });

  it("formats success", async () => {
    const { http } = makeHttp(() => ({
      body: {
        reminder: {
          id: 7,
          founderUserId: "u_1",
          persona: "cofounder",
          topic: null,
          reminderText: "x",
          dueAt: "2026-05-15T09:00:00.000Z",
          status: "pending",
          channel: "telegram",
          attempts: 0,
          metadata: {},
        },
      },
    }));
    const tool = createSetReminderTool({ http, founderUserId: "u_1" });
    const result = await tool.execute("inv_1", {
      reminderText: "x",
      dueAtIso: "2026-05-15T09:00:00+03:00",
    });
    const text = result.content[0] as { type: string; text: string };
    expect(text.text).toContain("reminder #7 scheduled");
  });
});
