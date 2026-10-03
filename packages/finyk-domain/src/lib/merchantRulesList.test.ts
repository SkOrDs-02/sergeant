/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Зміни списку правил мерчантів: створення, оновлення, видалення, скасування.
 */
import { describe, expect, it } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import {
  MERCHANT_RULES_LIMIT,
  applyMerchantRule,
  removeMerchantRule,
  restoreMerchantRules,
  revertMerchantRuleChange,
  type MerchantRule,
} from "./merchantRules";

const NOW = "2026-10-01T12:00:00.000Z";
let seq = 0;
const ctx = { now: NOW, newId: () => `mr_${++seq}` };

function rule(over: Partial<MerchantRule> = {}): MerchantRule {
  return {
    id: "mr_a",
    kind: "expense",
    merchantKey: "сільпо",
    categoryId: "food",
    label: "Сільпо",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

const INPUT = {
  kind: "expense" as const,
  merchantKey: "сільпо",
  categoryId: "restaurant",
  label: "  Сільпо   №7 ",
};

describe("applyMerchantRule — створення й оновлення", () => {
  it("створює нове правило з id, часом і чистим підписом", () => {
    const change = applyMerchantRule([], INPUT, ctx);
    expect(change?.previous).toBeNull();
    expect(change?.rule).toMatchObject({
      kind: "expense",
      merchantKey: "сільпо",
      categoryId: "restaurant",
      label: "Сільпо №7",
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(change?.rule.id).toMatch(/^mr_/);
    expect(change?.list).toEqual([change?.rule]);
  });

  it("повторний «Завжди так» для того ж мерчанта оновлює правило, а не дублює", () => {
    const existing = rule();
    const change = applyMerchantRule([existing], INPUT, ctx);
    expect(change?.list).toHaveLength(1);
    expect(change?.rule.id).toBe("mr_a");
    expect(change?.rule.categoryId).toBe("restaurant");
    expect(change?.rule.updatedAt).toBe(NOW);
    expect(change?.rule.createdAt).toBe("2026-09-01T00:00:00.000Z");
    expect(change?.previous).toEqual(existing);
  });

  it("зводить дубль від другого пристрою в одне правило", () => {
    const winner = rule({ id: "mr_a", updatedAt: "2026-09-02T00:00:00.000Z" });
    const loser = rule({ id: "mr_b", updatedAt: "2026-09-01T00:00:00.000Z" });
    const change = applyMerchantRule([loser, winner], INPUT, ctx);
    expect(change?.list).toHaveLength(1);
    expect(change?.rule.id).toBe("mr_a");
  });

  it("витрата й надходження того ж мерчанта — різні правила", () => {
    const change = applyMerchantRule(
      [rule()],
      { ...INPUT, kind: "income", categoryId: "cashback" },
      ctx,
    );
    expect(change?.list).toHaveLength(2);
    expect(change?.previous).toBeNull();
  });

  it.each([
    ["порожній ключ", { ...INPUT, merchantKey: "  " }],
    ["порожня категорія", { ...INPUT, categoryId: "" }],
    ["внутрішній переказ", { ...INPUT, categoryId: INTERNAL_TRANSFER_ID }],
  ])("відхиляє: %s", (_name, input) => {
    expect(applyMerchantRule([], input, ctx)).toBeNull();
  });

  it("порожній підпис → ключ; довгий підпис обрізається", () => {
    expect(
      applyMerchantRule([], { ...INPUT, label: "   " }, ctx)?.rule.label,
    ).toBe("сільпо");
    expect(
      applyMerchantRule([], { ...INPUT, label: "Ж".repeat(300) }, ctx)?.rule
        .label.length,
    ).toBe(80);
  });

  it("ліміт правил: нове відхиляється, оновлення наявного — ні", () => {
    const full = Array.from({ length: MERCHANT_RULES_LIMIT }, (_, i) =>
      rule({ id: `mr_${i}`, merchantKey: `мерчант${i}` }),
    );
    expect(applyMerchantRule(full, INPUT, ctx)).toBeNull();
    const update = applyMerchantRule(
      full,
      { ...INPUT, merchantKey: "мерчант3" },
      ctx,
    );
    expect(update?.list).toHaveLength(MERCHANT_RULES_LIMIT);
  });
});

describe("revertMerchantRuleChange — скасування створення й оновлення", () => {
  it("створення: правило зникає", () => {
    const change = applyMerchantRule([], INPUT, ctx)!;
    expect(revertMerchantRuleChange(change.list, change)).toEqual([]);
  });

  it("оновлення: повертається попередня категорія", () => {
    const existing = rule();
    const change = applyMerchantRule([existing], INPUT, ctx)!;
    const reverted = revertMerchantRuleChange(change.list, change);
    expect(reverted).toEqual([existing]);
  });
});

describe("removeMerchantRule / restoreMerchantRules — видалення зі списку налаштувань", () => {
  it("видаляє правило і всі його дублі за ключем; решту лишає", () => {
    const a = rule({ id: "mr_a" });
    const dup = rule({ id: "mr_b" });
    const other = rule({ id: "mr_c", merchantKey: "атб" });
    const { list, removed } = removeMerchantRule([a, dup, other], "mr_a");
    expect(list).toEqual([other]);
    expect(removed).toEqual([a, dup]);
  });

  it("невідомий id нічого не міняє", () => {
    const a = rule();
    expect(removeMerchantRule([a], "немає")).toEqual({
      list: [a],
      removed: [],
    });
  });

  it("скасування повертає видалене один раз, навіть при повторному виклику", () => {
    const a = rule();
    const { list, removed } = removeMerchantRule([a], "mr_a");
    const restored = restoreMerchantRules(list, removed);
    expect(restored).toEqual([a]);
    expect(restoreMerchantRules(restored, removed)).toEqual([a]);
  });
});
