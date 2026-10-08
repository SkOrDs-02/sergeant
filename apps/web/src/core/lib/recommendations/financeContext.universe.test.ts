// @vitest-environment jsdom
// logic-08: хаб-картки про витрати рахують той самий «всесвіт», що Фінік і
// «Звіт тижня»: канонічний excluded-set (виключене, пари «Скасування»,
// ручні «Не враховувати») і місячне вікно, обмежене зверху.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWeekReport } from "@sergeant/finyk-domain/domain/weekReport";
import { Recommendations } from "@sergeant/insights";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../modules/finyk/lib/sqliteReader";
import { readFinykStatsContext } from "../../../modules/finyk/lib/lsStats";
import { buildFinanceContext } from "./financeContext";

// Середа 2026-04-15, 13:30 за Києвом (до 14:00: денна картка мовчить).
const FIXED_NOW = new Date("2026-04-15T10:30:00.000Z");

const mockMirrorTransactions: Array<Record<string, unknown>> = [];
vi.mock("../../../modules/finyk/lib/monoMirrorReader", () => {
  const state = () => ({
    transactions: mockMirrorTransactions,
    accounts: [],
    refreshedAt: new Date("2026-04-15T10:30:00.000Z").toISOString(),
  });
  return {
    getCachedFinykMonoMirrorState: state,
    getVisibleFinykMonoMirrorState: state,
  };
});

type SqliteSeed = Parameters<typeof __setFinykSqliteStateCacheForTests>[0];
function seedSqlite(partial: Record<string, unknown>) {
  __setFinykSqliteStateCacheForTests(partial as SqliteSeed);
}

/** Банківський запис: час у секундах (формат Monobank), `amount` у копійках. */
function bankTx(
  id: string,
  amountUah: number,
  iso: string,
  description = "Магазин",
) {
  return {
    id,
    amount: Math.round(amountUah * 100),
    time: Math.floor(new Date(iso).getTime() / 1000),
    description,
    mcc: 5411,
  };
}

const { spendingVelocityRule } = Recommendations;

beforeEach(() => {
  localStorage.clear();
  mockMirrorTransactions.length = 0;
  clearFinykSqliteCache();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  mockMirrorTransactions.length = 0;
  clearFinykSqliteCache();
});

/** Сценарій f1 з аудиту: Silpo, виключений ноутбук, пара Uklon, минулий тиждень. */
function seedF1(prevWeekUah: number) {
  mockMirrorTransactions.push(
    bankTx("silpo", -800, "2026-04-13T09:00:00Z", "Silpo"),
    bankTx("laptop", -30_000, "2026-04-14T08:00:00Z", "Ноутбук"),
    bankTx("uklon", -1500, "2026-04-14T09:00:00Z", "Uklon"),
    bankTx("uklon-refund", 1500, "2026-04-14T12:00:00Z", "Скасування. Uklon"),
    bankTx("prev", -prevWeekUah, "2026-04-07T09:00:00Z", "Минулий тиждень"),
  );
  seedSqlite({ excludedStatTxIds: ["laptop"] });
}

function weekReportFromStats() {
  const stats = readFinykStatsContext();
  return buildWeekReport(
    stats.txs.filter((tx) => !stats.excludedTxIds.has(tx.id)) as never,
    { now: FIXED_NOW },
  );
}

describe("buildFinanceContext — канонічний excluded-set (logic-08)", () => {
  it("кладе в контекст excludedTxIds зі stats: виключене й обидві ноги «Скасування»", () => {
    seedF1(1000);
    const ctx = buildFinanceContext();
    expect([...(ctx.excludedTxIds ?? [])].sort()).toEqual(
      ["laptop", "uklon", "uklon-refund"].sort(),
    );
    expect([...readFinykStatsContext().excludedTxIds].sort()).toEqual(
      [...(ctx.excludedTxIds ?? [])].sort(),
    );
    // Сумісність: старі поля лишаються, хоч і вужчі.
    expect(ctx.hiddenTxIds.size).toBe(0);
    expect(ctx.transferIds.size).toBe(0);
  });

  it("картка темпу не каже «+3130%», коли звіт тижня каже −20%", () => {
    seedF1(1000);
    const ctx = buildFinanceContext();
    const report = weekReportFromStats();
    expect(report.total).toMatchObject({
      spentMinor: 80_000,
      prevMinor: 100_000,
    });
    expect(Math.round(report.total?.delta.pct ?? 0)).toBe(-20);
    // −20% не доходить до порога 0.6, тож картки немає, а головне - немає
    // «Витрати на 3130% вище».
    expect(spendingVelocityRule.evaluate(ctx)).toEqual([]);
  });

  it("відсоток картки збігається з відсотком звіту тижня", () => {
    seedF1(2000);
    const ctx = buildFinanceContext();
    expect(Math.round(weekReportFromStats().total?.delta.pct ?? 0)).toBe(-60);
    const [rec] = spendingVelocityRule.evaluate(ctx);
    expect(rec?.title).toBe("Витрати на 60% нижче ніж минулого тижня");
  });

  it("ручна витрата з «Не враховувати» не входить у темп і лічильники", () => {
    mockMirrorTransactions.push(
      bankTx("prev", -2000, "2026-04-07T09:00:00Z"),
      bankTx("silpo", -800, "2026-04-13T09:00:00Z"),
    );
    seedSqlite({
      manualExpenses: [
        { id: "m1", amount: 30_000, date: "2026-04-14", category: "food" },
      ],
      excludedStatTxIds: ["manual_m1"],
    });
    const ctx = buildFinanceContext();
    expect(ctx.manualExpenses).toEqual([]);
    // Лише два банківські записи (2000 + 800, обидва цього місяця): 30 000
    // ручної виключеної в сумі немає.
    expect(ctx.canonicalMonthSpend.get("food")).toBe(2800);
    expect(ctx.canonicalTotalCount.get("food")).toBe(2);
    const [rec] = spendingVelocityRule.evaluate(ctx);
    expect(rec?.title).toBe("Витрати на 60% нижче ніж минулого тижня");
  });

  it("сховану ручну витрату хаб теж не рахує", () => {
    seedSqlite({
      manualExpenses: [
        { id: "m1", amount: 500, date: "2026-04-14", category: "food" },
      ],
      hiddenTransactions: ["manual_m1"],
    });
    expect(buildFinanceContext().manualExpenses).toEqual([]);
  });
});

describe("buildFinanceContext — місячне вікно обмежене зверху (logic-08)", () => {
  it("ручна витрата з датою в наступному місяці не входить у canonicalMonthSpend", () => {
    seedSqlite({
      manualExpenses: [
        { id: "now", amount: 25, date: "2026-04-10", category: "food" },
        { id: "next", amount: 4000, date: "2026-05-02", category: "food" },
      ],
    });
    expect(buildFinanceContext().canonicalMonthSpend.get("food")).toBe(25);
  });

  it("запис пізніше за сьогодні в тому ж місяці теж не «цього місяця»", () => {
    mockMirrorTransactions.push(
      bankTx("today", -100, "2026-04-15T08:00:00Z"),
      bankTx("planned", -4000, "2026-04-20T08:00:00Z"),
    );
    seedSqlite({
      manualExpenses: [
        { id: "plan", amount: 700, date: "2026-04-28", category: "food" },
      ],
    });
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["today"]);
    expect(
      [...ctx.canonicalMonthSpend.values()].reduce((a, b) => a + b, 0),
    ).toBe(100);
  });

  it("виключена банківська витрата не потрапляє в thisMonthTx", () => {
    mockMirrorTransactions.push(
      bankTx("a", -100, "2026-04-14T08:00:00Z"),
      bankTx("b", -9000, "2026-04-14T09:00:00Z"),
    );
    seedSqlite({ excludedStatTxIds: ["b"] });
    expect(buildFinanceContext().thisMonthTx.map((t) => t.id)).toEqual(["a"]);
  });
});
