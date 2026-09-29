/**
 * `pantryClaim.ts` - атомарне бронювання позицій чека перед записом у
 * комору (спека `docs/work/specs/silpo-pantry-auto-import.md`
 * § «Позначка живе на сервері, з атомарним бронюванням»).
 *
 * Фейковий `queryFn` тримає стан позицій/чека/тумблера в памʼяті й
 * застосовує WHERE-умови реального SQL (розпізнає їх за текстом
 * стейтменту) синхронно всередині одного виклику - так само, як
 * `UPDATE ... RETURNING` в Postgres виконується атомарно на рівні рядків.
 * Це і є предмет тесту №1: якщо `claimPantryItems` колись почне робити
 * SELECT-потім-UPDATE (два запити замість одного), два «паралельні» виклики
 * нижче миттю почнуть заброньовувати ті самі позиції двічі.
 */
import { describe, it, expect } from "vitest";
import { claimPantryItems, releasePantryItems } from "./pantryClaim.js";
import type { QueryFn } from "./tokenStore.js";

interface FakeItem {
  id: number;
  claimedAt: string | null;
}

function makeFakeDb(opts: {
  items: FakeItem[];
  purchasedAt: string;
  autoDeclinedAt: string | null;
  autoImportSince: string | null;
}) {
  const items = new Map(opts.items.map((i) => [i.id, { ...i }]));
  let autoDeclinedAt = opts.autoDeclinedAt;

  const queryFn = (async (sql: string, params?: unknown[]) => {
    const p = params ?? [];
    if (sql.includes("UPDATE silpo_receipt_items i")) {
      const itemIds = p[2] as number[];
      const isAuto = sql.includes("i.pantry_claimed_at IS NULL");
      const claimed: { id: unknown }[] = [];
      for (const id of itemIds) {
        const item = items.get(id);
        if (!item) continue;
        if (isAuto) {
          if (item.claimedAt != null) continue;
          if (autoDeclinedAt != null) continue;
          if (opts.autoImportSince && opts.purchasedAt < opts.autoImportSince)
            continue;
        }
        item.claimedAt = new Date().toISOString();
        claimed.push({ id: String(item.id) });
      }
      return { rows: claimed, rowCount: claimed.length };
    }
    if (
      sql.includes("UPDATE silpo_receipt_items") &&
      sql.includes("pantry_claimed_at = NULL")
    ) {
      const itemIds = p[2] as number[];
      for (const id of itemIds) {
        const item = items.get(id);
        if (item) item.claimedAt = null;
      }
      return { rows: [], rowCount: itemIds.length };
    }
    if (
      sql.includes("silpo_receipts") &&
      sql.includes("pantry_auto_declined_at = NOW()")
    ) {
      autoDeclinedAt = new Date().toISOString();
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }) as unknown as QueryFn;

  return { queryFn, items, declined: () => autoDeclinedAt };
}

describe("claimPantryItems", () => {
  it("два паралельні auto-claim на ті самі itemIds дають неперетинні множини (сума = всі позиції)", async () => {
    const { queryFn } = makeFakeDb({
      items: [
        { id: 1, claimedAt: null },
        { id: 2, claimedAt: null },
      ],
      purchasedAt: "2026-09-25T10:00:00.000Z",
      autoDeclinedAt: null,
      autoImportSince: "2026-09-20T00:00:00.000Z",
    });

    const [a, b] = await Promise.all([
      claimPantryItems("u1", "r1", [1, 2], "auto", queryFn),
      claimPantryItems("u1", "r1", [1, 2], "auto", queryFn),
    ]);

    const union = new Set([...a, ...b]);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(union).toEqual(new Set([1, 2]));
  });

  it("auto не бронює позиції чека, купленого до pantry_auto_import_since", async () => {
    const { queryFn } = makeFakeDb({
      items: [{ id: 1, claimedAt: null }],
      purchasedAt: "2026-09-01T10:00:00.000Z",
      autoDeclinedAt: null,
      autoImportSince: "2026-09-20T00:00:00.000Z",
    });
    const claimed = await claimPantryItems("u1", "r1", [1], "auto", queryFn);
    expect(claimed).toEqual([]);
  });

  it("auto не бронює чек із pantry_auto_declined_at", async () => {
    const { queryFn } = makeFakeDb({
      items: [{ id: 1, claimedAt: null }],
      purchasedAt: "2026-09-25T10:00:00.000Z",
      autoDeclinedAt: "2026-09-24T10:00:00.000Z",
      autoImportSince: "2026-09-20T00:00:00.000Z",
    });
    const claimed = await claimPantryItems("u1", "r1", [1], "auto", queryFn);
    expect(claimed).toEqual([]);
  });

  it("auto не бронює вже заброньовану позицію", async () => {
    const { queryFn } = makeFakeDb({
      items: [{ id: 1, claimedAt: "2026-09-24T10:00:00.000Z" }],
      purchasedAt: "2026-09-25T10:00:00.000Z",
      autoDeclinedAt: null,
      autoImportSince: "2026-09-20T00:00:00.000Z",
    });
    const claimed = await claimPantryItems("u1", "r1", [1], "auto", queryFn);
    expect(claimed).toEqual([]);
  });

  it("manual бронює повторно - навіть уже заброньовану позицію", async () => {
    const { queryFn } = makeFakeDb({
      items: [{ id: 1, claimedAt: "2026-09-24T10:00:00.000Z" }],
      purchasedAt: "2026-09-01T10:00:00.000Z",
      autoDeclinedAt: "2026-09-24T10:00:00.000Z",
      autoImportSince: "2026-09-20T00:00:00.000Z",
    });
    const claimed = await claimPantryItems("u1", "r1", [1], "manual", queryFn);
    expect(claimed).toEqual([1]);
  });

  it("claimedItemIds - числа, не bigint-рядки", async () => {
    const { queryFn } = makeFakeDb({
      items: [{ id: 42, claimedAt: null }],
      purchasedAt: "2026-09-25T10:00:00.000Z",
      autoDeclinedAt: null,
      autoImportSince: null,
    });
    const claimed = await claimPantryItems("u1", "r1", [42], "auto", queryFn);
    expect(claimed).toEqual([42]);
    expect(typeof claimed[0]).toBe("number");
  });
});

describe("releasePantryItems", () => {
  it("decline: true знімає бронювання і ставить pantry_auto_declined_at", async () => {
    const { queryFn, items, declined } = makeFakeDb({
      items: [{ id: 1, claimedAt: "2026-09-25T10:00:00.000Z" }],
      purchasedAt: "2026-09-25T10:00:00.000Z",
      autoDeclinedAt: null,
      autoImportSince: null,
    });
    await releasePantryItems("u1", "r1", [1], true, queryFn);
    expect(items.get(1)?.claimedAt).toBeNull();
    expect(declined()).not.toBeNull();
  });

  it("decline: false знімає бронювання, чек НЕ відхиляється", async () => {
    const { queryFn, items, declined } = makeFakeDb({
      items: [{ id: 1, claimedAt: "2026-09-25T10:00:00.000Z" }],
      purchasedAt: "2026-09-25T10:00:00.000Z",
      autoDeclinedAt: null,
      autoImportSince: null,
    });
    await releasePantryItems("u1", "r1", [1], false, queryFn);
    expect(items.get(1)?.claimedAt).toBeNull();
    expect(declined()).toBeNull();
  });
});
