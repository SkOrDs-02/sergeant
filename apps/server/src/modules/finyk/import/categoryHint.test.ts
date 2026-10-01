import { describe, expect, it } from "vitest";
import {
  mapBankCategory,
  mapDescription,
  mapMccCell,
  resolveCategoryHint,
} from "./categoryHint.js";

describe("mapBankCategory — назви з живого Privat24-XLSX", () => {
  // Рівно ті рядки, що стоять у колонці «Категорія» реального експорту
  // (2026-08-25) — тест фіксує їх дослівно, бо саме на них фіча й міряна.
  const REAL: ReadonlyArray<[string, string | null]> = [
    ["Супермаркети та продукти", "food"],
    ["Ресторани, кафе, бари", "cafe"],
    ["Аптеки", "health"],
    ["Таксі", "transport"],
    ["Одяг та взуття", "shopping"],
    // З 2026-10-01 є власна категорія «Дім і ремонт» — доти це були «Покупки».
    ["Дім та ремонт", "home"],
    ["Цифрові товари", "subscriptions"],
    // «Платежі за реквізитами» і «Інше» осмисленого чипа не мають —
    // краще лишити дефолт, ніж вгадати навмання.
    ["Платежі за реквізитами", null],
    ["Інше", null],
  ];

  it.each(REAL)("«%s» → %s", (label, expected) => {
    expect(mapBankCategory(label, "expense")).toBe(expected);
  });

  it("толерує регістр і зайві пробіли", () => {
    expect(mapBankCategory("  СУПЕРМАРКЕТИ   та Продукти ", "expense")).toBe(
      "food",
    );
  });

  it("не підсовує витратний слаг у рядок доходу", () => {
    // Інакше чип просто не намалювався б: набори витрат і надходжень різні.
    expect(mapBankCategory("Супермаркети та продукти", "income")).toBeNull();
  });

  it("мапить надходження у власну таксономію", () => {
    expect(mapBankCategory("Зарплата", "income")).toBe("salary");
    expect(mapBankCategory("Кешбек", "income")).toBe("cashback");
    // …і не тягне їх у витрати.
    expect(mapBankCategory("Зарплата", "expense")).toBeNull();
  });
});

describe("mapMccCell — колонка МСС виписки mono", () => {
  it("5411 (супермаркет) → Продукти", () => {
    expect(mapMccCell("5411")).toBe("food");
  });

  it("5812 (ресторан) → чип «Кафе», не каталожний id «restaurant»", () => {
    // Каталог MCC і ручний пікер мають різні id для того самого кошика;
    // без мосту сюди приїхав би слаг, якого пікер не знає.
    expect(mapMccCell("5812")).toBe("cafe");
  });

  it("порожня клітинка й сміття не дають підказки", () => {
    expect(mapMccCell("")).toBeNull();
    expect(mapMccCell("—")).toBeNull();
    expect(mapMccCell("0")).toBeNull();
  });

  it("6012 (погашення кредиту) → Борги та кредити (фікс 2026-09-11)", () => {
    expect(mapMccCell("6012")).toBe("debt");
  });

  // П'ять категорій 2026-10-01: усі є чипами пікера під тим самим id.
  it.each([
    ["4814", "telecom"],
    ["4812", "telecom"],
    ["4816", "telecom"],
    ["5200", "home"],
    ["5712", "home"],
    ["742", "pets"],
    ["5995", "pets"],
    ["5947", "gifts"],
    ["5992", "gifts"],
  ])("MCC %s → чип «%s»", (mcc, slug) => {
    expect(mapMccCell(mcc)).toBe(slug);
  });

  it("4829 (переказ) каталог мовчить навмисно: його читає резолвер із описом", () => {
    expect(mapMccCell("4829")).toBeNull();
  });
});

describe("нові категорії — назви з кабінету банку", () => {
  it.each([
    ["Звʼязок", "telecom"],
    ["Мобільний звʼязок та інтернет", "telecom"],
    ["Інтернет", "telecom"],
    ["Дім та ремонт", "home"],
    ["Меблі", "home"],
    ["Зоотовари", "pets"],
    ["Тварини", "pets"],
    ["Подарунки", "gifts"],
    ["Квіти", "gifts"],
    // Комуналка лишилась окремою.
    ["Комунальні послуги", "utilities"],
    // Побутова техніка — не ремонт і не меблі.
    ["Побутова техніка та ремонт", "shopping"],
  ])("«%s» → %s", (label, slug) => {
    expect(mapBankCategory(label, "expense")).toBe(slug);
  });

  it("«Подарунок» у доході лишається подарунком-надходженням, а не null", () => {
    expect(mapBankCategory("Подарунок", "income")).toBe("gift");
  });
});

describe("p2p-перекази: код 4829 + опис", () => {
  it("переказ людині (4829) → «Перекази людям»", () => {
    expect(
      resolveCategoryHint({
        direction: "expense",
        mcc: "4829",
        description: "Іван Петренко",
      }),
    ).toBe("p2p_transfer");
  });

  it("поповнення чужої банки (4829) — рішення 4Б, перекази людям", () => {
    expect(
      resolveCategoryHint({
        direction: "expense",
        mcc: "4829",
        description: "Поповнення «Відпустка»",
      }),
    ).toBe("p2p_transfer");
  });

  it("власний доказ в описі сильніший за код переказу", () => {
    expect(
      resolveCategoryHint({
        direction: "expense",
        mcc: "4829",
        description: "Погашення кредиту",
      }),
    ).toBe("debt");
    expect(
      resolveCategoryHint({
        direction: "expense",
        mcc: "4829",
        description: "lifecell",
      }),
    ).toBe("telecom");
  });

  it("без MCC-колонки лишається за описом: «Переказ на картку» → p2p", () => {
    expect(mapDescription("Переказ на картку", "expense")).toBe("p2p_transfer");
  });

  it("код 4829 у доході підказки не дає (перекази людям — категорія витрат)", () => {
    expect(
      resolveCategoryHint({
        direction: "income",
        mcc: "4829",
        description: "Іван Петренко",
      }),
    ).toBeNull();
  });
});

describe("нові категорії — опис мерчанта", () => {
  it.each([
    ["lifecell", "telecom"],
    ["Київстар", "telecom"],
    ["Епіцентр К", "home"],
    ["MasterZoo", "pets"],
    ["Квіти", "gifts"],
  ])("«%s» → %s", (desc, slug) => {
    expect(mapDescription(desc, "expense")).toBe(slug);
  });
});

describe("mapDescription — ключові слова мерчанта", () => {
  it("впізнає мерчантів із каталогу домену", () => {
    expect(mapDescription("Сільпо", "expense")).toBe("food");
    expect(mapDescription("McDonald’s", "expense")).toBe("cafe");
    expect(mapDescription("Uklon таксі", "expense")).toBe("transport");
  });

  it("невідомий мерчант підказки не дає", () => {
    expect(mapDescription("FLAMPIC, ID платежу: 2914267501", "expense")).toBe(
      null,
    );
  });

  it("«Погашення кредиту» → Борги та кредити (фікс 2026-09-11)", () => {
    expect(mapDescription("Погашення кредиту", "expense")).toBe("debt");
  });

  it("розрізняє канонічні категорії надходжень", () => {
    expect(mapDescription("Зарплата за серпень", "income")).toBe("salary");
    expect(mapDescription("Повернення за квиток", "income")).toBe("refund");
    expect(mapDescription("Кешбек monobank", "income")).toBe("cashback");
    expect(mapDescription("Пенсія", "income")).toBe("pension");
  });
});

describe("resolveCategoryHint — порядок доказів", () => {
  it("категорія банку виграє в опису", () => {
    // Опис читається як «кафе» (McDonald's), але банк розмітив рядок як
    // аптеку — довіра розмітці того, хто бачив термінал.
    expect(
      resolveCategoryHint({
        direction: "expense",
        bankCategory: "Аптеки",
        description: "McDonald’s",
      }),
    ).toBe("health");
  });

  it("MCC виграє в опису, коли категорії банку немає", () => {
    expect(
      resolveCategoryHint({
        direction: "expense",
        mcc: "5411",
        description: "невідомий мерчант",
      }),
    ).toBe("food");
  });

  it("падає на опис, коли ні категорії, ні MCC немає", () => {
    expect(
      resolveCategoryHint({ direction: "expense", description: "Сільпо" }),
    ).toBe("food");
  });

  it("null, коли жоден шар не спрацював", () => {
    expect(
      resolveCategoryHint({
        direction: "expense",
        bankCategory: "Інше",
        mcc: "0",
        description: "FLAMPIC",
      }),
    ).toBeNull();
  });
});

describe("зняття готівки → внутрішній переказ", () => {
  // Звіт власника 2026-09-13: рядок «Зняття готівки в банкоматі» у превʼю
  // виписки їхав у «Інше» і рахувався витратою, хоча гроші ще в кишені.
  it("мапить MCC банкомата й каси банку", () => {
    expect(mapMccCell("6011")).toBe("internal_transfer");
    expect(mapMccCell("6010")).toBe("internal_transfer");
  });

  it("не чіпає сусідні фінустанови (6012/6051 — не готівка)", () => {
    expect(mapMccCell("6012")).not.toBe("internal_transfer");
    expect(mapMccCell("6051")).not.toBe("internal_transfer");
  });

  it.each([
    "Зняття готівки в банкоматі",
    "ВИДАЧА ГОТІВКИ",
    "  Отримання готівки  ",
    "Зняття коштів",
    "ATM Privatbank",
  ])("ловить опис без колонки MCC: «%s»", (description) => {
    expect(mapDescription(description, "expense")).toBe("internal_transfer");
  });

  it("працює наскрізь через resolveCategoryHint — і MCC, і самим описом", () => {
    expect(
      resolveCategoryHint({
        direction: "expense",
        mcc: "6011",
        description: "Зняття готівки в банкоматі",
      }),
    ).toBe("internal_transfer");
    expect(
      resolveCategoryHint({
        direction: "expense",
        description: "Зняття готівки в банкоматі",
      }),
    ).toBe("internal_transfer");
  });

  it("не перехоплює звичайну витрату зі словом «готівка» у назві мерчанта", () => {
    expect(mapDescription("Сільпо", "expense")).toBe("food");
  });
});
