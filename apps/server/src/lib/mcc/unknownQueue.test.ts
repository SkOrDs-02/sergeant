/**
 * Status: Active.
 *
 * Unit tests для in-memory unknown-MCC буфер-у (PR-18).
 * Перевіряє FIFO-порядок, overflow protection, returnToBuffer, idempotency
 * drain-у на порожньому буфер-і.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../obs/metrics.js", () => ({
  monoMccBufferDepth: { set: vi.fn() },
}));

import {
  enqueueUnknownMcc,
  drainBatch,
  returnToBuffer,
  currentBufferSize,
  __resetForTests,
  type UnknownMccItem,
} from "./unknownQueue.js";

function mkItem(overrides: Partial<UnknownMccItem> = {}): UnknownMccItem {
  return {
    queueId: 1,
    userId: "u1",
    monoTxId: "tx_001",
    description: "shop",
    amount: -12500,
    mcc: 5499,
    enqueuedAt: 1_700_000_000_000,
    attempts: 0,
    ...overrides,
  };
}

describe("unknownQueue — enqueue / drain", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("повертає 0 елементів і isEmpty=true на старті", () => {
    expect(currentBufferSize()).toBe(0);
    expect(drainBatch(10)).toEqual([]);
  });

  it("enqueue → drain зберігає FIFO-порядок", () => {
    const a = mkItem({ queueId: 1, monoTxId: "a" });
    const b = mkItem({ queueId: 2, monoTxId: "b" });
    const c = mkItem({ queueId: 3, monoTxId: "c" });

    expect(enqueueUnknownMcc(a, 100)).toBe(true);
    expect(enqueueUnknownMcc(b, 100)).toBe(true);
    expect(enqueueUnknownMcc(c, 100)).toBe(true);
    expect(currentBufferSize()).toBe(3);

    const drained = drainBatch(10);
    expect(drained.map((i) => i.monoTxId)).toEqual(["a", "b", "c"]);
    expect(currentBufferSize()).toBe(0);
  });

  it("drainBatch(maxSize) забирає максимум maxSize, лишок чекає", () => {
    for (let i = 0; i < 5; i += 1) {
      enqueueUnknownMcc(mkItem({ queueId: i, monoTxId: `tx_${i}` }), 100);
    }
    const first = drainBatch(3);
    expect(first).toHaveLength(3);
    expect(first.map((i) => i.monoTxId)).toEqual(["tx_0", "tx_1", "tx_2"]);
    expect(currentBufferSize()).toBe(2);

    const second = drainBatch(10);
    expect(second.map((i) => i.monoTxId)).toEqual(["tx_3", "tx_4"]);
    expect(currentBufferSize()).toBe(0);
  });

  it("drainBatch(0) повертає [] не дренуючи нічого", () => {
    enqueueUnknownMcc(mkItem(), 100);
    expect(drainBatch(0)).toEqual([]);
    expect(currentBufferSize()).toBe(1);
  });

  it("drainBatch(negative) повертає [] не дренуючи нічого", () => {
    enqueueUnknownMcc(mkItem(), 100);
    expect(drainBatch(-5)).toEqual([]);
    expect(currentBufferSize()).toBe(1);
  });
});

describe("unknownQueue — overflow protection", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("повертає false коли буфер досягає softCap × 10 (hard cap)", () => {
    const softCap = 5;
    // Hard cap = 50. Заповнюємо 50 → 51-й має повернути false.
    for (let i = 0; i < softCap * 10; i += 1) {
      expect(enqueueUnknownMcc(mkItem({ queueId: i }), softCap)).toBe(true);
    }
    expect(currentBufferSize()).toBe(softCap * 10);
    expect(enqueueUnknownMcc(mkItem({ queueId: 999 }), softCap)).toBe(false);
    // 999 НЕ додався — розмір не виріс.
    expect(currentBufferSize()).toBe(softCap * 10);
  });

  it("hard cap залежить від softCap аргумента", () => {
    // softCap=2 → hardCap=20
    for (let i = 0; i < 20; i += 1) {
      enqueueUnknownMcc(mkItem({ queueId: i }), 2);
    }
    expect(enqueueUnknownMcc(mkItem({ queueId: 100 }), 2)).toBe(false);
    expect(currentBufferSize()).toBe(20);
  });
});

describe("unknownQueue — returnToBuffer", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("returnToBuffer додає items НА ПОЧАТОК (LIFO відносно нових)", () => {
    const a = mkItem({ queueId: 1, monoTxId: "a" });
    const b = mkItem({ queueId: 2, monoTxId: "b" });
    const c = mkItem({ queueId: 3, monoTxId: "c" });

    enqueueUnknownMcc(c, 100);
    returnToBuffer([a, b]);

    const drained = drainBatch(10);
    // a, b повернулися ВПЕРЕД (вони були ранішими у часі), c лишився за ними.
    expect(drained.map((i) => i.monoTxId)).toEqual(["a", "b", "c"]);
  });

  it("returnToBuffer([]) — no-op, не змінює розмір", () => {
    enqueueUnknownMcc(mkItem(), 100);
    returnToBuffer([]);
    expect(currentBufferSize()).toBe(1);
  });
});

describe("unknownQueue — idempotency для tests", () => {
  beforeEach(() => {
    __resetForTests();
  });

  it("__resetForTests() очищає буфер між кейсами", () => {
    enqueueUnknownMcc(mkItem(), 100);
    enqueueUnknownMcc(mkItem(), 100);
    expect(currentBufferSize()).toBe(2);
    __resetForTests();
    expect(currentBufferSize()).toBe(0);
    expect(drainBatch(10)).toEqual([]);
  });
});
