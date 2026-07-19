import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  claimDueReminders,
  listDueReminders,
  listFounderReminders,
  markReminderCancelled,
  markReminderFailed,
  markReminderSent,
  setReminder,
  ReminderValidationError,
} from "./reminders.js";

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

  it("throws if INSERT…RETURNING produced no rows", async () => {
    const { pool } = makePool([]);
    await expect(
      setReminder(pool, {
        founderUserId: "u_1",
        reminderText: "x",
        dueAtIso: "2026-05-15T09:00:00.000Z",
      }),
    ).rejects.toThrow(/setReminder: INSERT RETURNING returned no rows/);
  });

  it("defaults a blank/whitespace-only persona to 'cofounder'", async () => {
    const { pool, queries } = makePool([FAKE_ROW]);
    await setReminder(pool, {
      founderUserId: "u_1",
      reminderText: "x",
      dueAtIso: "2026-05-15T09:00:00.000Z",
      persona: "   ",
    });
    expect(queries[0]!.params![1]).toBe("cofounder");
  });
});

describe("listDueReminders", () => {
  it("SELECTs pending reminders due at-or-before now, clamping limit", async () => {
    const { pool, queries } = makePool([FAKE_ROW]);
    const out = await listDueReminders(pool, { limit: 9_999 });
    expect(queries[0]!.text).toMatch(/FROM openclaw_reminders/);
    expect(queries[0]!.text).toMatch(/WHERE status = 'pending'/);
    expect(queries[0]!.text).toMatch(/ORDER BY due_at ASC/);
    expect(queries[0]!.params![1]).toBe(200);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(1);
  });

  it("defaults limit to 50 and now to current time when unspecified", async () => {
    const { pool, queries } = makePool([]);
    await listDueReminders(pool);
    expect(queries[0]!.params![1]).toBe(50);
    expect(typeof queries[0]!.params![0]).toBe("string");
  });

  it("uses a caller-supplied nowIso override (for deterministic tests)", async () => {
    const { pool, queries } = makePool([]);
    await listDueReminders(pool, { nowIso: "2026-06-01T00:00:00.000Z" });
    expect(queries[0]!.params![0]).toBe("2026-06-01T00:00:00.000Z");
  });

  it("clamps limit to at least 1", async () => {
    const { pool, queries } = makePool([]);
    await listDueReminders(pool, { limit: -5 });
    expect(queries[0]!.params![1]).toBe(1);
  });
});

// ─── claimDueReminders (transactional, needs pool.connect()) ─────────────

function makeTxPool(
  selectedRows: { id: string }[],
  updatedRows: unknown[] = [],
): {
  pool: Pool;
  client: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  queries: string[];
} {
  const queries: string[] = [];
  let selectCalled = false;
  const client = {
    query: vi.fn(async (text: string) => {
      queries.push(text);
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT id/.test(text)) {
        selectCalled = true;
        return { rows: selectedRows, rowCount: selectedRows.length };
      }
      if (/UPDATE openclaw_reminders/.test(text)) {
        if (!selectCalled) throw new Error("UPDATE called before SELECT");
        return { rows: updatedRows, rowCount: updatedRows.length };
      }
      throw new Error(`unexpected query: ${text}`);
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(
      async (): Promise<PoolClient> => client as unknown as PoolClient,
    ),
  } as unknown as Pool;
  return { pool, client, queries };
}

describe("claimDueReminders", () => {
  it("returns [] and commits without an UPDATE when nothing is due", async () => {
    const { pool, client, queries } = makeTxPool([]);
    const out = await claimDueReminders(pool);
    expect(out).toEqual([]);
    expect(queries).toEqual([
      "BEGIN",
      expect.stringMatching(/SELECT id/),
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("claims due reminders via FOR UPDATE SKIP LOCKED then bumps attempts", async () => {
    const { pool, client } = makeTxPool(
      [{ id: "1" }, { id: "2" }],
      [
        { ...FAKE_ROW, id: "1", attempts: 1 },
        { ...FAKE_ROW, id: "2", attempts: 1 },
      ],
    );
    const out = await claimDueReminders(pool, { limit: 5 });
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe(1);
    expect(out[1]!.id).toBe(2);
    const selectCall = client.query.mock.calls.find((c) =>
      /SELECT id/.test(c[0] as string),
    );
    expect(selectCall?.[0]).toMatch(/FOR UPDATE SKIP LOCKED/);
    const updateCall = client.query.mock.calls.find((c) =>
      /UPDATE openclaw_reminders/.test(c[0] as string),
    );
    expect(updateCall?.[0]).toMatch(/attempts\s+= attempts \+ 1/);
  });

  it("rolls back and rethrows if the UPDATE step fails", async () => {
    const { pool, client } = makeTxPool([{ id: "1" }]);
    client.query.mockImplementation(async (text: string) => {
      if (text === "BEGIN") return { rows: [], rowCount: 0 };
      if (/SELECT id/.test(text)) return { rows: [{ id: "1" }], rowCount: 1 };
      if (/UPDATE openclaw_reminders/.test(text)) {
        throw new Error("db exploded");
      }
      if (text === "ROLLBACK") return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    await expect(claimDueReminders(pool)).rejects.toThrow(/db exploded/);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the client even when SELECT itself throws", async () => {
    const { pool, client } = makeTxPool([]);
    client.query.mockImplementation(async (text: string) => {
      if (text === "BEGIN") return { rows: [], rowCount: 0 };
      if (/SELECT id/.test(text)) throw new Error("select failed");
      return { rows: [], rowCount: 0 };
    });
    await expect(claimDueReminders(pool)).rejects.toThrow(/select failed/);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

// ─── State transitions ────────────────────────────────────────────────

describe("markReminderSent", () => {
  it("UPDATEs status='sent' and returns the mapped row", async () => {
    const { pool, queries } = makePool([{ ...FAKE_ROW, status: "sent" }]);
    const rec = await markReminderSent(pool, 1);
    expect(queries[0]!.text).toMatch(/SET\s+status\s+= 'sent'/);
    expect(queries[0]!.text).toMatch(/AND status = 'pending'/);
    expect(queries[0]!.params).toEqual([1]);
    expect(rec?.status).toBe("sent");
  });

  it("returns null when no pending row matched (already sent/cancelled)", async () => {
    const { pool } = makePool([]);
    const rec = await markReminderSent(pool, 999);
    expect(rec).toBeNull();
  });
});

describe("markReminderFailed", () => {
  it("UPDATEs status='failed' with a failure_reason and default 'unknown'", async () => {
    const { pool, queries } = makePool([{ ...FAKE_ROW, status: "failed" }]);
    const rec = await markReminderFailed(pool, 1);
    expect(queries[0]!.text).toMatch(/SET\s+status\s+= 'failed'/);
    expect(queries[0]!.params).toEqual([1, "unknown"]);
    expect(rec?.status).toBe("failed");
  });

  it("forwards a caller-supplied reason", async () => {
    const { pool, queries } = makePool([{ ...FAKE_ROW, status: "failed" }]);
    await markReminderFailed(pool, 1, "telegram_send_error");
    expect(queries[0]!.params).toEqual([1, "telegram_send_error"]);
  });

  it("returns null when no pending row matched", async () => {
    const { pool } = makePool([]);
    const rec = await markReminderFailed(pool, 999);
    expect(rec).toBeNull();
  });
});

describe("markReminderCancelled", () => {
  it("UPDATEs status='cancelled' scoped to founder_user_id", async () => {
    const { pool, queries } = makePool([{ ...FAKE_ROW, status: "cancelled" }]);
    const rec = await markReminderCancelled(pool, 1, "u_1");
    expect(queries[0]!.text).toMatch(/SET\s+status\s+= 'cancelled'/);
    expect(queries[0]!.text).toMatch(/AND founder_user_id = \$2/);
    expect(queries[0]!.params).toEqual([1, "u_1"]);
    expect(rec?.status).toBe("cancelled");
  });

  it("returns null when the reminder belongs to a different founder", async () => {
    const { pool } = makePool([]);
    const rec = await markReminderCancelled(pool, 1, "someone-else");
    expect(rec).toBeNull();
  });
});

describe("listFounderReminders", () => {
  it("defaults to all four statuses when none supplied", async () => {
    const { pool, queries } = makePool([FAKE_ROW]);
    const out = await listFounderReminders(pool, { founderUserId: "u_1" });
    expect(queries[0]!.text).toMatch(/FROM openclaw_reminders/);
    expect(queries[0]!.text).toMatch(/WHERE founder_user_id = \$1/);
    expect(queries[0]!.params![1]).toEqual([
      "pending",
      "sent",
      "cancelled",
      "failed",
    ]);
    expect(out).toHaveLength(1);
  });

  it("filters by a caller-supplied statuses subset", async () => {
    const { pool, queries } = makePool([]);
    await listFounderReminders(pool, {
      founderUserId: "u_1",
      statuses: ["pending"],
    });
    expect(queries[0]!.params![1]).toEqual(["pending"]);
  });

  it("treats an empty statuses array as 'no filter' (falls back to all four)", async () => {
    const { pool, queries } = makePool([]);
    await listFounderReminders(pool, {
      founderUserId: "u_1",
      statuses: [],
    });
    expect(queries[0]!.params![1]).toEqual([
      "pending",
      "sent",
      "cancelled",
      "failed",
    ]);
  });

  it("clamps limit to [1, 200] and defaults to 50", async () => {
    const { pool, queries } = makePool([]);
    await listFounderReminders(pool, { founderUserId: "u_1", limit: 9_999 });
    expect(queries[0]!.params![2]).toBe(200);

    await listFounderReminders(pool, { founderUserId: "u_1", limit: 0 });
    expect(queries[1]!.params![2]).toBe(1);

    await listFounderReminders(pool, { founderUserId: "u_1" });
    expect(queries[2]!.params![2]).toBe(50);
  });
});
