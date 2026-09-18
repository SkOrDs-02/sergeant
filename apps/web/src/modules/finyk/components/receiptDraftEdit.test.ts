import { describe, expect, it } from "vitest";
import type { ReceiptDraft } from "@sergeant/api-client";
import {
  addBlankDraftItem,
  draftDateKey,
  removeDraftItem,
  updateDraftDate,
  updateDraftItem,
  updateDraftStore,
  updateDraftTotalKopiykas,
} from "./receiptDraftEdit";

function baseDraft(): ReceiptDraft {
  return {
    source: "vision",
    fiscalNum: null,
    store: "Сільпо",
    storeTaxId: null,
    purchasedAt: "2026-08-17T10:00:00.000Z",
    totalKopiykas: 15075,
    items: [
      {
        position: 1,
        name: "Хліб",
        qty: 2,
        priceKopiykas: 3000,
        sumKopiykas: 6000,
      },
      {
        position: 2,
        name: "Молоко",
        qty: 1,
        priceKopiykas: 9075,
        sumKopiykas: 9075,
      },
    ],
    confidence: 0.9,
    rawPayload: {},
  };
}

describe("updateDraftStore / updateDraftTotalKopiykas", () => {
  it("updates the store name without mutating the original draft", () => {
    const draft = baseDraft();
    const next = updateDraftStore(draft, "АТБ");
    expect(next.store).toBe("АТБ");
    expect(draft.store).toBe("Сільпо");
  });

  it("updates the total", () => {
    const next = updateDraftTotalKopiykas(baseDraft(), 20000);
    expect(next.totalKopiykas).toBe(20000);
  });
});

describe("draftDateKey / updateDraftDate", () => {
  it("derives the Kyiv calendar day from purchasedAt", () => {
    // 2026-08-16T22:30:00Z + Kyiv EEST (+3) → 2026-08-17 01:30 Kyiv
    const draft = { ...baseDraft(), purchasedAt: "2026-08-16T22:30:00.000Z" };
    expect(draftDateKey(draft)).toBe("2026-08-17");
  });

  it("round-trips a day-key edit back through draftDateKey", () => {
    const draft = updateDraftDate(baseDraft(), "2026-01-05");
    expect(draftDateKey(draft)).toBe("2026-01-05");
  });
});

describe("updateDraftItem / removeDraftItem / addBlankDraftItem", () => {
  it("patches only the targeted item, by index", () => {
    const next = updateDraftItem(baseDraft(), 0, { name: "Хліб бородинський" });
    expect(next.items[0]?.name).toBe("Хліб бородинський");
    expect(next.items[1]?.name).toBe("Молоко");
  });

  it("patches multiple fields at once", () => {
    const next = updateDraftItem(baseDraft(), 1, {
      qty: 2,
      priceKopiykas: 9000,
      sumKopiykas: 18000,
    });
    expect(next.items[1]).toMatchObject({
      qty: 2,
      priceKopiykas: 9000,
      sumKopiykas: 18000,
    });
  });

  it("removes an item by index, shifting the rest", () => {
    const next = removeDraftItem(baseDraft(), 0);
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.name).toBe("Молоко");
  });

  it("adds a blank item with the next free position", () => {
    const next = addBlankDraftItem(baseDraft());
    expect(next.items).toHaveLength(3);
    expect(next.items[2]).toMatchObject({
      position: 3,
      name: "",
      qty: 1,
      priceKopiykas: 0,
      sumKopiykas: 0,
    });
  });

  it("computes the next position from the max, not the count (handles gaps after removal)", () => {
    const withGap = removeDraftItem(baseDraft(), 0); // drops position 1, keeps position 2
    const next = addBlankDraftItem(withGap);
    expect(next.items[next.items.length - 1]?.position).toBe(3);
  });

  it("does not mutate the source draft", () => {
    const draft = baseDraft();
    const snapshot = JSON.parse(JSON.stringify(draft));
    updateDraftItem(draft, 0, { name: "x" });
    removeDraftItem(draft, 0);
    addBlankDraftItem(draft);
    expect(draft).toEqual(snapshot);
  });
});
