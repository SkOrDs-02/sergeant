import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const warnMock = vi.hoisted(() => vi.fn());
const infoMock = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({ query: queryMock }));
vi.mock("../../obs/logger.js", () => ({
  logger: { warn: warnMock, info: infoMock, error: vi.fn(), debug: vi.fn() },
}));

const { searchGenericFoods, seedGenericFoods } =
  await import("./genericFoods.js");

function row(over: Record<string, unknown> = {}) {
  return {
    slug: "ohirok",
    name: "Огірок",
    category: "Овочі і гриби",
    kcal_100g: 15,
    protein_100g: 0.7,
    fat_100g: 0.1,
    carbs_100g: 3.6,
    default_grams: 100,
    ...over,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  warnMock.mockReset();
  infoMock.mockReset();
});

describe("searchGenericFoods", () => {
  it("віддає результат у формі FoodSearchProduct", async () => {
    queryMock.mockResolvedValue({ rows: [row()] });

    expect(await searchGenericFoods("огірок", 10)).toEqual([
      {
        id: "gen_ohirok",
        name: "Огірок",
        brand: null,
        source: "usda",
        per100: { kcal: 15, protein_g: 0.7, fat_g: 0.1, carbs_g: 3.6 },
        defaultGrams: 100,
      },
    ]);
  });

  it("бренд завжди null — «огірок» нічий", async () => {
    queryMock.mockResolvedValue({ rows: [row()] });
    const found = await searchGenericFoods("огірок", 10);
    expect(found[0]?.brand).toBeNull();
  });

  it("id відрізняє базову їжу від карток каталогу", async () => {
    // `gen_` проти `cat_`: інакше клієнтський дедуп плутав би огірок як
    // продукт із огірком як карткою товару.
    queryMock.mockResolvedValue({ rows: [row()] });
    const found = await searchGenericFoods("огірок", 10);
    expect(found[0]?.id.startsWith("gen_")).toBe(true);
  });

  it("шукає трьома каналами: підрядок, синонім, схожість слова", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchGenericFoods("помідор", 10);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("name_norm LIKE $2 ESCAPE");
    expect(sql).toContain("aliases @> ARRAY[$1]::text[]");
    expect(sql).toContain("$1 <% name_norm");
  });

  it("ранжує точне входження вище за синонім, синонім вище за схожість", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchGenericFoods("огірок", 10);

    const sql = String(queryMock.mock.calls[0]?.[0]);
    const order = sql.slice(sql.indexOf("ORDER BY"));
    expect(order.indexOf("LIKE")).toBeLessThan(order.indexOf("aliases"));
    expect(order.indexOf("aliases")).toBeLessThan(
      order.indexOf("word_similarity"),
    );
  });

  it("нормалізує запит перед пошуком", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchGenericFoods("  ОГІРОК  ", 10);
    expect((queryMock.mock.calls[0]?.[1] as unknown[])[0]).toBe("огірок");
  });

  it("екранує спецсимволи LIKE", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await searchGenericFoods("сік 100%", 10);
    expect((queryMock.mock.calls[0]?.[1] as unknown[])[1]).toBe("%сік 100\\%%");
  });

  it("надто короткий запит не йде в БД", async () => {
    expect(await searchGenericFoods("о", 10)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("seedGenericFoods", () => {
  it("засіває весь корпус пакетами", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const written = await seedGenericFoods();

    expect(written).toBeGreaterThan(300);
    expect(queryMock.mock.calls.length).toBeGreaterThan(1);
    expect(infoMock).toHaveBeenCalled();
  });

  it("ідемпотентний — upsert по slug", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await seedGenericFoods();

    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain("ON CONFLICT (slug) DO UPDATE");
    expect(sql).toContain("updated_at = NOW()");
  });

  it("увесь пакет їде ОДНИМ jsonb-параметром, без склеювання SQL", async () => {
    // Альтернатива — будувати `VALUES ($1,$2,…)` під розмір пакета. Значення
    // й там були б параметрами, але сам запит довелось би склеювати, і
    // eslint-правило `no-restricted-syntax` справедливо це підсвічує.
    queryMock.mockResolvedValue({ rows: [] });
    await seedGenericFoods();

    const [sql, params] = queryMock.mock.calls[0] ?? [];
    expect(String(sql)).toContain("jsonb_to_recordset($1::jsonb)");
    expect(String(sql)).not.toContain("$2");
    expect(params).toHaveLength(1);
  });

  it("нормалізує синоніми перед записом", async () => {
    // Синоніми лежать у БД уже нормалізованими, щоб пошук не мусив
    // нормалізувати їх на льоту в кожному запиті.
    queryMock.mockResolvedValue({ rows: [] });
    await seedGenericFoods();

    const batch = JSON.parse(
      String((queryMock.mock.calls[0]?.[1] as unknown[])[0]),
    ) as Array<{ aliases: string[] }>;
    const withAliases = batch.filter((r) => r.aliases.length > 0);
    expect(withAliases.length).toBeGreaterThan(0);
    for (const r of withAliases) {
      for (const a of r.aliases) expect(a).toBe(a.toLowerCase().trim());
    }
  });

  it("помилку БД ковтає — непосіяний довідник не має валити сервер", async () => {
    // Викликається з `void` на старті; кинутий тут reject став би
    // необробленим і, залежно від конфігурації Node, поклав би процес.
    queryMock.mockRejectedValue(new Error("relation does not exist"));

    await expect(seedGenericFoods()).resolves.toBe(0);
    expect(warnMock).toHaveBeenCalledOnce();
  });
});
