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
      analytics: true,
      aiMemory: true,
      pushNotifications: false,
      updatedAt: null,
    });
  });

  it("maps snake_case columns to camelCase fields", async () => {
    const db = mockDb([
      {
        analytics: false,
        ai_memory: true,
        push_notifications: true,
        updated_at: new Date("2026-06-06T10:00:00.000Z"),
      },
    ]);
    const result = await getUserPreferences(db, "user-1");
    expect(result).toEqual({
      analytics: false,
      aiMemory: true,
      pushNotifications: true,
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
  });

  it("output passes UserPreferencesSchema — contract triplet anchor", async () => {
    const result = await getUserPreferences(mockDb([]), "user-1");
    expect(() => UserPreferencesSchema.parse(result)).not.toThrow();
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
        .mockRejectedValueOnce(new Error("db error")), // first UPDATE
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
});
