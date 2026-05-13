/**
 * Status: Active.
 *
 * Unit tests для batch-prompt build + response parsing (PR-18).
 * Перевіряє: компактний JSON-shape input, толерантне parse-ing
 * code-fence-ів, partial-response handling, parse-fail → всі items
 * у `missing`, невалідна category → у `missing`.
 */

import { describe, it, expect } from "vitest";

import { buildBatchPrompt, parseBatchResponse } from "./batchPrompt.js";
import type { UnknownMccItem } from "./unknownQueue.js";

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

describe("buildBatchPrompt", () => {
  it("формує компактний JSON-array у `user` payload-і", () => {
    const items = [
      mkItem({ description: "shop a", amount: -2000, mcc: 5499 }),
      mkItem({ description: "shop b", amount: null, mcc: null }),
    ];
    const { system, user } = buildBatchPrompt(items);
    expect(system).toMatch(/Ukrainian personal finance/);
    expect(system).toMatch(/groceries.*transport.*dining/s);

    const parsed = JSON.parse(user);
    expect(parsed).toEqual([
      { i: 0, d: "shop a", a: "20.00", m: 5499 },
      { i: 1, d: "shop b" },
    ]);
  });

  it("сума у гривнях з двома знаками після коми, abs-value", () => {
    const { user } = buildBatchPrompt([
      mkItem({ amount: -54321 }), // -543.21 UAH
      mkItem({ amount: 7000 }), //   +70.00 UAH
    ]);
    const parsed = JSON.parse(user) as Array<{ a: string }>;
    expect(parsed[0]?.a).toBe("543.21");
    expect(parsed[1]?.a).toBe("70.00");
  });

  it("пустий items[] → пустий JSON-array", () => {
    const { user } = buildBatchPrompt([]);
    expect(JSON.parse(user)).toEqual([]);
  });
});

describe("parseBatchResponse — happy path", () => {
  it("парсить чистий JSON-array, мапить index → result", () => {
    const items = [mkItem({ queueId: 10 }), mkItem({ queueId: 20 })];
    const raw =
      '[{"i":0,"c":"groceries","conf":0.9},{"i":1,"c":"transport","conf":0.8}]';
    const { ok, missing } = parseBatchResponse(raw, items);

    expect(missing).toEqual([]);
    expect(ok.size).toBe(2);
    expect(ok.get(0)).toEqual({ category: "groceries", confidence: 0.9 });
    expect(ok.get(1)).toEqual({ category: "transport", confidence: 0.8 });
  });

  it("толерантне до ```json … ``` markdown-fencing-у", () => {
    const items = [mkItem()];
    const raw = '```json\n[{"i":0,"c":"dining","conf":0.7}]\n```\nDone.';
    const { ok, missing } = parseBatchResponse(raw, items);
    expect(missing).toEqual([]);
    expect(ok.get(0)).toEqual({ category: "dining", confidence: 0.7 });
  });

  it("толерантне до 'розмов навколо' — шукає перший JSON-array у тексті", () => {
    const items = [mkItem()];
    const raw =
      'Here you go: [{"i":0,"c":"shopping","conf":0.5}] — let me know.';
    const { ok } = parseBatchResponse(raw, items);
    expect(ok.get(0)).toEqual({ category: "shopping", confidence: 0.5 });
  });

  it("clamp-ить confidence у [0,1]", () => {
    const items = [mkItem(), mkItem({ queueId: 2 })];
    const raw =
      '[{"i":0,"c":"groceries","conf":1.7},{"i":1,"c":"transport","conf":-0.4}]';
    const { ok } = parseBatchResponse(raw, items);
    expect(ok.get(0)?.confidence).toBe(1);
    expect(ok.get(1)?.confidence).toBe(0);
  });

  it("conf відсутній → 0", () => {
    const items = [mkItem()];
    const raw = '[{"i":0,"c":"utilities"}]';
    const { ok } = parseBatchResponse(raw, items);
    expect(ok.get(0)).toEqual({ category: "utilities", confidence: 0 });
  });
});

describe("parseBatchResponse — partial / missing", () => {
  it("items без index-у у response потрапляють у `missing`", () => {
    const items = [
      mkItem({ queueId: 10, monoTxId: "a" }),
      mkItem({ queueId: 20, monoTxId: "b" }),
      mkItem({ queueId: 30, monoTxId: "c" }),
    ];
    // Claude забув про index=1
    const raw =
      '[{"i":0,"c":"groceries","conf":0.9},{"i":2,"c":"transport","conf":0.8}]';
    const { ok, missing } = parseBatchResponse(raw, items);
    expect(ok.size).toBe(2);
    expect(ok.has(1)).toBe(false);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.monoTxId).toBe("b");
  });

  it("невалідна category у entry → item у missing", () => {
    const items = [mkItem()];
    const raw = '[{"i":0,"c":"not-a-category","conf":0.9}]';
    const { ok, missing } = parseBatchResponse(raw, items);
    expect(ok.size).toBe(0);
    expect(missing).toHaveLength(1);
  });

  it("index поза range → item з відсутнім index у missing", () => {
    const items = [mkItem()];
    const raw = '[{"i":99,"c":"groceries","conf":1.0}]';
    const { ok, missing } = parseBatchResponse(raw, items);
    expect(ok.size).toBe(0);
    expect(missing).toHaveLength(1);
  });

  it("дублікати index-у — останній виграє, без duplicates у missing", () => {
    const items = [mkItem(), mkItem({ queueId: 2 })];
    const raw =
      '[{"i":0,"c":"groceries","conf":0.5},{"i":0,"c":"transport","conf":0.9},{"i":1,"c":"dining","conf":0.7}]';
    const { ok, missing } = parseBatchResponse(raw, items);
    // ok.get(0) — останнє значення (transport).
    expect(ok.get(0)).toEqual({ category: "transport", confidence: 0.9 });
    expect(ok.get(1)).toEqual({ category: "dining", confidence: 0.7 });
    expect(missing).toEqual([]);
  });
});

describe("parseBatchResponse — parse-fail fallback", () => {
  it("повністю невалідний text → всі items у missing", () => {
    const items = [mkItem(), mkItem({ queueId: 2 })];
    const { ok, missing } = parseBatchResponse("oops", items);
    expect(ok.size).toBe(0);
    expect(missing).toHaveLength(2);
  });

  it("JSON-array з malformed-syntax → всі items у missing", () => {
    const items = [mkItem(), mkItem({ queueId: 2 })];
    const { ok, missing } = parseBatchResponse("[not json]", items);
    expect(ok.size).toBe(0);
    expect(missing).toHaveLength(2);
  });

  it("response — JSON-object, а не array → всі items у missing", () => {
    const items = [mkItem()];
    const raw = '{"i":0,"c":"groceries","conf":0.9}';
    const { ok, missing } = parseBatchResponse(raw, items);
    expect(ok.size).toBe(0);
    expect(missing).toHaveLength(1);
  });

  it("пустий response → пустий ok, всі items у missing", () => {
    const items = [mkItem()];
    const { ok, missing } = parseBatchResponse("", items);
    expect(ok.size).toBe(0);
    expect(missing).toHaveLength(1);
  });
});
