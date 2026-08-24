import { describe, expect, it, vi } from "vitest";
import { syncAllConnectedUsers } from "./syncAll.js";
import type { QueryFn } from "./tokenStore.js";

/**
 * Контракт фонового обходу. Головне тут — ізоляція збою: один мертвий
 * звʼязок не має зупиняти прогін для решти, інакше найпершого
 * `reauth_required` вистачить, щоб уся база лишилась без чеків.
 */

function queryReturning(userIds: string[]): QueryFn {
  return vi.fn().mockResolvedValue({
    rows: userIds.map((user_id) => ({ user_id })),
    rowCount: userIds.length,
  }) as unknown as QueryFn;
}

const noSleep = () => Promise.resolve();

describe("syncAllConnectedUsers", () => {
  it("синкає кожного кандидата і підсумовує лічильники", async () => {
    const syncOne = vi
      .fn()
      .mockResolvedValueOnce({ receiptsInserted: 2, matched: 1 })
      .mockResolvedValueOnce({ receiptsInserted: 3, matched: 2 });

    const result = await syncAllConnectedUsers({
      query: queryReturning(["u1", "u2"]),
      syncOne,
      sleep: noSleep,
    });

    expect(syncOne).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      candidates: 2,
      synced: 2,
      failed: 0,
      receiptsInserted: 5,
      matched: 3,
    });
  });

  it("падіння одного акаунта не зупиняє решту", async () => {
    const syncOne = vi
      .fn()
      .mockRejectedValueOnce(new Error("reauth_required"))
      .mockResolvedValueOnce({ receiptsInserted: 1, matched: 1 });

    const result = await syncAllConnectedUsers({
      query: queryReturning(["dead", "alive"]),
      syncOne,
      sleep: noSleep,
    });

    expect(syncOne).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(1);
    expect(result.receiptsInserted).toBe(1);
  });

  it("тримає паузу МІЖ акаунтами, але не перед першим", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);

    await syncAllConnectedUsers({
      query: queryReturning(["u1", "u2", "u3"]),
      syncOne: vi.fn().mockResolvedValue({}),
      sleep,
      delayMs: 250,
    });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it("порожній список кандидатів — не помилка", async () => {
    const syncOne = vi.fn();

    const result = await syncAllConnectedUsers({
      query: queryReturning([]),
      syncOne,
      sleep: noSleep,
    });

    expect(syncOne).not.toHaveBeenCalled();
    expect(result.candidates).toBe(0);
    expect(result.synced).toBe(0);
  });

  it("передає `limit` у запит кандидатів", async () => {
    const query = queryReturning([]);

    await syncAllConnectedUsers({ query, limit: 7, sleep: noSleep });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'connected'"),
      [7],
      expect.objectContaining({ op: "silpo_sync_all_candidates" }),
    );
  });
});
