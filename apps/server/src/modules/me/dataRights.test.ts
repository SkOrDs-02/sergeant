import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  MeDeleteResponseSchema,
  MeExportResponseSchema,
  UserPreferencesSchema,
} from "@sergeant/shared";
import {
  buildMeExport,
  deleteUserData,
  getUserPreferences,
  upsertUserPreferences,
} from "./dataRights.js";

// Minimal Queryable mock — returns empty rows unless overridden.
function mockDb(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

// Pool mock that supports `.connect()` for transaction-based functions.
function mockPoolWithTransaction(rows: unknown[] = []): Pool {
  const client = {
    query: vi.fn().mockResolvedValue({ rows }),
    release: vi.fn(),
  };
  return {
    query: vi.fn().mockResolvedValue({ rows }),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

const ME_USER = {
  id: "user-123",
  email: "test@example.com",
  name: "Тест",
  image: null,
  emailVerified: true,
  createdAt: "2026-01-15T08:30:00.000Z",
} as const;

// ─── getUserPreferences ───────────────────────────────────────────────────────

describe("getUserPreferences — contract fixture (Hard Rule #3)", () => {
  it("returns defaults when no row exists (new user)", async () => {
    const result = await getUserPreferences(mockDb([]), "user-1");
    expect(result).toEqual({
      // Migration 111: DB DEFAULT flipped TRUE → FALSE (opt-in, not
      // opt-out) — this app-level fallback must match.
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      // Проактивний канал Сержанта — opt-in, вимкнений і для нових акаунтів
      // (міграція 100). Дефолт тут — частина контракту, не деталь реалізації.
      sergeantNudges: false,
      // GDPR Art. 9 health-data consent — explicit opt-in only (migration 111).
      healthDataConsent: false,
      updatedAt: null,
    });
  });

  it("maps snake_case columns to camelCase fields", async () => {
    const db = mockDb([
      {
        analytics: false,
        ai_memory: true,
        push_notifications: true,
        sergeant_nudges: true,
        health_data_consent: true,
        updated_at: new Date("2026-06-06T10:00:00.000Z"),
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result).toEqual({
      analytics: false,
      aiMemory: true,
      pushNotifications: true,
      sergeantNudges: true,
      healthDataConsent: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
  });

  it("output passes UserPreferencesSchema — contract triplet anchor", async () => {
    const result = await getUserPreferences(mockDb([]), "user-1");
    expect(() => UserPreferencesSchema.parse(result)).not.toThrow();
  });

  it("returns updatedAt: null when the stored updated_at is null", async () => {
    const db = mockDb([
      {
        analytics: true,
        ai_memory: false,
        push_notifications: false,
        updated_at: null,
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result.updatedAt).toBeNull();
  });

  it("parses a string updated_at into an ISO timestamp", async () => {
    const db = mockDb([
      {
        analytics: true,
        ai_memory: false,
        push_notifications: false,
        updated_at: "2026-06-06T10:00:00.000Z",
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result.updatedAt).toBe("2026-06-06T10:00:00.000Z");
  });

  it("returns updatedAt: null when the stored updated_at is unparseable", async () => {
    const db = mockDb([
      {
        analytics: true,
        ai_memory: false,
        push_notifications: false,
        updated_at: "not-a-date",
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result.updatedAt).toBeNull();
  });
});

// ─── upsertUserPreferences ───────────────────────────────────────────────────

describe("upsertUserPreferences — contract fixture (Hard Rule #3)", () => {
  it("merges patch with current prefs and returns updated shape", async () => {
    // First call (SELECT current) → no row; second call (UPSERT RETURNING) → updated row.
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              analytics: false,
              ai_memory: true,
              push_notifications: false,
              updated_at: new Date("2026-06-06T10:05:00.000Z"),
            },
          ],
        }),
    };
    const result = await upsertUserPreferences(db, "user-1", {
      analytics: false,
    });
    expect(result.analytics).toBe(false);
    expect(result.aiMemory).toBe(true); // default, not patched
    expect(() => UserPreferencesSchema.parse(result)).not.toThrow();
  });
});

// ─── buildMeExport ───────────────────────────────────────────────────────────

describe("buildMeExport — contract fixture (Hard Rule #3)", () => {
  it("returns empty-data export that passes MeExportResponseSchema", async () => {
    // buildMeExport runs 10 parallel queries; all return empty rows here.
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);

    // generatedAt is dynamic — just validate it's an ISO-8601 string.
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.user).toEqual(ME_USER);

    expect(() => MeExportResponseSchema.parse(result)).not.toThrow();
  });

  it("structure matches the api-client me.test.ts export fixture shape", async () => {
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);

    expect(result.data).toMatchObject({
      moduleData: [],
      mono: { connection: null, accounts: [], transactions: [] },
      billing: { subscriptions: [] },
      push: { webSubscriptions: [], devices: [] },
      ai: { usageDaily: [], memories: [] },
    });
  });

  it("mono.connection is null when no connection row", async () => {
    const db = mockDb([]);
    const result = await buildMeExport(db, ME_USER);
    expect(result.data.mono.connection).toBeNull();
  });

  it("mono.connection carries the row through when a connection exists", async () => {
    const connectionRow = {
      status: "active",
      token_fingerprint: "fp-1",
      webhook_registered_at: new Date("2026-01-01T00:00:00.000Z"),
      last_event_at: null,
      last_backfill_at: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    };
    const db = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (typeof sql === "string" && sql.includes("FROM mono_connection")) {
          return Promise.resolve({ rows: [connectionRow] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };
    const result = await buildMeExport(db, ME_USER);
    expect(result.data.mono.connection).toEqual(connectionRow);
  });
});

// ─── deleteUserData ───────────────────────────────────────────────────────────

describe("deleteUserData — contract fixture (Hard Rule #3)", () => {
  it("returns { ok: true, deletedAt: <ISO string> }", async () => {
    const pool = mockPoolWithTransaction();
    const result = await deleteUserData(pool, "user-1");
    expect(result.ok).toBe(true);
    expect(result.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("output passes MeDeleteResponseSchema — contract triplet anchor", async () => {
    const pool = mockPoolWithTransaction();
    const result = await deleteUserData(pool, "user-1");
    expect(() => MeDeleteResponseSchema.parse(result)).not.toThrow();
  });

  it("runs BEGIN/COMMIT transaction and releases the client", async () => {
    const pool = mockPoolWithTransaction();
    await deleteUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    expect(client).toBeDefined();
    expect(client.release).toHaveBeenCalledOnce();
    const queryArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(queryArgs[0]).toBe("BEGIN");
    expect(queryArgs[queryArgs.length - 1]).toBe("COMMIT");
  });

  it("rolls back and rethrows on query failure", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error("db error")), // SELECT email snapshot
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await expect(deleteUserData(pool, "user-1")).rejects.toThrow("db error");

    const queryArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(queryArgs).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  // Phase 7 UA billing (ADR-0016): provider-cancel перед видаленням —
  // best-effort. Помилка провайдера (напр. LiqPay 5xx / mono down) НЕ мусить
  // валити deletion. notifyProvidersCancel іде через pool.query (top-level),
  // транзакція — через client.query; тут top-level query падає, а deletion
  // усе одно завершується успішно.
  it("still deletes the user when provider-cancel fails (best-effort)", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    const pool = {
      // Провайдер-cancel читає/пише через pool.query — імітуємо збій провайдера.
      query: vi.fn().mockRejectedValue(new Error("provider down")),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    const result = await deleteUserData(pool, "user-1");

    expect(result.ok).toBe(true);
    // Транзакція видалення все одно виконалась (BEGIN … COMMIT через client).
    const queryArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(queryArgs[0]).toBe("BEGIN");
    expect(queryArgs[queryArgs.length - 1]).toBe("COMMIT");
  });

  // Pre-beta schema-debt audit 2026-08-04: ai_usage_daily has no FK to
  // "user"(id) (subject_key is a bare TEXT), so CASCADE never reaches it —
  // an explicit purge is required (ADR-0016 § ADR-6.2).
  it("purges ai_usage_daily rows for the deleted user's subject_key", async () => {
    const pool = mockPoolWithTransaction();
    await deleteUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const purgeCall = calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("DELETE FROM ai_usage_daily"),
    );
    expect(purgeCall).toBeDefined();
    expect(purgeCall![1]).toEqual(["u:user-1"]);
  });

  // Canon (this audit): hard-delete via FK CASCADE only — no separate
  // ai_memories soft-delete step. A prior revision soft-deleted
  // ai_memories.deleted_at and then hard-deleted "user" two statements
  // later, which cascaded (migration 025 ON DELETE CASCADE) and destroyed
  // the very rows the soft-delete had just marked — a self-contradicting
  // no-op write.
  it("does NOT soft-delete ai_memories separately (hard-delete cascade only)", async () => {
    const pool = mockPoolWithTransaction();
    await deleteUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const softDeleteCall = calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("UPDATE ai_memories"),
    );
    expect(softDeleteCall).toBeUndefined();
  });

  // ADR-0016 § ADR-6.3 — enqueue one row per external service so a
  // background worker can clean up Stripe/Sentry/PostHog/Resend async,
  // without holding this request open for sequential third-party calls.
  it("enqueues gdpr_cleanup_queue rows (one per external service) when the user still exists", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (
          typeof sql === "string" &&
          sql.includes(`SELECT email FROM "user"`)
        ) {
          return Promise.resolve({ rows: [{ email: "gone@example.com" }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await deleteUserData(pool, "user-1");

    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const enqueueCalls = calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO gdpr_cleanup_queue"),
    );
    // Four static per-service INSERTs (M11 — no dynamic multi-row VALUES),
    // not one combined statement — see cleanupQueue.ts.
    expect(enqueueCalls).toHaveLength(4);
    const services = enqueueCalls.map((c) => (c[1] as unknown[])[3]);
    expect([...services].sort()).toEqual([
      "posthog",
      "resend",
      "sentry",
      "stripe",
    ]);
    for (const call of enqueueCalls) {
      const values = call[1] as unknown[];
      expect(values[0]).toBe("user-1");
      expect(values[1]).toBe("gone@example.com");
      expect(values[2]).toBeNull();
    }
  });

  // `enqueueGdprCleanup` no-ops silently on a falsy email
  // (`cleanupQueue.ts`: `if (!userId || !email) return;`) — a NULL
  // `"user".email` at delete-time (soft-delete anonymization edge case,
  // or a row that never had one) would otherwise skip the entire external
  // cleanup queue instead of enqueueing it under a synthetic address.
  it("falls back to a synthetic {userId}@deleted.sergeant.app address when email is null", async () => {
    const client = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (
          typeof sql === "string" &&
          sql.includes(`SELECT email FROM "user"`)
        ) {
          return Promise.resolve({ rows: [{ email: null }] });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;

    await deleteUserData(pool, "user-1");

    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const enqueueCalls = calls.filter(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO gdpr_cleanup_queue"),
    );
    expect(enqueueCalls).toHaveLength(4);
    for (const call of enqueueCalls) {
      const values = call[1] as unknown[];
      expect(values[0]).toBe("user-1");
      expect(values[1]).toBe("user-1@deleted.sergeant.app");
    }
  });

  it("skips gdpr_cleanup_queue enqueue when the user row is already gone (idempotent second delete)", async () => {
    // mockPoolWithTransaction() defaults every client.query call to
    // `{ rows: [] }` — including the SELECT email snapshot, simulating a
    // second delete() call after the user row is already removed.
    const pool = mockPoolWithTransaction();
    await deleteUserData(pool, "user-1");

    const client = await (pool.connect as ReturnType<typeof vi.fn>).mock
      .results[0]?.value;
    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls;
    const enqueueCall = calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO gdpr_cleanup_queue"),
    );
    expect(enqueueCall).toBeUndefined();
  });
});
