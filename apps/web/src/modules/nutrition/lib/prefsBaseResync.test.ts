// @vitest-environment jsdom
/**
 * Last validated: 2026-11-26
 * Status: Active
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const all = vi.fn();
const enqueue = vi.fn();
vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: async () => ({ migrationClient: () => ({ all }) }),
}));
vi.mock("../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: (...args: unknown[]) => enqueue(...args),
}));

import {
  PREFS_BASE_RESYNC_KEY,
  resyncNutritionPrefsBaseOnce,
} from "./prefsBaseResync";

beforeEach(() => {
  localStorage.clear();
  all.mockReset();
  enqueue.mockReset().mockResolvedValue({ id: 1 });
});

describe("resyncNutritionPrefsBaseOnce (FULL-20261126-NUTR-1)", () => {
  it("кладе в outbox повний знімок без prefs_merge і лише раз на акаунт", async () => {
    all.mockResolvedValue([
      {
        prefs_json: '{"dailyTargetKcal":1800}',
        active_pantry_id: "home",
      },
    ]);
    await expect(resyncNutritionPrefsBaseOnce("u1")).resolves.toBe("done");
    expect(enqueue).toHaveBeenCalledTimes(1);
    const input = enqueue.mock.calls[0]![1] as {
      table: string;
      row: Record<string, unknown>;
    };
    expect(input.table).toBe("nutrition_prefs");
    expect(input.row).toEqual({
      user_id: "u1",
      prefs_json: '{"dailyTargetKcal":1800}',
      active_pantry_id: "home",
    });
    expect(input.row).not.toHaveProperty("prefs_merge");

    await expect(resyncNutritionPrefsBaseOnce("u1")).resolves.toBe("skipped");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`${PREFS_BASE_RESYNC_KEY}:u1`)).not.toBeNull();
  });

  it("без локального рядка prefs нічого не шле і не ставить мітку", async () => {
    all.mockResolvedValue([]);
    await expect(resyncNutritionPrefsBaseOnce("u1")).resolves.toBe("no-row");
    expect(enqueue).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${PREFS_BASE_RESYNC_KEY}:u1`)).toBeNull();
  });
});
