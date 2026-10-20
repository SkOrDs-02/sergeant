import { describe, expect, it, vi } from "vitest";
import { markMonoMatchLikely } from "./monoMatchDetect.js";

const ROW = {
  date: "2026-01-15",
  amountKopiykas: 9500,
  direction: "expense" as const,
  description: "АТБ",
};

function makeDb(pairs: Array<{ ord: string; mono_tx_id: string }>) {
  return { query: vi.fn().mockResolvedValue({ rows: pairs }) };
}

describe("markMonoMatchLikely", () => {
  it("ставить monoMatchLikely: true лише рядкам зі збігом, решту не чіпає", async () => {
    const db = makeDb([{ ord: "2", mono_tx_id: "tx-1" }]);
    const out = await markMonoMatchLikely(db as never, "u1", [
      ROW,
      { ...ROW, description: "Метро" },
    ]);
    expect(out[0]).toEqual(ROW);
    expect("monoMatchLikely" in out[0]!).toBe(false);
    expect(out[1]).toEqual({
      ...ROW,
      description: "Метро",
      monoMatchLikely: true,
    });
  });

  it("одна mono-операція мітить лише один із двох однакових рядків", async () => {
    const db = makeDb([
      { ord: "1", mono_tx_id: "tx-1" },
      { ord: "2", mono_tx_id: "tx-1" },
    ]);
    const out = await markMonoMatchLikely(db as never, "u1", [ROW, ROW]);
    expect(out.map((r) => r.monoMatchLikely)).toEqual([true, undefined]);
  });

  it("порожній вхід: жодного запиту до БД", async () => {
    const db = makeDb([]);
    expect(await markMonoMatchLikely(db as never, "u1", [])).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});
