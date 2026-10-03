import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({ query: queryMock }));
vi.mock("../../obs/logger.js", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { lookupInCatalog, upsertIntoCatalog, searchCatalog } =
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
    fiber_100g: null,
    sugars_100g: null,
    saturated_fat_100g: null,
    salt_100g: null,
    alcohol_100g: null,
    image_url: null,
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
      imageUrl: null,
    });
  });

  // Ключ `nutrients` ставимо лише за наявності бодай одного числа: обʼєкт
  // із пʼятьма `null` сказав би картці «джерело нутрієнти віддає, просто
  // тут їх немає» — а рядок міг приїхати від джерела, яке їх не має.
  it("рядок без жодного нутрієнта не отримує ключа `nutrients`", async () => {
    queryMock.mockResolvedValue({ rows: [catalogRow()] });

    const product = await lookupInCatalog("4823005203865");

    expect(product).not.toBeNull();
    expect("nutrients" in product!).toBe(false);
  });

  it("нутрієнти й фото з рядка доїжджають до контракту", async () => {
    queryMock.mockResolvedValue({
      rows: [
        catalogRow({
          fiber_100g: 2.7,
          salt_100g: 1.2,
          image_url: "https://images.openfoodfacts.org/f.200.jpg",
        }),
      ],
    });

    const product = await lookupInCatalog("4823005203865");

    expect(product?.nutrients).toEqual({
      fiber_100g: 2.7,
      sugars_100g: null,
      saturatedFat_100g: null,
      salt_100g: 1.2,
      alcohol_100g: null,
    });
    expect(product?.imageUrl).toBe(
      "https://images.openfoodfacts.org/f.200.jpg",
    );
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
    // БД усі рядки штрихкоду, щоб відкинути частину вже в памʼяті.
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

  it("відсіює рядок без ЖОДНОГО макроса — інакше він перекрив би каскад назавжди", async () => {
    // Ворота Атвотера такий рядок пропускають: при NULL-макросах `delta`
    // теж NULL. Без окремої умови картка «назва + бренд, нутрієнтів нема»
    // (типово `upcitemdb`, а ще ~⅔ посіву OFF) ставала б Tier-1 відповіддю
    // назавжди — каскад коротшав би на ній, OFF більше не питався, а
    // джоби оновлення тут нема. Умова мусить бути в SQL: інакше рядок
    // все одно виграє `LIMIT 1` у справного сусіда з тим самим штрихкодом.
    queryMock.mockResolvedValue({ rows: [] });
    await lookupInCatalog("4823005203865");

    const sql = String(queryMock.mock.calls[0]?.[0]);
    const macroGate =
      /kcal_100g IS NOT NULL\s+OR protein_100g IS NOT NULL\s+OR fat_100g IS NOT NULL\s+OR carbs_100g IS NOT NULL/;
    expect(sql).toMatch(macroGate);
    // Саме ПЕРЕД воротами Атвотера й до `LIMIT`, тобто у відборі рядків.
    expect(sql.indexOf("kcal_100g IS NOT NULL")).toBeLessThan(
      sql.indexOf("atwater_delta_kcal"),
    );
  });

  it("порядок джерел іде параметром, а не склеюванням у SQL", async () => {
    // Інтерпольований `CASE` працював би так само, але кожен такий рядок
    // у запиті доводиться потім перечитувати очима на предмет інʼєкції.
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

  // ─── Нутрієнти понад КБЖВ (N9) ───────────────────────────────────────

  it("пише всі пʼять нутрієнтів, коли джерело їх дало", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", {
      ...product,
      nutrients: {
        fiber_100g: 2.7,
        sugars_100g: 4.4,
        saturatedFat_100g: 0.3,
        salt_100g: 1.2,
        alcohol_100g: null,
      },
    });

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[12]).toBe(2.7); // fiber_100g
    expect(params[13]).toBe(4.4); // sugars_100g
    expect(params[14]).toBe(0.3); // saturated_fat_100g
    expect(params[15]).toBe(1.2); // salt_100g
    expect(params[16]).toBeNull(); // alcohol_100g
  });

  /**
   * РЕГРЕСІЯ, А НЕ ФІЧА. До 2026-09-13 цей шлях не писав `alcohol_100g`
   * взагалі, і через це ворота Атвотера в `lookupInCatalog` відсіювали
   * КОЖЕН алкогольний напій, що приїхав від живого скану: без спирту
   * формула дає для сухого вина 82 ккал заявлених проти 11 за макросами.
   * Рядок лишався в таблиці, але читач його більше не віддавав — тиха
   * втрата цілої товарної категорії. Прибереш колонку — повернеш це.
   */
  it("пише спирт — без нього ворота Атвотера вбивають увесь алкоголь", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4820000000017", {
      ...product,
      name: "Вино сухе червоне",
      kcal_100g: 82,
      protein_100g: 0.1,
      fat_100g: 0,
      carbs_100g: 2.6,
      nutrients: {
        fiber_100g: null,
        sugars_100g: 0.6,
        saturatedFat_100g: null,
        salt_100g: null,
        alcohol_100g: 11.5,
      },
    });

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("alcohol_100g");
    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[16]).toBe(11.5);
  });

  it("джерело без нутрієнтів пише NULL-и, а не падає", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", product);

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params.slice(12, 17)).toEqual([null, null, null, null, null]);
  });

  /**
   * Пряме `EXCLUDED.*` затерло б нутрієнти, що вже лежать у рядку від
   * bulk-сіду, коли зверху лягає write-through від джерела без них —
   * і разом із ними спирт, тобто одним сканом поверталася б поломка
   * воріт вище.
   */
  it("на конфлікті НЕ затирає наявні нутрієнти порожнечею", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", product);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    for (const col of [
      "fiber_100g",
      "sugars_100g",
      "saturated_fat_100g",
      "salt_100g",
      "alcohol_100g",
    ]) {
      expect(sql).toContain(
        `${col} = COALESCE(EXCLUDED.${col}, product_catalog.${col})`,
      );
    }
  });

  // ─── Фото продукту (U1) ──────────────────────────────────────────────

  it("пише фото продукту", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", {
      ...product,
      imageUrl: "https://images.openfoodfacts.org/f.200.jpg",
    });

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[17]).toBe("https://images.openfoodfacts.org/f.200.jpg");
  });

  /**
   * Та сама форма, що з `alcohol_100g`: колонка `image_url` існує в
   * міграції 123 з 2026-08, bulk-сід її пише, а runtime-шлях до
   * 2026-09-13 — ні. Різниця лише в наслідку: спирт мовчки вбивав товар,
   * фото просто ніколи не приїжджало.
   */
  it("на конфлікті НЕ затирає наявне фото порожнечею", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", product);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain(
      "image_url = COALESCE(EXCLUDED.image_url, product_catalog.image_url)",
    );
    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[17]).toBeNull();
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

  it("НЕ пише картку без жодного макроса", async () => {
    // Пара до воріт у `lookupInCatalog`: читач такий рядок однаково не
    // віддасть, тож запис лише засмічував би таблицю й видачу
    // `searchCatalog` картками, які не можна залогувати. Постачальник —
    // `upcitemdb`: назва й бренд є, нутрієнтів нема взагалі.
    await upsertIntoCatalog("4823005203865", {
      ...product,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("пише картку, де є хоч один макрос", async () => {
    // Межа саме тут, а не на «повних КБЖВ»: сама лише калорійність уже
    // дозволяє залогувати їжу, тож викидати такий рядок було б втратою.
    queryMock.mockResolvedValue({ rows: [] });
    await upsertIntoCatalog("4823005203865", {
      ...product,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("не пише продукт без назви", async () => {
    await upsertIntoCatalog("4823005203865", { ...product, name: "   " });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("searchCatalog", () => {
  function searchRow(over: Record<string, unknown> = {}) {
    return {
      barcode: "4823005203865",
      source: "off",
      name: "Молоко 2,6% Яготинське",
      brand: "Яготинське",
      kcal_100g: 53,
      protein_100g: 2.8,
      fat_100g: 2.6,
      carbs_100g: 4.7,
      serving_grams: null,
      ...over,
    };
  }

  it("віддає результат у формі FoodSearchProduct", async () => {
    queryMock.mockResolvedValue({ rows: [searchRow()] });

    const found = await searchCatalog("молоко", 10);

    expect(found).toEqual([
      {
        id: "cat_off_4823005203865",
        name: "Молоко 2,6% Яготинське",
        brand: "Яготинське",
        source: "off",
        per100: { kcal: 53, protein_g: 2.8, fat_g: 2.6, carbs_g: 4.7 },
        defaultGrams: 100,
      },
    ]);
  });

  it("id стабільний між запитами — інакше React перебудовує список", async () => {
    queryMock.mockResolvedValue({ rows: [searchRow()] });
    const first = await searchCatalog("молоко", 10);
    queryMock.mockResolvedValue({ rows: [searchRow()] });
    const second = await searchCatalog("молоко", 10);

    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it("порція з джерела перемагає дефолт у 100 г", async () => {
    queryMock.mockResolvedValue({ rows: [searchRow({ serving_grams: 250 })] });
    const found = await searchCatalog("молоко", 10);
    expect(found[0]?.defaultGrams).toBe(250);
  });

  it("нормалізує запит тим самим ключем, що й запис", async () => {
    // Інакше пошук шукав би «Молоко» у полі, де лежить «молоко».
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("  МОЛОКО   Яготинське ", 10);

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[0]).toBe("молоко яготинське");
  });

  it("екранує спецсимволи LIKE у вводі користувача", async () => {
    // Без цього запит «100%» став би вайлдкардом: на живих даних це 43
    // рядки замість 21, тобто вдвічі більше сміття у видачі.
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("100% сік_", 10);

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[4]).toBe("%100\\% сік\\_%");
  });

  it("бере із запасом понад ліміт — на дедуп із upstream", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("молоко", 10);

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[5]).toBeGreaterThan(10);
  });

  it("шукає лише серед джерел із нутрієнтами", async () => {
    // upcitemdb віддає назву без КБЖВ — у видачі пошуку така картка марна.
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("молоко", 10);

    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[1]).toEqual(["off", "usda"]);
  });

  it("вимагає повних макросів і застосовує ворота Атвотера", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("пепсі", 10);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("kcal_100g IS NOT NULL");
    expect(sql).toContain("carbs_100g IS NOT NULL");
    expect(sql).toContain("atwater_delta_kcal");
  });

  it("матчить двома каналами: підрядком і схожістю слова", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("молоко", 10);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("LIKE $5 ESCAPE");
    expect(sql).toContain("$1 <% name_norm");
    // word_similarity, а не similarity: короткий запит тоне у довгій назві
    // (заміряно: 0.093 проти 0.429 на тому самому рядку).
    expect(sql).toContain("word_similarity($1, name_norm)");
  });

  it("точні входження ранжуються вище за схожі", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchCatalog("молоко", 10);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    const orderBy = sql.slice(sql.indexOf("ORDER BY"));
    expect(orderBy.indexOf("LIKE")).toBeLessThan(
      orderBy.indexOf("word_similarity"),
    );
  });

  it("надто короткий запит не йде в БД взагалі", async () => {
    expect(await searchCatalog("м", 10)).toEqual([]);
    expect(await searchCatalog("  ", 10)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
