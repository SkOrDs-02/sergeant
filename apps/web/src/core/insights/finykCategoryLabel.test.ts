import { describe, expect, it } from "vitest";

import { finykExpenseCategoryLabel } from "./finykCategoryLabel";

const CUSTOM = [{ id: "cust_pets", label: "Улюбленці" }];

describe("finykExpenseCategoryLabel — спільний резолвер дайджесту й коуча", () => {
  it("ручний запис бере категорію з categoryId, а не падає в «Інше» через mcc 0", () => {
    expect(
      finykExpenseCategoryLabel(
        { id: "manual_1", manual: true, categoryId: "food", mcc: 0 },
        {},
        [],
      ),
    ).toBe("Продукти");
  });

  it("детальний слаг ручної форми зводиться до канонічного підпису", () => {
    // `cafe` немає в MCC-каталозі: без канонізації вийшла б друга позиція
    // з тією самою назвою.
    expect(
      finykExpenseCategoryLabel(
        { id: "manual_2", manual: true, categoryId: "cafe", mcc: 0 },
        {},
        [],
      ),
    ).toBe("Кафе та ресторани");
  });

  it("банківський рядок: MCC, потім ключове слово опису, потім «Інше»", () => {
    expect(finykExpenseCategoryLabel({ id: "b1", mcc: 5411 }, {}, [])).toBe(
      "Продукти",
    );
    expect(
      finykExpenseCategoryLabel(
        { id: "b2", mcc: 9999, description: "Сільпо" },
        {},
        [],
      ),
    ).toBe("Продукти");
    expect(
      finykExpenseCategoryLabel(
        { id: "b3", mcc: 9999, description: "Невідомий продавець" },
        {},
        [],
      ),
    ).toBe("Інше");
  });

  it("оверрайд користувача сильніший за MCC і за категорію ручного запису", () => {
    expect(
      finykExpenseCategoryLabel(
        { id: "b1", mcc: 5411 },
        { b1: "restaurant" },
        [],
      ),
    ).toBe("Кафе та ресторани");
    expect(
      finykExpenseCategoryLabel(
        { id: "manual_1", manual: true, categoryId: "food" },
        { manual_1: "transport" },
        [],
      ),
    ).toBe("Транспорт");
  });

  it("користувацька категорія віддає підпис, а не слаг", () => {
    expect(
      finykExpenseCategoryLabel(
        { id: "b1", mcc: 9999 },
        { b1: "cust_pets" },
        CUSTOM,
      ),
    ).toBe("Улюбленці");
    expect(
      finykExpenseCategoryLabel(
        { id: "manual_3", manual: true, categoryId: "cust_pets" },
        {},
        CUSTOM,
      ),
    ).toBe("Улюбленці");
  });

  it("categoryId банківського рядка навмисно не читається (розбивка банку не зсувається)", () => {
    expect(
      finykExpenseCategoryLabel(
        { id: "b1", mcc: 9999, description: "Невідомо", categoryId: "food" },
        {},
        [],
      ),
    ).toBe("Інше");
  });
});
