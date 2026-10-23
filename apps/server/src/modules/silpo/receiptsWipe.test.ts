import { describe, expect, it, vi } from "vitest";

import { loadReceiptsWipedAtMs } from "./receiptsWipe.js";
import type { QueryFn } from "./tokenStore.js";

/**
 * Маркер wipe (аудит 2026-10-01, data-47, міграція 165). У вікні викочування
 * 165 старий інстанс пише лише `silpo_connection.receipts_wiped_at`, тож
 * читач бере пізніший із двох маркерів.
 */
describe("loadReceiptsWipedAtMs", () => {
  it("читає обидва маркери і бере пізніший (GREATEST)", async () => {
    const sqls: string[] = [];
    const queryFn = vi.fn(async (sql: string) => {
      sqls.push(sql);
      return {
        rows: [{ receipts_wiped_at: new Date("2026-10-20T10:00:00Z") }],
        rowCount: 1,
      };
    }) as unknown as QueryFn;

    const ms = await loadReceiptsWipedAtMs("u1", queryFn);

    expect(ms).toBe(Date.parse("2026-10-20T10:00:00Z"));
    expect(sqls[0]).toContain("GREATEST(");
    expect(sqls[0]).toContain("FROM silpo_wipe_marker");
    expect(sqls[0]).toContain("FROM silpo_connection");
  });

  it("без жодного маркера повертає null", async () => {
    const queryFn = vi.fn(async () => ({
      rows: [{ receipts_wiped_at: null }],
      rowCount: 1,
    })) as unknown as QueryFn;

    expect(await loadReceiptsWipedAtMs("u1", queryFn)).toBeNull();
  });
});
