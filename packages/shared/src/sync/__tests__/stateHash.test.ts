import { describe, expect, it } from "vitest";
import {
  compareUtf8,
  computeStateHash,
  isSyncStateHashTable,
  joinStateHashPk,
  stateHashLine,
  toStateHashMs,
  type StateHashRow,
} from "../stateHash";

const EMPTY_SHA =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// Golden-вектор ADR-0106 §1. Очікувані хеші пораховано НЕЗАЛЕЖНО через
// `node:crypto` і `Buffer.compare` (сортування за байтами UTF-8), не цим
// кодом. Набір навмисно містить: tombstone, складений PK, кирилицю,
// символ BMP вище за сурогати (U+FF5A) і символ поза BMP (U+1F600) —
// у порядку UTF-16 емодзі стояв би ПЕРЕД U+FF5A, у порядку UTF-8 — після.
// Зміна будь-якого числа тут = зміна контракту клієнт↔сервер.
const GOLDEN_ROWS: StateHashRow[] = [
  { pk: "w-b", updated_at_ms: 1700000000123, deleted_at_ms: null },
  { pk: "w-a", updated_at_ms: 1700000000000, deleted_at_ms: 1700000005000 },
  {
    pk: joinStateHashPk(["user-1", "2026-10-01"]),
    updated_at_ms: 1700000001999,
    deleted_at_ms: null,
  },
  { pk: "ї-кирилиця", updated_at_ms: 1, deleted_at_ms: null },
  { pk: "ｚ-fullwidth", updated_at_ms: 2, deleted_at_ms: null },
  { pk: "\u{1F600}-emoji", updated_at_ms: 3, deleted_at_ms: 4 },
  { pk: "Z-upper", updated_at_ms: 5, deleted_at_ms: null },
];

const GOLDEN_TOTAL =
  "3dcc62bb80d17196f2322ee22960eaac035a9ee1ca37a4bc52eaca734a1c3ddf";

const GOLDEN_BUCKETS: Record<number, { hash: string; count: number }> = {
  0: {
    hash: "916b494bbc8ae1b0ed4c9923c129b79728a89dc166a27968f1f28fdd5248da28",
    count: 1,
  },
  4: {
    hash: "3fec1b5d3e367b37abddc80bbea657f2b3c7aa041d9cd7665e87d39e0e4eadc1",
    count: 2,
  },
  9: {
    hash: "d0f52e54ace87f4a23dd8269ee7d6659b4ce88b86ceab60a84e5a75e8f9e74ff",
    count: 1,
  },
  10: {
    hash: "7c8a3476369ffac47171b994edf7fc03b63bdfad3daf43b86ad4b3bb06259d22",
    count: 1,
  },
  14: {
    hash: "d6096f11a59c21e0b9cfa56598cfc383fd90f4d9b080fac9d4141dd8a36f3a75",
    count: 2,
  },
};

describe("computeStateHash — golden-вектор", () => {
  it("загальний хеш і кошики збігаються з незалежно порахованими", () => {
    const result = computeStateHash(GOLDEN_ROWS);
    expect(result.total).toEqual({ hash: GOLDEN_TOTAL, count: 7 });
    expect(result.buckets).toHaveLength(16);
    for (const b of result.buckets) {
      expect(b).toEqual({
        bucket: b.bucket,
        ...(GOLDEN_BUCKETS[b.bucket] ?? { hash: EMPTY_SHA, count: 0 }),
      });
    }
    expect(result.buckets.map((b) => b.bucket)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it("не залежить від порядку вхідних рядків", () => {
    const reversed = computeStateHash([...GOLDEN_ROWS].reverse());
    expect(reversed.total.hash).toBe(GOLDEN_TOTAL);
  });

  it("порожня таблиця — хеш порожнього рядка", () => {
    const result = computeStateHash([]);
    expect(result.total).toEqual({ hash: EMPTY_SHA, count: 0 });
    expect(result.buckets.every((b) => b.hash === EMPTY_SHA)).toBe(true);
  });

  it("tombstone і updated_at змінюють хеш", () => {
    const base = computeStateHash(GOLDEN_ROWS).total.hash;
    const revived = GOLDEN_ROWS.map((r) =>
      r.pk === "w-a" ? { ...r, deleted_at_ms: null } : r,
    );
    expect(computeStateHash(revived).total.hash).not.toBe(base);
    const bumped = GOLDEN_ROWS.map((r) =>
      r.pk === "w-b" ? { ...r, updated_at_ms: r.updated_at_ms + 1 } : r,
    );
    expect(computeStateHash(bumped).total.hash).not.toBe(base);
  });

  it("дублікат pk — помилка", () => {
    const row = GOLDEN_ROWS[0]!;
    expect(() => computeStateHash([row, row])).toThrow(/дублікат/);
  });
});

describe("допоміжне", () => {
  it("рядок входу: порожній deleted_at для живого рядка", () => {
    expect(
      stateHashLine({ pk: "a", updated_at_ms: 10, deleted_at_ms: null }),
    ).toBe("a\u001f10\u001f\n");
    expect(
      stateHashLine({ pk: "a", updated_at_ms: 10, deleted_at_ms: 0 }),
    ).toBe("a\u001f10\u001f0\n");
  });

  it("нецілий час відхиляється", () => {
    expect(() =>
      stateHashLine({ pk: "a", updated_at_ms: 1.5, deleted_at_ms: null }),
    ).toThrow();
  });

  it("toStateHashMs відкидає субмілісекунди вниз", () => {
    expect(toStateHashMs("2025-10-01T00:00:00.123Z")).toBe(1759276800123);
    expect(toStateHashMs(new Date(1759276800123))).toBe(1759276800123);
    expect(toStateHashMs(1759276800123.9)).toBe(1759276800123);
    expect(() => toStateHashMs("не дата")).toThrow();
  });

  it("compareUtf8 — порядок кодових точок, а не UTF-16", () => {
    expect(compareUtf8("\u{1F600}", "ｚ")).toBe(1);
    expect("\u{1F600}" < "ｚ").toBe(true); // UTF-16 дав би протилежне
    expect(compareUtf8("a", "ab")).toBe(-1);
    expect(compareUtf8("Z", "a")).toBe(-1);
    expect(compareUtf8("ab", "ab")).toBe(0);
  });

  it("allowlist: Фізрук і Рутина без PN-лічильника й append-only", () => {
    expect(isSyncStateHashTable("fizruk_workouts")).toBe(true);
    expect(isSyncStateHashTable("routine_habit_skips")).toBe(true);
    expect(isSyncStateHashTable("routine_streaks")).toBe(false);
    expect(isSyncStateHashTable("routine_completion_events")).toBe(false);
    expect(isSyncStateHashTable("nutrition_meals")).toBe(false);
    expect(isSyncStateHashTable("constructor")).toBe(false);
    expect(isSyncStateHashTable(42)).toBe(false);
  });
});
