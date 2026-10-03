import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Request, Response } from "express";
import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../../../test/__mocks__/anthropic.js";

const envMock = vi.hoisted(() => ({
  LLM_RECEIPT_PROVIDER: "stub" as "openrouter" | "anthropic" | "stub",
  OPENROUTER_API_KEY: "",
  OPENROUTER_RECEIPT_MODEL: "google/gemini-2.5-flash-lite",
  ANTHROPIC_API_KEY: "",
}));
vi.mock("../../../env.js", () => ({ env: envMock }));
vi.mock("../../../lib/anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "../../../lib/anthropic.js";
import analyzeReceiptHandler, { normalizeVisionResult } from "./analyze.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

// Валідний PNG-заголовок — magic-byte detector визначить image/png.
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const PNG_BASE64 = Buffer.concat([
  PNG_HEADER,
  Buffer.alloc(Math.max(0, 200 - PNG_HEADER.length)),
]).toString("base64");

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
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

function makeReq(body: unknown, userId = "u1"): Request {
  return { user: { id: userId }, body } as unknown as Request;
}

beforeEach(() => {
  anthropicMessages.mockReset();
  envMock.LLM_RECEIPT_PROVIDER = "stub";
  envMock.OPENROUTER_API_KEY = "";
  envMock.ANTHROPIC_API_KEY = "";
});

describe("normalizeVisionResult", () => {
  it("мапить валідний snake_case JSON у camelCase draft", () => {
    const draft = normalizeVisionResult({
      store: "Сільпо",
      date: "2026-01-15",
      time: "14:32",
      total_kopiykas: 15000,
      items: [
        { name: "Молоко", qty: 1, price_kopiykas: 3200, sum_kopiykas: 3200 },
      ],
      confidence: 0.9,
    });
    expect(draft.source).toBe("vision");
    expect(draft.fiscalNum).toBeNull();
    expect(draft.store).toBe("Сільпо");
    expect(draft.totalKopiykas).toBe(15000);
    expect(draft.confidence).toBe(0.9);
    expect(draft.items).toEqual([
      {
        position: 1,
        name: "Молоко",
        qty: 1,
        priceKopiykas: 3200,
        sumKopiykas: 3200,
      },
    ]);
    // Kyiv 14:32 (EET, UTC+2) 2026-01-15 → 12:32 UTC.
    expect(draft.purchasedAt).toBe("2026-01-15T12:32:00.000Z");
  });

  it("не падає на сміттєвий/нетиповий JSON: дає безпечні дефолти", () => {
    const draft = normalizeVisionResult("не JSON, а рядок");
    expect(draft.store).toBe("");
    expect(draft.items).toEqual([]);
    expect(draft.totalKopiykas).toBe(0);
    expect(draft.confidence).toBeNull();
  });

  it("не падає на null/undefined", () => {
    expect(() => normalizeVisionResult(null)).not.toThrow();
    expect(() => normalizeVisionResult(undefined)).not.toThrow();
  });

  it("підставляє fallback-назву позиції без name і клампить confidence у [0,1]", () => {
    const draft = normalizeVisionResult({
      store: "x",
      total_kopiykas: 100,
      items: [{ qty: 2, price_kopiykas: 50, sum_kopiykas: 100 }],
      confidence: 4.2,
    });
    expect(draft.items[0]?.name).toBe("Позиція 1");
    expect(draft.confidence).toBe(1);
  });

  it("обрізає items до 200 позицій", () => {
    const items = Array.from({ length: 250 }, (_, i) => ({
      name: `Товар ${i}`,
      qty: 1,
      price_kopiykas: 100,
      sum_kopiykas: 100,
    }));
    const draft = normalizeVisionResult({
      store: "x",
      total_kopiykas: 1,
      items,
    });
    expect(draft.items).toHaveLength(200);
  });

  // Review-фікс MAJOR: без клампінгу LLM-галюцинація валила б
  // `ReceiptDraftResponseSchema.parse()` у 500 замість редагованої
  // чернетки — кожен тест нижче перевіряє ОДНУ межу схеми.
  describe("клампінг до меж shared-схеми (review-фікс MAJOR)", () => {
    it("клампить totalKopiykas знизу (LLM дав відʼємне число) до 0", () => {
      const draft = normalizeVisionResult({
        store: "x",
        total_kopiykas: -500,
        items: [],
      });
      expect(draft.totalKopiykas).toBe(0);
    });

    it("клампить totalKopiykas зверху до AMOUNT_MINOR_MAX", () => {
      const draft = normalizeVisionResult({
        store: "x",
        total_kopiykas: 5_000_000_000,
        items: [],
      });
      expect(draft.totalKopiykas).toBe(1_000_000_000);
    });

    it("клампить задовгу назву магазину до 300 символів", () => {
      const draft = normalizeVisionResult({
        store: "х".repeat(500),
        total_kopiykas: 1,
        items: [],
      });
      expect(draft.store).toHaveLength(300);
    });

    it("клампить задовгу назву позиції до 300 символів", () => {
      const draft = normalizeVisionResult({
        store: "x",
        total_kopiykas: 1,
        items: [
          { name: "т".repeat(500), qty: 1, price_kopiykas: 1, sum_kopiykas: 1 },
        ],
      });
      expect(draft.items[0]?.name).toHaveLength(300);
    });

    it("клампить qty у межі [-1_000_000, 1_000_000]", () => {
      const draft = normalizeVisionResult({
        store: "x",
        total_kopiykas: 1,
        items: [
          { name: "A", qty: 5_000_000, price_kopiykas: 1, sum_kopiykas: 1 },
          { name: "B", qty: -5_000_000, price_kopiykas: 1, sum_kopiykas: 1 },
        ],
      });
      expect(draft.items[0]?.qty).toBe(1_000_000);
      expect(draft.items[1]?.qty).toBe(-1_000_000);
    });

    it("клампить price_kopiykas/sum_kopiykas у межі [-AMOUNT_MINOR_MAX, AMOUNT_MINOR_MAX]", () => {
      const draft = normalizeVisionResult({
        store: "x",
        total_kopiykas: 1,
        items: [
          {
            name: "A",
            qty: 1,
            price_kopiykas: 5_000_000_000,
            sum_kopiykas: -5_000_000_000,
          },
        ],
      });
      expect(draft.items[0]?.priceKopiykas).toBe(1_000_000_000);
      expect(draft.items[0]?.sumKopiykas).toBe(-1_000_000_000);
    });
  });

  // Review-фікс MAJOR: регекс перевіряв лише ФОРМАТ дати/часу, не
  // календарну коректність — `Date.UTC` мовчки "перекочував" неможливі
  // компоненти (2026-02-31 → березень) замість fallback на "зараз".
  describe("календарна валідація дати/часу (review-фікс MAJOR)", () => {
    it("2026-02-31 (формат ОК, календарно неможливо) → fallback на 'зараз', НЕ перекочена дата", () => {
      const before = Date.now();
      const draft = normalizeVisionResult({
        store: "x",
        date: "2026-02-31",
        time: "10:00",
        total_kopiykas: 1,
        items: [],
      });
      const after = Date.now();
      const purchasedAtMs = new Date(draft.purchasedAt).getTime();
      // Старий баг: Date.UTC(2026,1,31,...) мовчки перекочував би в
      // 2026-03-03 — це НЕ "зараз" і має провалити діапазон нижче.
      expect(purchasedAtMs).toBeGreaterThanOrEqual(before);
      expect(purchasedAtMs).toBeLessThanOrEqual(after);
    });

    it("2026-13-05 (місяць поза 1..12) → fallback на 'зараз'", () => {
      const before = Date.now();
      const draft = normalizeVisionResult({
        store: "x",
        date: "2026-13-05",
        total_kopiykas: 1,
        items: [],
      });
      const after = Date.now();
      const purchasedAtMs = new Date(draft.purchasedAt).getTime();
      expect(purchasedAtMs).toBeGreaterThanOrEqual(before);
      expect(purchasedAtMs).toBeLessThanOrEqual(after);
    });

    it("99:99 (формат ОК, час неможливий) при ВАЛІДНІЙ даті → дата збережена, час дефолт 12:00 Kyiv", () => {
      const draft = normalizeVisionResult({
        store: "x",
        date: "2026-01-15",
        time: "99:99",
        total_kopiykas: 1,
        items: [],
      });
      // Kyiv 12:00 EET (UTC+2, зима) 2026-01-15 → 10:00 UTC.
      expect(draft.purchasedAt).toBe("2026-01-15T10:00:00.000Z");
    });

    it("валідні дата+час далі конвертуються як і раніше (без регресії)", () => {
      const draft = normalizeVisionResult({
        store: "x",
        date: "2026-01-15",
        time: "14:32",
        total_kopiykas: 1,
        items: [],
      });
      expect(draft.purchasedAt).toBe("2026-01-15T12:32:00.000Z");
    });
  });
});

describe("analyzeReceiptHandler", () => {
  it("503 RECEIPT_VISION_UNAVAILABLE, коли немає жодного ключа і provider не stub", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "openrouter";
    envMock.OPENROUTER_API_KEY = "";
    envMock.ANTHROPIC_API_KEY = "";

    const req = makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" });
    await expect(analyzeReceiptHandler(req, makeRes())).rejects.toMatchObject({
      status: 503,
      code: "RECEIPT_VISION_UNAVAILABLE",
    });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("happy path (stub-провайдер): повертає draft без виклику мережі", async () => {
    const req = makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" });
    const res = makeRes();

    await analyzeReceiptHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { draft: { source: string; store: string } };
    expect(body.draft.source).toBe("vision");
    expect(body.draft.store).toBe("Тестовий магазин");
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("415 на зображення поза allowlist (magic-byte mismatch)", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "openrouter";
    envMock.OPENROUTER_API_KEY = "or-key";
    const gifBase64 = Buffer.from("GIF89a" + "x".repeat(200)).toString(
      "base64",
    );

    const req = makeReq({ image_base64: gifBase64, mime_type: "image/gif" });
    const res = makeRes();
    await analyzeReceiptHandler(req, res);

    expect(res.statusCode).toBe(415);
  });

  it("парсить реальну (не-stub) відповідь моделі через extractJsonFromText", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "openrouter";
    envMock.OPENROUTER_API_KEY = "or-key";
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        'Ось результат:\n```json\n{"store":"АТБ","total_kopiykas":500,"items":[]}\n```',
      ),
    );

    const req = makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" });
    const res = makeRes();
    await analyzeReceiptHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      draft: { store: string; totalKopiykas: number };
    };
    expect(body.draft.store).toBe("АТБ");
    expect(body.draft.totalKopiykas).toBe(500);
  });
});
