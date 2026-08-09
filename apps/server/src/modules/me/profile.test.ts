import { describe, expect, it, vi } from "vitest";
import { UserProfileResponseSchema } from "@sergeant/shared";
import {
  getUserProfile,
  removeMemoryBankEntry,
  upsertUserProfile,
} from "./profile.js";

/**
 * `user_profile` write-through wiring (migration 115) — Stage 2. NOT
 * oplog-sync: plain GET/PUT upsert by `user_id`, mirrors
 * `dataRights.ts::getUserPreferences`/`upsertUserPreferences` in shape.
 */

function mockDb(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe("getUserProfile — contract fixture (Hard Rule #3)", () => {
  it("returns { profile: {}, updatedAt: null } when no row exists (new user)", async () => {
    const result = await getUserProfile(mockDb([]), "user-1");
    expect(result).toEqual({ profile: {}, updatedAt: null });
    expect(() => UserProfileResponseSchema.parse(result)).not.toThrow();
  });

  it("returns the stored payload + ISO updatedAt when a row exists", async () => {
    const db = mockDb([
      {
        payload: { name: "Ada", heightCm: 170 },
        updated_at: new Date("2026-06-06T10:00:00.000Z"),
      },
    ]);
    const result = await getUserProfile(db, "user-1");
    expect(result).toEqual({
      profile: { name: "Ada", heightCm: 170 },
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
  });

  it("falls back to {} when payload is null (defensive — column has NOT NULL DEFAULT '{}')", async () => {
    const db = mockDb([{ payload: null, updated_at: new Date() }]);
    const result = await getUserProfile(db, "user-1");
    expect(result.profile).toEqual({});
  });

  it("queries by user_id", async () => {
    const db = mockDb([]);
    await getUserProfile(db, "user-42");
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT payload, updated_at FROM user_profile/),
      ["user-42"],
    );
  });
});

describe("upsertUserProfile — contract fixture (Hard Rule #3)", () => {
  it("upserts and returns the new payload + updatedAt", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            payload: { name: "Ada" },
            updated_at: new Date("2026-06-06T10:05:00.000Z"),
          },
        ],
      }),
    };
    const result = await upsertUserProfile(db, "user-1", { name: "Ada" });
    expect(result).toEqual({
      profile: { name: "Ada" },
      updatedAt: "2026-06-06T10:05:00.000Z",
    });
    expect(() => UserProfileResponseSchema.parse(result)).not.toThrow();

    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO user_profile/);
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
    expect(params[0]).toBe("user-1");
    expect(JSON.parse(params[1] as string)).toEqual({ name: "Ada" });
  });
});

/**
 * L-8 Фаза 2 (2026-08-09) — узгоджене видалення. `removeMemoryBankEntry`
 * викликається з `ai-memory/listRoute.ts` у транзакції ПІСЛЯ DELETE з
 * `ai_memories`, коли стертий рядок мав `source='profile'`.
 */
describe("removeMemoryBankEntry — узгоджене видалення (Hard Rule #3 contract fixture)", () => {
  function mockDbWithPayload(payload: unknown) {
    const query = vi
      .fn()
      // 1-й виклик: SELECT payload ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ payload }] })
      // 2-й виклик: UPDATE ... (лише якщо дійшло до нього)
      .mockResolvedValueOnce({ rows: [] });
    return { query };
  }

  it("прибирає факт за id і бампає memoryBank.updatedAt", async () => {
    const db = mockDbWithPayload({
      heightCm: 170,
      memoryBank: {
        entries: [
          {
            id: "fact-1",
            fact: "алергія на горіхи",
            category: "allergy",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "fact-2",
            fact: "тренується 3 рази на тиждень",
            category: "training",
            createdAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    });

    const result = await removeMemoryBankEntry(db, "user-1", "fact-1");
    expect(result).toEqual({ removed: true });

    expect(db.query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = db.query.mock.calls[1]!;
    expect(updateSql).toMatch(/UPDATE user_profile SET payload/);
    expect(updateParams[0]).toBe("user-1");
    const nextPayload = JSON.parse(updateParams[1] as string);
    expect(nextPayload.heightCm).toBe(170);
    expect(nextPayload.memoryBank.entries).toEqual([
      {
        id: "fact-2",
        fact: "тренується 3 рази на тиждень",
        category: "training",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(nextPayload.memoryBank.updatedAt).not.toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });

  it("нема рядка user_profile → removed:false, без UPDATE", async () => {
    const db = { query: vi.fn().mockResolvedValueOnce({ rows: [] }) };
    const result = await removeMemoryBankEntry(db, "user-1", "fact-1");
    expect(result).toEqual({ removed: false });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("payload без секції memoryBank → removed:false, без UPDATE", async () => {
    const db = mockDbWithPayload({ heightCm: 170 });
    const result = await removeMemoryBankEntry(db, "user-1", "fact-1");
    expect(result).toEqual({ removed: false });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("id не знайдено серед entries → removed:false (ідемпотентно), без UPDATE", async () => {
    const db = mockDbWithPayload({
      memoryBank: {
        entries: [{ id: "fact-9", fact: "щось інше" }],
        updatedAt: "x",
      },
    });
    const result = await removeMemoryBankEntry(db, "user-1", "fact-1");
    expect(result).toEqual({ removed: false });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
