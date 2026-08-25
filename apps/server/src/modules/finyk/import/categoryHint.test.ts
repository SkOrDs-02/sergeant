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
    ["Дім та ремонт", "shopping"],
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
    expect(mapBankCategory("Кешбек", "income")).toBe("refund");
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
