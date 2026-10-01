/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Правила «Завжди так для цього магазину» (рішення власника 2026-10-01, «c2»):
 * пріоритет резолвера, ключ мерчанта, ефективна мапа для агрегаторів.
 */
import { describe, expect, it } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import { calcCategorySpent } from "./transactions";
import {
  getExpenseCategoryForTransaction,
  getIncomeCategoryForTransaction,
  resolveMerchantRuleCategory,
} from "./categories";
import { withMerchantRuleOverrides } from "./merchantRuleOverrides";
import {
  buildMerchantRuleIndex,
  findMerchantRule,
  merchantKeyOfTransaction,
  merchantRuleKindOf,
  merchantRuleLabelOf,
  sanitizeMerchantRule,
  sanitizeMerchantRules,
  type MerchantRule,
} from "./merchantRules";

function rule(over: Partial<MerchantRule> = {}): MerchantRule {
  return {
    id: "mr_1",
    kind: "expense",
    merchantKey: "сільпо",
    categoryId: "food",
    label: "Сільпо",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    ...over,
  };
}

function bankTx(
  id: string,
  description: string,
  over: Record<string, unknown> = {},
) {
  return { id, description, mcc: 0, amount: -10_000, ...over };
}

describe("ключ мерчанта — той самий normalizeMerchantKey", () => {
  it("«Сільпо №123» і «СІЛЬПО 45» — один мерчант", () => {
    expect(merchantKeyOfTransaction(bankTx("a", "Сільпо №123"))).toBe("сільпо");
    expect(merchantKeyOfTransaction(bankTx("b", "СІЛЬПО 45"))).toBe("сільпо");
  });

  it("опис без літер (номер картки) дає порожній ключ — правила не буде", () => {
    expect(merchantKeyOfTransaction(bankTx("a", "522119******5309"))).toBe("");
  });

  it("бік за знаком суми; нуль не належить жодному", () => {
    expect(merchantRuleKindOf({ amount: -1 })).toBe("expense");
    expect(merchantRuleKindOf({ amount: 1 })).toBe("income");
    expect(merchantRuleKindOf({ amount: 0 })).toBeNull();
    expect(merchantRuleKindOf({})).toBeNull();
  });

  it("підпис для списку правил не довший за ліміт і без зайвих пробілів", () => {
    expect(merchantRuleLabelOf({ description: "  АТБ   Маркет  " })).toBe(
      "АТБ Маркет",
    );
    const long = merchantRuleLabelOf({ description: "Ж".repeat(200) });
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("збережене правило → валідна форма", () => {
  it("відкидає порожні поля й сміття", () => {
    expect(sanitizeMerchantRule(null)).toBeNull();
    expect(sanitizeMerchantRule({ id: "x" })).toBeNull();
    expect(sanitizeMerchantRule(rule({ merchantKey: "  " }))).toBeNull();
    expect(sanitizeMerchantRule(rule({ categoryId: "" }))).toBeNull();
  });

  it("правило на «Внутрішній переказ» не існує за визначенням", () => {
    expect(
      sanitizeMerchantRule(rule({ categoryId: INTERNAL_TRANSFER_ID })),
    ).toBeNull();
  });

  it("невідомий бік → витрата; відсутній updatedAt → createdAt", () => {
    const parsed = sanitizeMerchantRule({
      id: "x",
      merchantKey: "атб",
      categoryId: "food",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed?.kind).toBe("expense");
    expect(parsed?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed?.label).toBe("атб");
  });

  it("список без дублів id", () => {
    expect(sanitizeMerchantRules([rule(), rule(), "сміття"])).toHaveLength(1);
    expect(sanitizeMerchantRules(undefined)).toEqual([]);
  });
});

describe("індекс: гонка двох пристроїв сходиться на одному переможці", () => {
  it("пізніший updatedAt виграє, незалежно від порядку", () => {
    const older = rule({ id: "mr_a", categoryId: "food" });
    const newer = rule({
      id: "mr_b",
      categoryId: "restaurant",
      updatedAt: "2026-10-02T10:00:00.000Z",
    });
    expect(
      buildMerchantRuleIndex([older, newer]).get("expense:сільпо")?.categoryId,
    ).toBe("restaurant");
    expect(
      buildMerchantRuleIndex([newer, older]).get("expense:сільпо")?.categoryId,
    ).toBe("restaurant");
  });

  it("за рівного updatedAt — менший id, незалежно від порядку", () => {
    const a = rule({ id: "mr_a", categoryId: "food" });
    const b = rule({ id: "mr_b", categoryId: "restaurant" });
    expect(buildMerchantRuleIndex([a, b]).get("expense:сільпо")?.id).toBe(
      "mr_a",
    );
    expect(buildMerchantRuleIndex([b, a]).get("expense:сільпо")?.id).toBe(
      "mr_a",
    );
  });

  it("витрата й надходження того самого мерчанта — окремі правила", () => {
    const index = buildMerchantRuleIndex([
      rule(),
      rule({ id: "mr_2", kind: "income", categoryId: "cashback" }),
    ]);
    expect(index.size).toBe(2);
  });
});

describe("findMerchantRule", () => {
  const index = buildMerchantRuleIndex([rule()]);

  it("знаходить за нормалізованим описом", () => {
    expect(findMerchantRule(index, bankTx("a", "Сільпо №7"))?.id).toBe("mr_1");
  });

  it("ручні записи правило не чіпає: їхня категорія — явний факт", () => {
    expect(
      findMerchantRule(index, bankTx("a", "Сільпо", { manual: true })),
    ).toBeNull();
    expect(
      findMerchantRule(index, bankTx("a", "Сільпо", { source: "manual" })),
    ).toBeNull();
  });

  it("правило витрати не діє на надходження того ж мерчанта", () => {
    expect(
      findMerchantRule(index, bankTx("a", "Сільпо", { amount: 5_000 })),
    ).toBeNull();
  });

  it("порожній індекс, порожній ключ, нульова сума — нічого", () => {
    expect(findMerchantRule(null, bankTx("a", "Сільпо"))).toBeNull();
    expect(findMerchantRule(index, bankTx("a", "12345"))).toBeNull();
    expect(
      findMerchantRule(index, bankTx("a", "Сільпо", { amount: 0 })),
    ).toBeNull();
  });
});

describe("резолвер витрат: пріоритет override > правило > слаг/MCC/слова", () => {
  const index = buildMerchantRuleIndex([
    rule({ merchantKey: "сільпо", categoryId: "restaurant" }),
  ]);

  it("правило сильніше за MCC і ключові слова", () => {
    // Без правила «Сільпо» + MCC 5411 — «Продукти».
    const tx = bankTx("a", "Сільпо", { mcc: 5411 });
    expect(getExpenseCategoryForTransaction(tx).id).toBe("food");
    expect(getExpenseCategoryForTransaction(tx, null, [], index).id).toBe(
      "restaurant",
    );
  });

  it("правило сильніше за серверний слаг (`categoryId` із вебхука)", () => {
    const tx = bankTx("a", "Сільпо", { mcc: 5411, categoryId: "food" });
    expect(getExpenseCategoryForTransaction(tx, null, [], index).id).toBe(
      "restaurant",
    );
  });

  it("явний override операції сильніший за правило", () => {
    const tx = bankTx("a", "Сільпо", { mcc: 5411 });
    expect(getExpenseCategoryForTransaction(tx, "health", [], index).id).toBe(
      "health",
    );
  });

  it("ручна витрата лишає власну категорію", () => {
    const manual = {
      description: "Сільпо",
      categoryId: "health",
      source: "manual",
      amount: -10_000,
    };
    expect(getExpenseCategoryForTransaction(manual, null, [], index).id).toBe(
      "health",
    );
  });

  it("без індексу поведінка не змінилась ні на йоту", () => {
    const tx = bankTx("a", "Сільпо", { mcc: 5411 });
    expect(getExpenseCategoryForTransaction(tx, null, []).id).toBe("food");
    expect(getExpenseCategoryForTransaction(tx, null, [], null).id).toBe(
      "food",
    );
    expect(getExpenseCategoryForTransaction(tx, null, [], new Map()).id).toBe(
      "food",
    );
  });

  it("правило на власну категорію працює; на видалену — мовчки не діє", () => {
    const custom = [{ id: "cus_kava", label: "Кава" }];
    const toCustom = buildMerchantRuleIndex([
      rule({ merchantKey: "сільпо", categoryId: "cus_kava" }),
    ]);
    const tx = bankTx("a", "Сільпо", { mcc: 5411, categoryId: "food" });
    expect(
      getExpenseCategoryForTransaction(tx, null, custom, toCustom).id,
    ).toBe("cus_kava");
    // Власну категорію видалили: слаг із вебхука не губиться.
    expect(getExpenseCategoryForTransaction(tx, null, [], toCustom).id).toBe(
      "food",
    );
  });
});

describe("резолвер надходжень", () => {
  const index = buildMerchantRuleIndex([
    rule({
      id: "mr_in",
      kind: "income",
      merchantKey: "rozetka",
      categoryId: "cashback",
    }),
  ]);

  it("правило надходження сильніше за ключові слова, слабше за override", () => {
    const tx = bankTx("a", "Rozetka повернення", { amount: 20_000 });
    expect(getIncomeCategoryForTransaction(tx, null, [], index).id).toBe(
      "cashback",
    );
    expect(getIncomeCategoryForTransaction(tx, "salary", [], index).id).toBe(
      "salary",
    );
  });

  it("правило витрати не зачіпає надходження, а правило надходження — витрати", () => {
    const expense = buildMerchantRuleIndex([rule()]);
    const income = bankTx("a", "Сільпо", { amount: 5_000 });
    expect(getIncomeCategoryForTransaction(income, null, [], expense).id).toBe(
      "other-income",
    );
    const spend = bankTx("b", "Rozetka", { mcc: 5732 });
    expect(getExpenseCategoryForTransaction(spend, null, [], index).id).toBe(
      "shopping",
    );
  });

  it("категорія правила, якої немає серед надходжень, не діє", () => {
    const wrong = buildMerchantRuleIndex([
      rule({
        id: "mr_x",
        kind: "income",
        merchantKey: "rozetka",
        categoryId: "restaurant",
      }),
    ]);
    const tx = bankTx("a", "Rozetka", { amount: 20_000 });
    expect(getIncomeCategoryForTransaction(tx, null, [], wrong).id).toBe(
      "other-income",
    );
  });
});

describe("withMerchantRuleOverrides — ефективна мапа для агрегаторів", () => {
  const index = buildMerchantRuleIndex([
    rule({ merchantKey: "сільпо", categoryId: "restaurant" }),
  ]);

  it("додає записи для операцій без override-а й не мутує вхід", () => {
    const explicit = { x: "health" };
    const txs = [bankTx("t1", "Сільпо"), bankTx("t2", "Інший магазин")];
    const effective = withMerchantRuleOverrides(txs, explicit, index);
    expect(effective).toEqual({ x: "health", t1: "restaurant" });
    expect(explicit).toEqual({ x: "health" });
  });

  it("явний override сильніший за правило", () => {
    const effective = withMerchantRuleOverrides(
      [bankTx("t1", "Сільпо")],
      { t1: "health" },
      index,
    );
    expect(effective).toEqual({ t1: "health" });
  });

  it("ручні записи й операції іншого боку пропускає", () => {
    const effective = withMerchantRuleOverrides(
      [
        bankTx("m", "Сільпо", { manual: true }),
        bankTx("i", "Сільпо", { amount: 500 }),
      ],
      {},
      index,
    );
    expect(effective).toEqual({});
  });

  it("повертає ТОЙ САМИЙ обʼєкт, коли правил немає або жодне не спрацювало", () => {
    const explicit = { a: "food" };
    expect(
      withMerchantRuleOverrides([bankTx("t", "Сільпо")], explicit, null),
    ).toBe(explicit);
    expect(
      withMerchantRuleOverrides([bankTx("t", "Невідомий")], explicit, index),
    ).toBe(explicit);
  });

  it("правило на видалену власну категорію не потрапляє в мапу", () => {
    const toCustom = buildMerchantRuleIndex([
      rule({ merchantKey: "сільпо", categoryId: "cus_zniklo" }),
    ]);
    expect(
      withMerchantRuleOverrides([bankTx("t1", "Сільпо")], {}, toCustom, []),
    ).toEqual({});
  });

  // Ключова обіцянка: ПОЗА списком (ліміти, аналітика) категорія та сама, що
  // в рядку, і вона діє на ВЖЕ наявні операції — «минуле» без перезапису даних.
  it("агрегатор бачить минулі операції в категорії правила й повертає їх, коли правило зникло", () => {
    const txs = [
      bankTx("t1", "Сільпо", { mcc: 5411 }),
      bankTx("t2", "Сільпо №2", { mcc: 5411, amount: -20_000 }),
      bankTx("t3", "АТБ", { mcc: 5411, amount: -5_000 }),
    ];
    const withRule = withMerchantRuleOverrides(txs, {}, index);
    expect(calcCategorySpent(txs, "restaurant", withRule)).toBe(300);
    expect(calcCategorySpent(txs, "food", withRule)).toBe(50);

    const noRule = withMerchantRuleOverrides(txs, {}, new Map());
    expect(calcCategorySpent(txs, "restaurant", noRule)).toBe(0);
    expect(calcCategorySpent(txs, "food", noRule)).toBe(350);
  });
});

describe("resolveMerchantRuleCategory — категорія самого правила (для списку в Налаштуваннях)", () => {
  it("витрата: вбудована, ручна таксономія й власна категорія", () => {
    expect(resolveMerchantRuleCategory("expense", "transport")?.id).toBe(
      "transport",
    );
    expect(
      resolveMerchantRuleCategory("expense", "custom-hobby", [
        { id: "custom-hobby", label: "Хобі" },
      ])?.label,
    ).toBe("Хобі");
  });

  it("надходження: канонічні id й власна категорія надходжень", () => {
    expect(resolveMerchantRuleCategory("income", "freelance")?.id).toBe(
      "freelance",
    );
    expect(
      resolveMerchantRuleCategory("income", "custom-rent", [
        { id: "custom-rent", label: "Оренда", kind: "income" },
      ])?.label,
    ).toBe("Оренда");
  });

  it("видалена власна категорія → null (правило не діє)", () => {
    expect(
      resolveMerchantRuleCategory("expense", "custom-gone", []),
    ).toBeNull();
    expect(resolveMerchantRuleCategory("income", "custom-gone", [])).toBeNull();
  });

  it("власна категорія ВИТРАТ не годиться для надходження", () => {
    expect(
      resolveMerchantRuleCategory("income", "custom-hobby", [
        { id: "custom-hobby", label: "Хобі" },
      ]),
    ).toBeNull();
  });
});
