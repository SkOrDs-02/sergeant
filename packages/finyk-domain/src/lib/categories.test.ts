import { describe, expect, it } from "vitest";
import { getCategory, getExpenseCategoryForTransaction } from "./categories";

describe("getCategory — поповнення банки", () => {
  // Звіт власника 2026-10-01: «Поповнення «На закриття боргів🙏»» −72,35
  // отримало «Борги та кредити», бо «боргів» ⊃ «борг» — ключове слово
  // зловило ІМʼЯ чужої банки, а не опис покупки.
  it.each([
    "Поповнення «На закриття боргів🙏»",
    "поповнення «позика»",
    "Поповнення банки «Кредит на авто»",
    "Поповнення “Погашення боргу”",
    '  Поповнення "Loan"',
  ])("«%s» не матчить ключові слова за імʼям банки → «Інше»", (desc) => {
    expect(getCategory(desc, 0).id).toBe("other");
    // 4829 — MCC «переказ коштів»: категорії в нього немає (журнал 2026-09-12).
    expect(getCategory(desc, 4829).id).toBe("other");
  });

  it("ключові слова борг/кредит працюють, коли опис не поповнення банки", () => {
    expect(getCategory("Погашення кредиту", 0).id).toBe("debt");
    expect(getCategory("Оплата боргу", 0).id).toBe("debt");
    expect(getCategory("Поповнення: борг Івану", 0).id).toBe("debt");
    // «Поповнення» без лапок — не імʼя банки: слово «кредит» у ньому моє.
    expect(getCategory("Поповнення кредитної картки", 0).id).toBe("debt");
  });

  it("MCC-мапа працює як і раніше: захищено лише матч за словами", () => {
    expect(getCategory("Поповнення «На закриття боргів🙏»", 6012).id).toBe(
      "debt",
    );
  });

  it("ручна перекатегоризація має найвищий пріоритет", () => {
    expect(getCategory("Поповнення «На закриття боргів🙏»", 0, "debt").id).toBe(
      "debt",
    );
    expect(getCategory("Поповнення «На закриття боргів🙏»", 0, "food").id).toBe(
      "food",
    );
  });

  it("транзакція з таким описом лишається в «Інше» і через getExpenseCategoryForTransaction", () => {
    const category = getExpenseCategoryForTransaction({
      description: "Поповнення «На закриття боргів🙏»",
      mcc: 0,
    });
    expect(category.id).toBe("other");
    expect(category.label).toBe("Інше");
  });
});
