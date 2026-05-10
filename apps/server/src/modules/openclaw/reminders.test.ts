import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { setReminder, ReminderValidationError } from "./reminders.js";

interface FakeQuery {
  text: string;
  params: ReadonlyArray<unknown> | undefined;
}

function makePool(rows: unknown[] = []): {
  pool: Pool;
  queries: FakeQuery[];
} {
  const queries: FakeQuery[] = [];
  const pool = {
    async query(text: string, params?: ReadonlyArray<unknown>) {
      queries.push({ text, params });
      return { rows, rowCount: rows.length };
    },
  } as unknown as Pool;
  return { pool, queries };
}

const FAKE_ROW = {
  id: "1",
  founder_user_id: "u_1",
  persona: "cofounder",
  topic: null,
  reminder_text: "review investor deck",
  due_at: new Date("2026-05-15T09:00:00Z"),
  status: "pending" as const,
  source_invocation_id: null,
  channel: "telegram" as const,
  attempts: 0,
  last_attempted_at: null,
  sent_at: null,
  cancelled_at: null,
  metadata: {},
  created_at: new Date("2026-05-10T00:00:00Z"),
  updated_at: new Date("2026-05-10T00:00:00Z"),
};

describe("setReminder", () => {
  it("INSERT-and-RETURNING with normalised payload", async () => {
    const { pool, queries } = makePool([FAKE_ROW]);
    const rec = await setReminder(pool, {
      founderUserId: "u_1",
      reminderText: "review investor deck",
      dueAtIso: "2026-05-15T09:00:00.000Z",
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]!.text).toMatch(/INSERT INTO openclaw_reminders/);
    // BIGINT id → number coercion (Hard Rule #1).
    expect(rec.id).toBe(1);
    expect(rec.founderUserId).toBe("u_1");
    expect(rec.status).toBe("pending");
    expect(rec.dueAt).toBe("2026-05-15T09:00:00.000Z");
  });

  it("rejects an invalid dueAtIso with ReminderValidationError", async () => {
    const { pool } = makePool([]);
    await expect(
      setReminder(pool, {
        founderUserId: "u_1",
        reminderText: "x",
        dueAtIso: "not-a-date",
      }),
    ).rejects.toThrow(ReminderValidationError);
  });

  it("forwards optional persona/topic/channel/metadata", async () => {
    const { pool, queries } = makePool([
      { ...FAKE_ROW, persona: "finance", topic: "okr", channel: "whatsapp" },
    ]);
    await setReminder(pool, {
      founderUserId: "u_1",
      reminderText: "x",
      dueAtIso: "2026-05-15T09:00:00.000Z",
      persona: "finance",
      topic: "okr",
      channel: "whatsapp",
      metadata: { tag: "qa" },
    });
    const params = queries[0]!.params!;
    expect(params[1]).toBe("finance");
    expect(params[2]).toBe("okr");
    expect(params[6]).toBe("whatsapp");
    expect(params[7]).toBe(JSON.stringify({ tag: "qa" }));
  });
});
