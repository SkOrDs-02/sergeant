import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
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

/**
 * `upsertUserProfile` тепер керує власною транзакцією через `pool.connect()`
 * (SELECT ... FOR UPDATE race-guard), тож фейкований `pool` мусить давати
 * client з `.query`/`.release`. INSERT-гілка ЕХО-ить назад те, що реально
 * пішло у SQL-параметрах (як справжній `RETURNING`), щоб тести перевіряли
 * фактичний результат `resolveMemoryBankGuard`, а не заглушку.
 */
function mockPoolForUpsert(existingPayload?: unknown) {
  const client = {
    query: vi.fn((sql: string, params?: unknown[]) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT payload FROM user_profile/.test(sql)) {
        return Promise.resolve({
          rows:
            existingPayload === undefined ? [] : [{ payload: existingPayload }],
        });
      }
      if (/INSERT INTO user_profile/.test(sql)) {
        const payload = JSON.parse((params ?? [])[1] as string);
        return Promise.resolve({
          rows: [{ payload, updated_at: new Date("2026-06-06T10:05:00.000Z") }],
        });
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  return { pool, client };
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
  it("upserts and returns the new payload + updatedAt (no existing row)", async () => {
    const { pool, client } = mockPoolForUpsert(undefined);
    const result = await upsertUserProfile(pool, "user-1", { name: "Ada" });
    expect(result).toEqual({
      profile: { name: "Ada" },
      updatedAt: "2026-06-06T10:05:00.000Z",
    });
    expect(() => UserProfileResponseSchema.parse(result)).not.toThrow();

    const insertCall = client.query.mock.calls.find(([sql]) =>
      /INSERT INTO user_profile/.test(sql as string),
    )!;
    const [sql, params] = insertCall;
    const insertParams = params ?? [];
    expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
    expect(insertParams[0]).toBe("user-1");
    expect(JSON.parse(insertParams[1] as string)).toEqual({ name: "Ada" });
  });

  it("керує власною транзакцією: BEGIN першим, COMMIT останнім", async () => {
    const { pool, client } = mockPoolForUpsert(undefined);
    await upsertUserProfile(pool, "user-1", { name: "Ada" });
    const sqls = client.query.mock.calls.map(([sql]) => sql as string);
    expect(sqls[0]).toMatch(/^BEGIN/);
    expect(sqls[sqls.length - 1]).toMatch(/^COMMIT/);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith();
  });
});

/**
 * L-8 памʼятковий LWW-guard (рішення власника 2026-09-23,
 * docs/work/specs/tech-debt/backend.md). Область дії лише секція
 * `memoryBank`; біометрія й усе інше лишаються сліпою заміною завжди.
 */
describe("upsertUserProfile - memoryBank LWW-guard (рішення власника 2026-09-23)", () => {
  const STORED = {
    heightCm: 170,
    memoryBank: {
      entries: [{ id: "fact-1", fact: "старий факт" }],
      updatedAt: "2026-01-05T00:00:00.000Z",
    },
  };

  it("застаріла вхідна memoryBank → збережена секція лишається, решта з вхідного", async () => {
    const incoming = {
      heightCm: 180,
      memoryBank: {
        entries: [{ id: "fact-2", fact: "воскреслий факт" }],
        updatedAt: "2026-01-01T00:00:00.000Z", // старіша за STORED
      },
    };
    const { pool } = mockPoolForUpsert(STORED);
    const result = await upsertUserProfile(pool, "user-1", incoming);
    expect(result.profile).toEqual({
      heightCm: 180,
      memoryBank: STORED.memoryBank,
    });
  });

  it("новіша вхідна memoryBank → повністю замінює збережену", async () => {
    const incoming = {
      heightCm: 180,
      memoryBank: {
        entries: [{ id: "fact-2", fact: "новий факт" }],
        updatedAt: "2026-01-10T00:00:00.000Z", // новіша за STORED
      },
    };
    const { pool } = mockPoolForUpsert(STORED);
    const result = await upsertUserProfile(pool, "user-1", incoming);
    expect(result.profile).toEqual(incoming);
  });

  it("рівні мітки → вхідний виграє", async () => {
    const incoming = {
      heightCm: 180,
      memoryBank: {
        entries: [{ id: "fact-2", fact: "новий факт" }],
        updatedAt: STORED.memoryBank.updatedAt,
      },
    };
    const { pool } = mockPoolForUpsert(STORED);
    const result = await upsertUserProfile(pool, "user-1", incoming);
    expect(result.profile).toEqual(incoming);
  });

  it("у збереженого рядка немає секції memoryBank → вхідний виграє (зворотна сумісність)", async () => {
    const incoming = {
      heightCm: 180,
      memoryBank: { entries: [], updatedAt: "2026-01-01T00:00:00.000Z" },
    };
    const { pool } = mockPoolForUpsert({ heightCm: 170 });
    const result = await upsertUserProfile(pool, "user-1", incoming);
    expect(result.profile).toEqual(incoming);
  });

  it("непарсна мітка часу у збереженого рядка → вхідний виграє", async () => {
    const stored = {
      heightCm: 170,
      memoryBank: { entries: [], updatedAt: "not-a-date" },
    };
    const incoming = {
      heightCm: 180,
      memoryBank: {
        entries: [{ id: "fact-2", fact: "новий факт" }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    const { pool } = mockPoolForUpsert(stored);
    const result = await upsertUserProfile(pool, "user-1", incoming);
    expect(result.profile).toEqual(incoming);
  });

  it("непарсна/відсутня мітка часу у вхідного → вхідний виграє", async () => {
    const incoming = {
      heightCm: 180,
      memoryBank: { entries: [{ id: "fact-2", fact: "новий факт" }] }, // без updatedAt
    };
    const { pool } = mockPoolForUpsert(STORED);
    const result = await upsertUserProfile(pool, "user-1", incoming);
    expect(result.profile).toEqual(incoming);
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
