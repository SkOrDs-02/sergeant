import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({ query: queryMock }));
vi.mock("../../obs/logger.js", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { lookupInCatalog, upsertIntoCatalog } =
  await import("./productCatalog.js");

function catalogRow(over: Record<string, unknown> = {}) {
  return {
    name: "Молоко 2,6% Яготинське",
    brand: "Яготинське",
    kcal_100g: 53,
    protein_100g: 2.8,
    fat_100g: 2.6,
    carbs_100g: 4.7,
    serving_size: null,
    serving_grams: null,
    source: "off",
    ...over,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  warnMock.mockReset();
});

describe("lookupInCatalog", () => {
  it("віддає продукт у формі контракту BarcodeProduct", async () => {
    queryMock.mockResolvedValue({ rows: [catalogRow()] });

    const product = await lookupInCatalog("4823005203865");

    expect(product).toEqual({
      name: "Молоко 2,6% Яготинське",
      brand: "Яготинське",
      kcal_100g: 53,
      protein_100g: 2.8,
      fat_100g: 2.6,
      carbs_100g: 4.7,
      servingSize: null,
      servingGrams: null,
      source: "off",
    });
  });

  it("віддає ОРИГІНАЛЬНЕ джерело, а не 'catalog'", async () => {
    // Контракт `BarcodeProductSchema.source` описує походження ДАНИХ, а не
    // шлях доставки. Якби сюди протікав 'catalog', довелось би розширювати
    // enum і рухати контрактну трійцю (Hard Rule #3) заради нічого.
    queryMock.mockResolvedValue({ rows: [catalogRow({ source: "usda" })] });

    const product = await lookupInCatalog("4823005203865");

    expect(product?.source).toBe("usda");
  });

  it("повертає null, коли рядка немає", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lookupInCatalog("4823005203865")).toBeNull();
  });

  it("відсіює биті рядки запитом, а не в JS", async () => {
    // Ворота Атвотера мають лишатись у SQL: інакше довелось би тягнути з
    // БД усі рядки штрихкоду, щоб відкинути частину вже в пам'яті.
    queryMock.mockResolvedValue({ rows: [] });
    await lookupInCatalog("4820062051613");

    const [sql, params] = queryMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain("atwater_delta_kcal");
    const p = params as unknown[];
    expect(p[0]).toBe("4820062051613");
    expect(p[1]).toBe(30);
    expect(p[2]).toBe(0.25);
  });

  it("пріоритезує джерела в порядку зовнішнього каскаду", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lookupInCatalog("4823005203865");

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[3]).toEqual(["off", "usda", "upcitemdb"]);
  });

  it("порядок джерел іде параметром, а не склеюванням у SQL", async () => {
    // Інтерпольований `CASE` працював би так само, але кожен такий рядок
    // у запиті доводиться потім перечитувати очима на предмет ін'єкції.
    // Параметр знімає це питання назавжди — і саме цього вимагає
    // no-restricted-syntax у серверному eslint-конфізі.
    queryMock.mockResolvedValue({ rows: [] });
    await lookupInCatalog("4823005203865");

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("array_position($4::text[], source)");
    expect(sql).not.toContain("'off'");
  });

  it("помилку БД НЕ ковтає — вирішує викликач", async () => {
    // Свідомо інша політика, ніж в upsert: на читанні хендлер має
    // відрізнити «нема в каталозі» від «каталог недоступний», щоб
    // залогувати друге і піти в upstream.
    queryMock.mockRejectedValue(new Error("connection refused"));
    await expect(lookupInCatalog("4823005203865")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("upsertIntoCatalog", () => {
  const product = {
    name: "Молоко 2,6% Яготинське",
    brand: "Яготинське",
    kcal_100g: 53,
    protein_100g: 2.8,
    fat_100g: 2.6,
    carbs_100g: 4.7,
    servingSize: null,
    servingGrams: null,
    source: "off" as const,
  };

  it("пише рядок і рахує пошуковий ключ із назви разом із брендом", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", product);

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe("4823005203865");
    expect(params[1]).toBe("off");
    expect(params[3]).toBe("молоко 2,6% яготинське яготинське");
  });

  it("НЕ пише внутрішньомагазинні вагові коди (префікс 2)", async () => {
    // `2853532000000` — «огірок тепличний» у Novus і будь-що інше в
    // сусідньому магазині. У глобальному довіднику такому не місце, а
    // CHECK у БД їх не ловить: за формою це валідний GTIN.
    await upsertIntoCatalog("2853532000000", product);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("НЕ пише те, що не є GTIN", async () => {
    await upsertIntoCatalog("4820", product);
    await upsertIntoCatalog("482abc0001", product);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("обнуляє значення поза фізичними межами ПОЛЕМ, не рядком", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", {
      ...product,
      kcal_100g: 5000, // понад стелю CHECK-а
      fat_100g: 150, // важче за самі 100 г
    });

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[5]).toBeNull(); // kcal_100g
    expect(params[7]).toBeNull(); // fat_100g
    expect(params[6]).toBe(2.8); // protein лишився
    expect(params[2]).toBe("Молоко 2,6% Яготинське"); // товар не втрачено
  });

  it("помилку запису ковтає — користувач уже отримав продукт", async () => {
    queryMock.mockRejectedValue(new Error("deadlock detected"));
    await expect(
      upsertIntoCatalog("4823005203865", product),
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalledOnce();
  });

  it("оновлює fetched_at на конфлікті — основа політики протухання", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", product);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("ON CONFLICT (barcode, source) DO UPDATE");
    expect(sql).toContain("fetched_at = NOW()");
  });

  it("не пише продукт без назви", async () => {
    await upsertIntoCatalog("4823005203865", { ...product, name: "   " });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
