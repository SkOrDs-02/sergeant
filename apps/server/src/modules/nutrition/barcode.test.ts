import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";
import handler, { __barcodeTestHooks } from "./barcode.js";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function mockRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
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
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  describe("validation", () => {
    it("повертає 400 коли barcode параметр відсутній", async () => {
      const req = asReq({});
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(400);
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
        .mock.calls[0][0] as string;
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

    it("всі три upstream кидають → 404 (handler не падає)", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("OFF down"))
        .mockRejectedValueOnce(new Error("USDA down"))
        .mockRejectedValueOnce(new Error("UPCitemdb down"));
      const req = asReq({ barcode: "9999999999999" });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode).toBe(404);
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
      expect(res1.statusCode).toBe(404);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Повторний lookup — оскільки miss НЕ закешований (upstream-и кинули),
      // cascade проганяється знову. На цей раз upstream-и віддають MISS.
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(OFF_MISS)
        .mockResolvedValueOnce(USDA_MISS)
        .mockResolvedValueOnce(UPCITEMDB_MISS);
      const res2 = mockRes();
      await handler(asReq({ barcode: "9999999999999" }), res2);
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
      expect(res1.statusCode).toBe(404);
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
      const prevHit = process.env.BARCODE_CACHE_HIT_TTL_MS;
      const prevMiss = process.env.BARCODE_CACHE_MISS_TTL_MS;
      const prevMax = process.env.BARCODE_CACHE_MAX_SIZE;
      try {
        process.env.BARCODE_CACHE_HIT_TTL_MS = "12345";
        process.env.BARCODE_CACHE_MISS_TTL_MS = "67890";
        process.env.BARCODE_CACHE_MAX_SIZE = "42";
        __barcodeTestHooks().reset();
        const cfg = __barcodeTestHooks().config();
        expect(cfg.hitTtlMs).toBe(12345);
        expect(cfg.missTtlMs).toBe(67890);
        expect(cfg.maxSize).toBe(42);
      } finally {
        if (prevHit == null) delete process.env.BARCODE_CACHE_HIT_TTL_MS;
        else process.env.BARCODE_CACHE_HIT_TTL_MS = prevHit;
        if (prevMiss == null) delete process.env.BARCODE_CACHE_MISS_TTL_MS;
        else process.env.BARCODE_CACHE_MISS_TTL_MS = prevMiss;
        if (prevMax == null) delete process.env.BARCODE_CACHE_MAX_SIZE;
        else process.env.BARCODE_CACHE_MAX_SIZE = prevMax;
        __barcodeTestHooks().reset();
      }
    });

    it("ігнорує невалідні env (нечисловий рядок) і падає назад на default", async () => {
      const prev = process.env.BARCODE_CACHE_HIT_TTL_MS;
      try {
        process.env.BARCODE_CACHE_HIT_TTL_MS = "not-a-number";
        __barcodeTestHooks().reset();
        const cfg = __barcodeTestHooks().config();
        // Default = 6h
        expect(cfg.hitTtlMs).toBe(6 * 60 * 60 * 1000);
      } finally {
        if (prev == null) delete process.env.BARCODE_CACHE_HIT_TTL_MS;
        else process.env.BARCODE_CACHE_HIT_TTL_MS = prev;
        __barcodeTestHooks().reset();
      }
    });
  });
});
