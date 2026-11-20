import { describe, expect, it } from "vitest";
import { toSyncPillState } from "./transactionsPageTypes";

describe("toSyncPillState", () => {
  it("passes a known status and the counters through", () => {
    expect(
      toSyncPillState({
        status: "partial",
        source: "network",
        accountsOk: 1,
        accountsTotal: 2,
      }),
    ).toEqual({
      status: "partial",
      source: "network",
      accountsOk: 1,
      accountsTotal: 2,
    });
  });

  it("falls back to idle for a status the pill does not know", () => {
    expect(toSyncPillState({ status: "syncing" }).status).toBe("idle");
  });
});
