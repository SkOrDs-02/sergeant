import { describe, expect, it } from "vitest";
import {
  addTxTag,
  aggregateSpendingByTag,
  filterByTagKey,
  listTags,
  MAX_TAGS_PER_TX,
  normalizeTagInput,
  removeTagEverywhere,
  renameTagEverywhere,
  setTxTags,
  tagKey,
  TAG_MAX_LEN,
  type TxTagsMap,
} from "./tags.js";

const txs = [
  { id: "t1", amount: -10_000 },
  { id: "t2", amount: -5_000 },
  { id: "t3", amount: -2_000 },
  { id: "inc", amount: 50_000 },
];

describe("теги операцій (Р6)", () => {
  it("операція з тегами «а» і «б» рахується в обох", () => {
    const map: TxTagsMap = { t1: ["а", "б"], t2: ["б"], inc: ["а"] };
    expect(aggregateSpendingByTag(txs, map)).toEqual([
      { key: "б", label: "б", spentMinor: 15_000 },
      { key: "а", label: "а", spentMinor: 10_000 },
    ]);
  });

  it("excluded-set і спліти діють так само, як у підсумку періоду", () => {
    const map: TxTagsMap = { t1: ["а"], t2: ["а"] };
    expect(
      aggregateSpendingByTag(txs, map, {
        excludedTxIds: new Set(["t2"]),
        txSplits: { t1: [{ categoryId: "food", amount: 40 }] },
      }),
    ).toEqual([{ key: "а", label: "а", spentMinor: 4_000 }]);
  });

  it("«Відпустка» і « відпустка» - один тег з написанням першого вжитку", () => {
    expect(tagKey("Відпустка")).toBe(tagKey(" відпустка "));
    let map: TxTagsMap = setTxTags({}, "t1", addTxTag([], "Відпустка"));
    const known = listTags(map);
    map = setTxTags(map, "t2", addTxTag([], " відпустка ", known));
    expect(map["t2"]).toEqual(["Відпустка"]);
    expect(listTags(map)).toEqual([
      { key: "відпустка", label: "Відпустка", count: 2 },
    ]);
    expect(aggregateSpendingByTag(txs, map)).toHaveLength(1);
  });

  it("дубль на одній операції не додається, межі довжини й кількості", () => {
    expect(addTxTag(["Кава"], "кава ")).toEqual(["Кава"]);
    expect(normalizeTagInput("   ")).toBeNull();
    expect(normalizeTagInput("x".repeat(TAG_MAX_LEN + 5))).toHaveLength(
      TAG_MAX_LEN,
    );
    const full = Array.from({ length: MAX_TAGS_PER_TX }, (_, i) => `t${i}`);
    expect(addTxTag(full, "ще")).toBe(full);
  });

  it("перейменування змінює тег на всіх операціях", () => {
    const map: TxTagsMap = {
      t1: ["відпустка", "ремонт"],
      t2: ["ремонт"],
      t3: ["кава"],
    };
    const next = renameTagEverywhere(map, "ремонт", "Ремонт кухні");
    expect(next).toEqual({
      t1: ["відпустка", "Ремонт кухні"],
      t2: ["Ремонт кухні"],
      t3: ["кава"],
    });
    expect(renameTagEverywhere(map, "ремонт", "  ")).toBe(map);
  });

  it("перейменування в назву сусіднього тегу лишає на операції один", () => {
    const next = renameTagEverywhere({ t1: ["а", "б"] }, "б", "А");
    expect(next).toEqual({ t1: ["а"] });
  });

  it("видалення знімає тег з усіх операцій і прибирає порожні", () => {
    const map: TxTagsMap = { t1: ["а", "б"], t2: ["Б"] };
    expect(removeTagEverywhere(map, "б")).toEqual({ t1: ["а"] });
  });

  it("фільтр за тегом не залежить від регістру, null - усі операції", () => {
    const map: TxTagsMap = { t1: ["Відпустка"], t3: ["кава"] };
    expect(filterByTagKey(txs, map, "відпустка").map((t) => t.id)).toEqual([
      "t1",
    ]);
    expect(filterByTagKey(txs, map, null)).toBe(txs);
  });

  it("setTxTags з порожнім списком прибирає операцію з мапи", () => {
    expect(setTxTags({ t1: ["а"] }, "t1", [])).toEqual({});
  });
});
