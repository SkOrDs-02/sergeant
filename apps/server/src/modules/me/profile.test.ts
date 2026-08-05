import { describe, expect, it, vi } from "vitest";
import { UserProfileResponseSchema } from "@sergeant/shared";
import { getUserProfile, upsertUserProfile } from "./profile.js";

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
