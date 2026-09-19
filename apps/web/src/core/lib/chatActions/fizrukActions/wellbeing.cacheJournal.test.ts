// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Регрес 2026-09-16: chat-екшен самопочуття читав журнал із tombstoned
// LS-ключа, тож `next` не містив жодного реального запису, а `prev` — усі,
// і dual-write diff видаляв увесь журнал тіла за один запис із чату. Тут
// `./shared` НЕ мокається — перевіряється саме пара prev/next, яку екшен
// віддає в пайплайн проти заповненого SQLite-кешу.
const trigger = vi.hoisted(() => vi.fn());
vi.mock("../../../../modules/fizruk/lib/sqliteWriter/index", async (orig) => ({
  ...(await orig<
    typeof import("../../../../modules/fizruk/lib/sqliteWriter/index")
  >()),
  triggerFizrukDualWrite: trigger,
  isFizrukDualWriteRegistered: () => true,
}));
vi.mock("../../../profile/recordBodyWeight", () => ({
  recordBodyWeight: vi.fn(),
}));

import { diffFizrukDualWriteOps } from "../../../../modules/fizruk/lib/sqliteWriter/diff";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../../modules/fizruk/lib/sqliteReader";
import { logWellbeing } from "./wellbeing";

const E1 = {
  id: "dl_e1",
  at: "2026-09-10T08:00:00.000Z",
  weightKg: 80,
  sleepHours: 7,
  energyLevel: 3,
  moodScore: 3,
  note: "",
};
const E2 = { ...E1, id: "dl_e2", at: "2026-09-11T08:00:00.000Z" };

function lastOps() {
  const [prev, next] = trigger.mock.calls.at(-1)!;
  return diffFizrukDualWriteOps(prev, next).filter((op) =>
    op.kind.startsWith("daily-log"),
  );
}

beforeEach(() => {
  trigger.mockClear();
  clearFizrukSqliteCache();
  __setFizrukSqliteCacheForTests({ dailyLog: [E1, E2] });
});

describe("logWellbeing × заповнений журнал у кеші", () => {
  it("додає один запис і не видаляє жодного наявного", () => {
    const res = logWellbeing({
      name: "log_wellbeing",
      input: { sleep_hours: 8 },
    });
    expect(res).toMatchObject({ result: expect.stringContaining("сон 8") });
    const ops = lastOps();
    expect(ops.map((op) => op.kind)).toEqual(["daily-log-upsert"]);
    const [prev] = trigger.mock.calls.at(-1)!;
    expect(prev.dailyLog.map((e: { id: string }) => e.id)).toEqual([
      "dl_e1",
      "dl_e2",
    ]);
  });

  it("undo видаляє саме цей запис, навіть поки кеш його ще не знає", () => {
    const res = logWellbeing({
      name: "log_wellbeing",
      input: { sleep_hours: 8 },
    });
    if (typeof res === "string") throw new Error(res);
    const added = lastOps()[0];
    if (!added || added.kind !== "daily-log-upsert")
      throw new Error("no upsert");
    res.undo?.();
    const ops = lastOps();
    expect(ops).toEqual([
      { kind: "daily-log-delete", entryId: added.entry.id },
    ]);
  });
});
