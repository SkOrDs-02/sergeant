// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import {
  getFinykExcludedTxIdsFromStorage,
  getFinykTxSplitsFromStorage,
  readFinykStatsContext,
} from "./lsStats";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "./sqliteReader";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "./monoMirrorReader";

beforeEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  clearFinykMonoMirrorCache();
});

describe("lsStats — тепле SQLite-джерело", () => {
  it("бере налаштування з SQLite і НЕ падає на дренований LS", () => {
    // Всі шість LS-ключів tombstoned: на реальному пристрої після drain-у
    // вони порожні, а стан живе в SQLite. Читання лише з LS повертало
    // порожній excluded-set — і тижневий дайджест рахував позначений
    // переказ витратою (bug-репорт 2026-08-09).
    localStorage.setItem("finyk_tx_cats", JSON.stringify({}));
    localStorage.setItem("finyk_hidden_txs", JSON.stringify([]));
    __setFinykSqliteStateCacheForTests({
      txCategories: { txTransfer: INTERNAL_TRANSFER_ID },
      hiddenTransactions: ["hidden-1"],
      excludedStatTxIds: ["extra-1"],
      receivables: [{ linkedTxIds: ["recv-1"] }] as never,
      txSplits: { tx1: [{ categoryId: "food", amount: 100 }] } as never,
    });

    expect([...getFinykExcludedTxIdsFromStorage()].sort()).toEqual([
      "extra-1",
      "hidden-1",
      "recv-1",
      "txTransfer",
    ]);
    expect(getFinykTxSplitsFromStorage()).toEqual({
      tx1: [{ categoryId: "food", amount: 100 }],
    });
    expect(readFinykStatsContext().txCategories).toEqual({
      txTransfer: INTERNAL_TRANSFER_ID,
    });
  });
});

describe("lsStats — холодний кеш, LS-fallback на перший кадр", () => {
  it("combines hidden, transfer, receivable, and extra excluded ids", () => {
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["hidden-1"]));
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({
        txFood: "food",
        txTransfer: INTERNAL_TRANSFER_ID,
      }),
    );
    localStorage.setItem(
      "finyk_recv",
      JSON.stringify([{ linkedTxIds: ["recv-1", "recv-2"] }, {}]),
    );
    localStorage.setItem(
      "finyk_excluded_stat_txs",
      JSON.stringify(["extra-1"]),
    );

    expect([...getFinykExcludedTxIdsFromStorage()].sort()).toEqual([
      "extra-1",
      "hidden-1",
      "recv-1",
      "recv-2",
      "txTransfer",
    ]);
  });

  it("returns only valid split/category/custom-category shapes in stats context", () => {
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({ tx1: [{ categoryId: "food", amount: 100 }] }),
    );
    localStorage.setItem("finyk_tx_cats", JSON.stringify(["bad-shape"]));
    localStorage.setItem("finyk_custom_cats_v1", JSON.stringify({ bad: true }));

    expect(getFinykTxSplitsFromStorage()).toEqual({
      tx1: [{ categoryId: "food", amount: 100 }],
    });
    expect(readFinykStatsContext()).toMatchObject({
      txCategories: {},
      customCategories: [],
      txSplits: { tx1: [{ categoryId: "food", amount: 100 }] },
    });
  });
});

describe("lsStats — правила «Завжди так для цього магазину»", () => {
  const RULE = {
    id: "mr_1",
    kind: "expense" as const,
    merchantKey: "сільпо",
    categoryId: "transport",
    label: "Сільпо",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };

  function seed(overrides: Record<string, unknown> = {}) {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -100, description: "Сільпо №5" },
        { id: "t2", amount: -200, description: "АТБ" },
        { id: "t3", amount: -300, description: "СІЛЬПО 12" },
      ] as never[],
      refreshedAt: "2026-10-01T00:00:00.000Z",
    });
    __setFinykSqliteStateCacheForTests({
      txCategories: { t3: "food" },
      merchantRules: [RULE],
      ...overrides,
    } as never);
  }

  it("віддає дайджесту/коучу ефективну мапу: правило виводить категорію, явний override сильніший", () => {
    seed();
    const ctx = readFinykStatsContext();
    // t1 — за правилом; t2 — інший мерчант, мапа без запису; t3 — явний вибір.
    expect(ctx.txCategories).toEqual({ t1: "transport", t3: "food" });
  });

  it("правила не потрапляють у виключення зі статистики (переказ не виводиться правилом)", () => {
    seed();
    const ctx = readFinykStatsContext();
    expect(ctx.excludedTxIds.has("t1")).toBe(false);
  });

  it("без правил мапа лишається тотожною явним override-ам", () => {
    seed({ merchantRules: null });
    expect(readFinykStatsContext().txCategories).toEqual({ t3: "food" });
  });

  it("холодний кеш (LS-fallback): правил там не було, мапа не змінюється", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -100, description: "Сільпо №5" },
      ] as never[],
      refreshedAt: "2026-10-01T00:00:00.000Z",
    });
    localStorage.setItem("finyk_tx_cats", JSON.stringify({ t9: "food" }));
    expect(readFinykStatsContext().txCategories).toEqual({ t9: "food" });
  });
});
