import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

const silpoMocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  isSilpoConnectedUser: vi.fn(),
  lookupSilpoBarcode: vi.fn(),
  // Mutable env override: `SILPO_ENABLED=true` by default so the existing
  // Silpo-cascade tests exercise the session-peek path; the kill-switch test
  // flips it to false per-test.
  envOverrides: { SILPO_ENABLED: true },
}));

// `barcode.ts` only imports `getSessionUser` from `../../auth.js` — the mock
// factory only needs to cover that one export.
vi.mock("../../auth.js", () => ({
  getSessionUser: silpoMocks.getSessionUser,
}));

// Partial env mock: everything real except `SILPO_ENABLED` (redirected to
// the mutable override above) and `UPCITEMDB_BASE_URL` (read live from
// `process.env` — the parsed `actual.env` snapshot is cached across
// `vi.resetModules()`, which would defeat the re-import test below; the
// test's guarantee is intact because the handler still has to go through
// `env.UPCITEMDB_BASE_URL` rather than a hardcoded URL to see the value).
vi.mock("../../env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env.js")>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop) => {
        if (prop === "SILPO_ENABLED")
          return silpoMocks.envOverrides.SILPO_ENABLED;
        if (prop === "UPCITEMDB_BASE_URL" && process.env["UPCITEMDB_BASE_URL"])
          return process.env["UPCITEMDB_BASE_URL"];
        return Reflect.get(target, prop);
      },
    }),
  };
});

vi.mock("../silpo/foodSource.js", () => ({
  isSilpoConnectedUser: silpoMocks.isSilpoConnectedUser,
  lookupSilpoBarcode: silpoMocks.lookupSilpoBarcode,
}));

import type { BarcodeProduct } from "@sergeant/shared/schemas";

/**
 * Каталог (Tier-1) мокається на рівні модуля: ці тести перевіряють
 * КАСКАД, а не доступ до Postgres. Без мока кожен виклик хендлера
 * ходив би у справжній `pg` і падав на відсутньому зʼєднанні —
 * тести лишались би зеленими (хендлер коректно деградує), але прогін
 * тонув би в логах db_error і залежав від оточення.
 *
 * Дефолт — `null`, тобто «в каталозі нічого немає»: рівно те, що було
 * до появи Tier-1, тож усі наявні сценарії каскаду читаються без змін.
 */
const lookupInCatalogMock = vi.hoisted(() =>
  vi.fn<(barcode: string) => Promise<BarcodeProduct | null>>(async () => null),
);
const upsertIntoCatalogMock = vi.hoisted(() =>
  vi.fn<(barcode: string, product: BarcodeProduct) => Promise<void>>(
    async () => undefined,
  ),
);
vi.mock("./productCatalog.js", () => ({
  lookupInCatalog: lookupInCatalogMock,
  upsertIntoCatalog: upsertIntoCatalogMock,
}));

const handlerModule = await import("./barcode.js");
const handler = handlerModule.default;
const { __barcodeTestHooks } = handlerModule;

interface TestRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
  setHeader(name: string, value: string): TestRes;
}

function mockRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
  return res as TestRes & Response;
}

function asReq(query: Record<string, string>): Request {
  return { query } as unknown as Request;
}

/**
 * Фабрика mock-ів для `global.fetch`. Прихильна до контракту, який очікує
 * `barcode.ts`: `r.ok`, `r.json()`. Не реалізує streaming/headers — handler
 * їх не торкається.
 */
function mockFetchResponse({
  ok = true,
  status = 200,
  body = {} as unknown,
}: { ok?: boolean; status?: number; body?: unknown } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

// OFF returns { status: 1, product: {...} } для hit, інакше status !== 1.
const OFF_HIT = mockFetchResponse({
  body: {
    status: 1,
    product: {
      product_name_uk: "Молоко",
      brands: "Галичина",
      nutriments: {
        "energy-kcal_100g": 60,
        proteins_100g: 3.2,
        fat_100g: 2.5,
        carbohydrates_100g: 4.8,
      },
    },
  },
});

// OFF "miss" — status: 0 (барcode не знайдено в базі).
const OFF_MISS = mockFetchResponse({ body: { status: 0 } });

// USDA returns { foods: [{...}] } для hit, інакше { foods: [] }.
const USDA_HIT = mockFetchResponse({
  body: {
    foods: [
      {
        description: "Greek Yogurt",
        brandOwner: "Chobani",
        gtinUpc: "0818290015938",
        servingSize: 170,
        servingSizeUnit: "g",
        foodNutrients: [
          { nutrientId: 1008, value: 59 }, // kcal
          { nutrientId: 1003, value: 10 }, // protein
          { nutrientId: 1004, value: 0 }, // fat
          { nutrientId: 1005, value: 3.6 }, // carbs
        ],
      },
    ],
  },
});

const USDA_MISS = mockFetchResponse({ body: { foods: [] } });

// UPCitemdb returns { items: [{...}] } для hit.
const UPCITEMDB_HIT = mockFetchResponse({
  body: {
    items: [
      {
        title: "Energy Bar 50g",
        brand: "GenericBrand",
      },
    ],
  },
});

const UPCITEMDB_MISS = mockFetchResponse({ body: { items: [] } });

describe("barcode handler", () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    __barcodeTestHooks().reset();
    global.fetch = vi.fn();
    // Default: anonymous caller, no Silpo connection — matches every
    // existing test below (none of them set up a session).
    // `restoreAllMocks()` in `afterEach` clears these between tests, so
    // they're re-armed here.
    silpoMocks.getSessionUser.mockReset().mockResolvedValue(null);
    silpoMocks.isSilpoConnectedUser.mockReset().mockResolvedValue(false);
    silpoMocks.lookupSilpoBarcode.mockReset().mockResolvedValue(null);
    silpoMocks.envOverrides.SILPO_ENABLED = true;
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  describe("validation", () => {
    it("throws ValidationError коли barcode параметр відсутній", async () => {
      const req = asReq({});
      await expect(handler(req, mockRes())).rejects.toMatchObject({
        name: "ValidationError",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("повертає 400 коли barcode після нормалізації коротший за 8 цифр", async () => {
      const req = asReq({ barcode: "1234567" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        error: expect.stringMatching(/штрихкод/i),
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("повертає 400 коли barcode містить лише нецифрові символи", async () => {
      const req = asReq({ barcode: "abcdefgh" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("нормалізує barcode (видаляє пробіли/дефіси) перед валідацією", async () => {
      // 13-digit barcode із дефісами (стандартний EAN-13 формат)
      global.fetch = vi.fn().mockResolvedValueOnce(OFF_HIT);
      const req = asReq({ barcode: "5-901234-123457" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(global.fetch).toHaveBeenCalledOnce();
      // OFF URL має містити нормалізований barcode
      const url = (global.fetch as unknown as { mock: { calls: unknown[][] } })
        .mock.calls[0]![0] as string;
      expect(url).toContain("5901234123457");
    });
  });

  describe("cascade OFF → USDA → UPCitemdb", () => {
    it("OFF hit зупиняє cascade — USDA та UPCitemdb не викликаються", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(OFF_HIT);
      const req = asReq({ barcode: "3017620422003" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        product: {
          name: "Молоко",
          brand: "Галичина",
          source: "off",
          kcal_100g: 60,
        },
      });
      expect(global.fetch).toHaveBeenCalledOnce();
    });

    it("OFF miss → USDA hit зупиняє cascade на USDA", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_HIT);
      const req = asReq({ barcode: "0818290015938" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        product: {
          name: "Greek Yogurt",
          brand: "Chobani",
          source: "usda",
          kcal_100g: 59,
        },
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("OFF + USDA miss → UPCitemdb hit повертає partial:true", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_HIT);
      const req = asReq({ barcode: "1234567890123" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        product: {
          name: "Energy Bar 50g",
          brand: "GenericBrand",
          source: "upcitemdb",
          partial: true,
          kcal_100g: null,
        },
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("бʼє в URL з UPCITEMDB_BASE_URL, а не в захардкоджений тріал", async () => {
      // Робить неможливим повернення хардкоду. Тріальний endpoint — це 100
      // запитів на добу НА ВЕСЬ ПРОДУКТ; поки URL був зашитий у код, замінити
      // його не можна було без релізу, і сам ризик не був задокументований
      // ніде. Асерт дивиться на фактичний URL третього виклику, а не на те,
      // що «функція повернула продукт».
      const saved = process.env["UPCITEMDB_BASE_URL"];
      process.env["UPCITEMDB_BASE_URL"] = "https://example.test/paid/";
      vi.resetModules();
      const { default: freshHandler } = await import("./barcode.js");
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_HIT);
      const req = asReq({ barcode: "1234567890123" });
      const res = mockRes();
      await freshHandler(req, res);

      const thirdUrl = String(
        (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock
          .calls[2]![0],
      );
      // Кінцевий слеш у базі не має подвоїтись — інакше upstream віддасть 404
      // на цілком валідному конфізі, і діагностувати це буде нічим.
      expect(thirdUrl).toBe(
        "https://example.test/paid/lookup?upc=1234567890123",
      );

      if (saved === undefined) delete process.env["UPCITEMDB_BASE_URL"];
      else process.env["UPCITEMDB_BASE_URL"] = saved;
      vi.resetModules();
    });

    it("всі три upstream miss → 404 без crash", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);
      const req = asReq({ barcode: "9999999999999" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringMatching(/не знайдено/i),
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("OFF кидає → USDA hit рятує cascade", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce(USDA_HIT);
      const req = asReq({ barcode: "0818290015938" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        product: { source: "usda" },
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("всі три upstream кидають → 503 «бази не відповідають», а не 404", async () => {
      // Аудит nutrition § G5: 404 тут брехав — він стверджує, що продукту
      // немає, тоді як насправді ніхто не відповів. Handler так само не падає.
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("OFF down"))
        .mockRejectedValueOnce(new Error("USDA down"))
        .mockRejectedValueOnce(new Error("UPCitemdb down"));
      const req = asReq({ barcode: "9999999999999" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(503);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("OFF повертає !ok (HTTP 500) → cascade продовжує на USDA", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 500 }))
        .mockResolvedValueOnce(USDA_HIT);
      const req = asReq({ barcode: "0818290015938" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ product: { source: "usda" } });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("OFF повертає HTTP 404 → cascade продовжує на USDA without transient failure", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 404 }))
        .mockResolvedValueOnce(USDA_HIT);
      const req = asReq({ barcode: "0818290015938" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ product: { source: "usda" } });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("USDA повертає HTTP 404 → cascade продовжує на UPCitemdb", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 404 }))
        .mockResolvedValueOnce(UPCITEMDB_HIT);
      const req = asReq({ barcode: "1234567890123" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ product: { source: "upcitemdb" } });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("UPCitemdb повертає HTTP 404 → handler returns a normal miss", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 404 }));
      const req = asReq({ barcode: "1234567890123" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.body).toMatchObject({
        error: expect.stringMatching(/не знайдено/i),
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("USDA hit falls back to the first food when gtinUpc is not an exact barcode match", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(
          mockFetchResponse({
            body: {
              foods: [
                {
                  description: "Fallback Yogurt",
                  brandOwner: "Fallback Dairy",
                  gtinUpc: "0000000000000",
                  foodNutrients: [
                    { nutrientId: 1008, value: 61 },
                    { nutrientId: 1003, value: 9 },
                    { nutrientId: 1004, value: 1 },
                    { nutrientId: 1005, value: 4 },
                  ],
                },
              ],
            },
          }),
        );
      const req = asReq({ barcode: "0818290015938" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        product: {
          name: "Fallback Yogurt",
          brand: "Fallback Dairy",
          source: "usda",
        },
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("OFF повертає продукт без жодного макроса — нормалізатор віддає null, cascade продовжує", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(
          mockFetchResponse({
            body: {
              status: 1,
              product: {
                product_name: "Empty shell",
                nutriments: {},
              },
            },
          }),
        )
        .mockResolvedValueOnce(USDA_HIT);
      const req = asReq({ barcode: "0818290015938" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ product: { source: "usda" } });
    });
  });

  describe("TTL cache", () => {
    it("повторний lookup на той самий barcode не викликає upstream (hit cache)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(OFF_HIT);
      const req1 = asReq({ barcode: "3017620422003" });
      const res1 = mockRes();
      await handler(req1, res1);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const req2 = asReq({ barcode: "3017620422003" });
      const res2 = mockRes();
      await handler(req2, res2);
      // Жодного нового fetch-у — все взято з cache-у.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(res2.statusCode).toBe(200);
      expect(res2.body).toEqual(res1.body);
    });

    it("кешує miss-sentinel — другий запит на той самий невідомий barcode не йде в upstream", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);
      const res1 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res1);
      expect(res1.statusCode).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      const res2 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res2);
      expect(res2.statusCode).toBe(404);
      // Cascade НЕ повторюється — miss кеш спрацював.
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("НЕ кешує transient failure (upstream throw) — повторний запит знову проганяє cascade", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("OFF down"))
        .mockRejectedValueOnce(new Error("USDA down"))
        .mockRejectedValueOnce(new Error("UPCitemdb down"));
      const res1 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res1);
      // Збій джерел — неавторитетна відповідь (503), тож у кеш не йде.
      expect(res1.statusCode).toBe(503);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Повторний lookup — оскільки miss НЕ закешований (upstream-и кинули),
      // cascade проганяється знову. На цей раз upstream-и віддають MISS.
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);
      const res2 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res2);
      // А ось тепер джерела ВІДПОВІЛИ і продукту справді немає — 404.
      // Той самий штрихкод, дві різні відповіді: у цьому й суть G5.
      expect(res2.statusCode).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it("does not cache transient non-ok upstream HTTP responses as miss sentinels", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 503 }))
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 500 }))
        .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 429 }));

      const res1 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res1);
      // 503/500/429 від усіх трьох — це «бази лежать», не «немає продукту».
      expect(res1.statusCode).toBe(503);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);

      const res2 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res2);
      expect(res2.statusCode).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it("після того як hit-TTL вийшов, наступний запит знову викликає upstream", async () => {
      // Скорочуємо hit TTL до 0 — будь-яка перевірка експірації одразу вважає
      // запис прострочений.
      __barcodeTestHooks().configure({ hitTtlMs: 0 });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_HIT)
        .mockResolvedValueOnce(OFF_HIT);

      await handler(asReq({ barcode: "3017620422003" }), mockRes());
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await handler(asReq({ barcode: "3017620422003" }), mockRes());
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("після того як miss-TTL вийшов, наступний запит знову проганяє cascade", async () => {
      __barcodeTestHooks().configure({ missTtlMs: 0 });
      global.fetch = vi
        .fn()
        .mockResolvedValue(OFF_MISS)
        // Підставимо USDA + UPCitemdb miss кожен раз.
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS)
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);

      const res1 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res1);
      expect(res1.statusCode).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      const res2 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res2);
      expect(res2.statusCode).toBe(404);
      // Miss експірований → cascade повторився.
      expect(global.fetch).toHaveBeenCalledTimes(6);
    });

    it("обмежує cache до maxSize (FIFO eviction)", async () => {
      __barcodeTestHooks().configure({ maxSize: 2 });
      global.fetch = vi
        .fn()
        .mockResolvedValue(OFF_HIT)
        .mockResolvedValueOnce(OFF_HIT)
        .mockResolvedValueOnce(OFF_HIT)
        .mockResolvedValueOnce(OFF_HIT);

      await handler(asReq({ barcode: "11111111" }), mockRes());
      await handler(asReq({ barcode: "22222222" }), mockRes());
      await handler(asReq({ barcode: "33333333" }), mockRes());

      // Тільки 2 з 3 ключів зберігаються; найстаріший evict-нутий.
      expect(__barcodeTestHooks().cacheSize()).toBe(2);
    });

    it("різні barcode-и кешуються незалежно", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_HIT)
        .mockResolvedValueOnce(OFF_HIT);

      await handler(asReq({ barcode: "11111111" }), mockRes());
      await handler(asReq({ barcode: "22222222" }), mockRes());
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Обидва підтягуються з cache-у.
      await handler(asReq({ barcode: "11111111" }), mockRes());
      await handler(asReq({ barcode: "22222222" }), mockRes());
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("env config", () => {
    it("читає TTL з env при reset()", async () => {
      const prevHit = process.env["BARCODE_CACHE_HIT_TTL_MS"];
      const prevMiss = process.env["BARCODE_CACHE_MISS_TTL_MS"];
      const prevMax = process.env["BARCODE_CACHE_MAX_SIZE"];
      try {
        process.env["BARCODE_CACHE_HIT_TTL_MS"] = "12345";
        process.env["BARCODE_CACHE_MISS_TTL_MS"] = "67890";
        process.env["BARCODE_CACHE_MAX_SIZE"] = "42";
        __barcodeTestHooks().reset();
        const cfg = __barcodeTestHooks().config();
        expect(cfg.hitTtlMs).toBe(12345);
        expect(cfg.missTtlMs).toBe(67890);
        expect(cfg.maxSize).toBe(42);
      } finally {
        if (prevHit == null) delete process.env["BARCODE_CACHE_HIT_TTL_MS"];
        else process.env["BARCODE_CACHE_HIT_TTL_MS"] = prevHit;
        if (prevMiss == null) delete process.env["BARCODE_CACHE_MISS_TTL_MS"];
        else process.env["BARCODE_CACHE_MISS_TTL_MS"] = prevMiss;
        if (prevMax == null) delete process.env["BARCODE_CACHE_MAX_SIZE"];
        else process.env["BARCODE_CACHE_MAX_SIZE"] = prevMax;
        __barcodeTestHooks().reset();
      }
    });

    it("ігнорує невалідні env (нечисловий рядок) і падає назад на default", async () => {
      const prev = process.env["BARCODE_CACHE_HIT_TTL_MS"];
      try {
        process.env["BARCODE_CACHE_HIT_TTL_MS"] = "not-a-number";
        __barcodeTestHooks().reset();
        const cfg = __barcodeTestHooks().config();
        // Default = 6h
        expect(cfg.hitTtlMs).toBe(6 * 60 * 60 * 1000);
      } finally {
        if (prev == null) delete process.env["BARCODE_CACHE_HIT_TTL_MS"];
        else process.env["BARCODE_CACHE_HIT_TTL_MS"] = prev;
        __barcodeTestHooks().reset();
      }
    });
  });

  describe("Silpo as fourth source", () => {
    it("skips the session lookup entirely when SILPO_ENABLED=false — default path pays zero session cost", async () => {
      silpoMocks.envOverrides.SILPO_ENABLED = false;
      global.fetch = vi.fn().mockResolvedValueOnce(OFF_HIT);

      const res = mockRes();
      await handler(asReq({ barcode: "4820000000017" }), res);

      expect(res.statusCode).toBe(200);
      expect(silpoMocks.getSessionUser).not.toHaveBeenCalled();
      expect(silpoMocks.isSilpoConnectedUser).not.toHaveBeenCalled();
      expect(silpoMocks.lookupSilpoBarcode).not.toHaveBeenCalled();
    });

    it("does not call lookupSilpoBarcode for an unconnected caller (default) — cascade behaves exactly as before", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);
      const res = mockRes();
      await handler(asReq({ barcode: "4820000000017" }), res);

      expect(res.statusCode).toBe(404);
      expect(silpoMocks.lookupSilpoBarcode).not.toHaveBeenCalled();
      expect(res.headers["Cache-Control"]).toBeUndefined();
    });

    it("falls through to Silpo when OFF/USDA/UPCitemdb all miss, for a connected caller — and never caches or shares the hit", async () => {
      silpoMocks.getSessionUser.mockResolvedValue({ id: "user-1" });
      silpoMocks.isSilpoConnectedUser.mockResolvedValue(true);
      silpoMocks.lookupSilpoBarcode.mockResolvedValue({
        name: "Молоко Сільпо 2.5%",
        brand: "Сільпо",
        kcal_100g: 60,
        protein_100g: 3,
        fat_100g: 2.5,
        carbs_100g: 4.7,
        servingSize: "900 мл",
        servingGrams: 900,
        source: "silpo",
      });
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);

      const res = mockRes();
      await handler(asReq({ barcode: "4820000000017" }), res);

      expect(res.statusCode).toBe(200);
      expect(silpoMocks.lookupSilpoBarcode).toHaveBeenCalledWith(
        "user-1",
        "4820000000017",
      );
      const body = res.body as { product: { source: string } };
      expect(body.product.source).toBe("silpo");
      // Never shared: overrides the router's public Cache-Control, AND
      // (implicitly, via the next assertion) never lands in the in-process
      // cache the OFF/USDA/UPCitemdb path uses.
      expect(res.headers["Cache-Control"]).toBe(
        "private, no-store, no-cache, must-revalidate",
      );

      // A second identical request must NOT be served from cache — it
      // re-runs the whole cascade (proving the Silpo hit was never
      // `cacheSet`).
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);
      const res2 = mockRes();
      await handler(asReq({ barcode: "4820000000017" }), res2);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(silpoMocks.lookupSilpoBarcode).toHaveBeenCalledTimes(2);
    });

    it("an OFF/USDA/UPCitemdb hit is unaffected by (and cached normally despite) a connected caller", async () => {
      silpoMocks.getSessionUser.mockResolvedValue({ id: "user-1" });
      silpoMocks.isSilpoConnectedUser.mockResolvedValue(true);
      global.fetch = vi.fn().mockResolvedValueOnce(OFF_HIT);

      const res = mockRes();
      await handler(asReq({ barcode: "4820000000017" }), res);

      expect(res.statusCode).toBe(200);
      expect(silpoMocks.lookupSilpoBarcode).not.toHaveBeenCalled();
      expect(res.headers["Cache-Control"]).toBeUndefined();

      // Cached normally — a second request never re-hits `fetch`.
      global.fetch = vi.fn();
      const res2 = mockRes();
      await handler(asReq({ barcode: "4820000000017" }), res2);
      expect(res2.statusCode).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});

describe("barcode handler — Tier-1 (власний каталог)", () => {
  beforeEach(() => {
    __barcodeTestHooks().reset();
    lookupInCatalogMock.mockReset();
    lookupInCatalogMock.mockResolvedValue(null);
    upsertIntoCatalogMock.mockReset();
    upsertIntoCatalogMock.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  const CATALOG_PRODUCT = {
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

  it("hit у каталозі віддає продукт і НЕ чіпає жодного upstream", async () => {
    // Головний сенс ярусу: квота USDA/UPCitemdb витрачається лише на
    // товари, яких ми ще не знаємо.
    const fetchSpy = vi.spyOn(global, "fetch");
    lookupInCatalogMock.mockResolvedValue(CATALOG_PRODUCT);

    const res = mockRes();
    await handler(asReq({ barcode: "4823005203865" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ product: CATALOG_PRODUCT });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("miss у каталозі пропускає запит далі в каскад", async () => {
    lookupInCatalogMock.mockResolvedValue(null);
    vi.spyOn(global, "fetch").mockResolvedValue(OFF_HIT as never);

    const res = mockRes();
    await handler(asReq({ barcode: "4820000000017" }), res);

    expect(lookupInCatalogMock).toHaveBeenCalledWith("4820000000017");
    expect(res.statusCode).toBe(200);
  });

  it("недоступний каталог НЕ ламає скан — деградуємо в upstream", async () => {
    // Каталог — прискорювач, а не єдине джерело істини. Падіння Postgres
    // має коштувати квоти, а не працездатності сканера.
    lookupInCatalogMock.mockRejectedValue(new Error("connection refused"));
    vi.spyOn(global, "fetch").mockResolvedValue(OFF_HIT as never);

    const res = mockRes();
    await handler(asReq({ barcode: "4820000000024" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("product");
  });

  it("hit від upstream пишеться назад у каталог", async () => {
    lookupInCatalogMock.mockResolvedValue(null);
    vi.spyOn(global, "fetch").mockResolvedValue(OFF_HIT as never);

    const res = mockRes();
    await handler(asReq({ barcode: "4820000000031" }), res);

    expect(res.statusCode).toBe(200);
    expect(upsertIntoCatalogMock).toHaveBeenCalledOnce();
    expect(upsertIntoCatalogMock.mock.calls[0]?.[0]).toBe("4820000000031");
  });

  it("miss усіх джерел НЕ пише нічого в каталог", async () => {
    lookupInCatalogMock.mockResolvedValue(null);
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockFetchResponse({ body: { status: 0 } }) as never,
    );

    const res = mockRes();
    await handler(asReq({ barcode: "4820000000048" }), res);

    expect(res.statusCode).toBe(404);
    expect(upsertIntoCatalogMock).not.toHaveBeenCalled();
  });

  it("in-memory кеш стоїть ПЕРЕД каталогом — другий скан не чіпає БД", async () => {
    // Порядок ярусів: памʼять → каталог → upstream. Інакше кожен
    // повторний скан того самого товару давав би зайвий запит у Postgres.
    lookupInCatalogMock.mockResolvedValue(CATALOG_PRODUCT);

    await handler(asReq({ barcode: "4823005203865" }), mockRes());
    expect(lookupInCatalogMock).toHaveBeenCalledOnce();

    const res2 = mockRes();
    await handler(asReq({ barcode: "4823005203865" }), res2);

    expect(lookupInCatalogMock).toHaveBeenCalledOnce();
    expect(res2.statusCode).toBe(200);
  });

  it("невалідний штрихкод відсікається до каталогу", async () => {
    const res = mockRes();
    await handler(asReq({ barcode: "abc" }), res);

    expect(res.statusCode).toBe(400);
    expect(lookupInCatalogMock).not.toHaveBeenCalled();
  });
});
