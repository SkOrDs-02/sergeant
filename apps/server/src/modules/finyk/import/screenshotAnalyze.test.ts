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
import screenshotAnalyzeHandler, {
  normalizeImportScreenshotResult,
} from "./screenshotAnalyze.js";
import {
  IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT,
  buildImportScreenshotUserPrompt,
} from "./prompts.js";

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

describe("normalizeImportScreenshotResult", () => {
  it("мапить валідний snake_case JSON у camelCase draft", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      bank: "monobank",
      rows: [
        {
          date: "2026-01-15",
          time: "14:32",
          amount_kopiykas: 15000,
          direction: "expense",
          description: "Сільпо",
          confidence: 0.9,
        },
      ],
    });
    expect(draft.docType).toBe("bank_screenshot");
    expect(draft.bank).toBe("monobank");
    expect(draft.rows).toEqual([
      {
        date: "2026-01-15",
        time: "14:32",
        amountKopiykas: 15000,
        direction: "expense",
        description: "Сільпо",
        confidence: 0.9,
      },
    ]);
  });

  it("doc_type='receipt' → порожні rows, не помилка (UI підказка піти v1-шляхом)", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "receipt",
      bank: null,
      rows: [],
    });
    expect(draft.docType).toBe("receipt");
    expect(draft.rows).toEqual([]);
  });

  it("doc_type='other' → порожні rows, не помилка", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "other",
      bank: null,
      rows: [],
    });
    expect(draft.docType).toBe("other");
  });

  it("невідомий/відсутній doc_type фолбечиться на 'other'", () => {
    const draft = normalizeImportScreenshotResult({ rows: [] });
    expect(draft.docType).toBe("other");
  });

  it("не падає на сміттєвий/нетиповий JSON — дає безпечні дефолти", () => {
    const draft = normalizeImportScreenshotResult("не JSON, а рядок");
    expect(draft.docType).toBe("other");
    expect(draft.bank).toBeNull();
    expect(draft.rows).toEqual([]);
  });

  it("не падає на null/undefined", () => {
    expect(() => normalizeImportScreenshotResult(null)).not.toThrow();
    expect(() => normalizeImportScreenshotResult(undefined)).not.toThrow();
  });

  it("відкидає рядок без розпізнаваної дати (не показуємо биту картку транзакції)", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "не дата",
          amount_kopiykas: 100,
          direction: "expense",
          description: "X",
          confidence: 0.5,
        },
      ],
    });
    expect(draft.rows).toEqual([]);
  });

  it("відкидає рядок з нульовою/відсутньою сумою", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "2026-01-15",
          amount_kopiykas: 0,
          direction: "expense",
          description: "X",
        },
      ],
    });
    expect(draft.rows).toEqual([]);
  });

  it("direction фолбечиться на 'expense', коли не 'income'", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "2026-01-15",
          amount_kopiykas: 100,
          direction: "щось інше",
          description: "X",
        },
      ],
    });
    expect(draft.rows[0]?.direction).toBe("expense");
  });

  it("клампить confidence у [0,1] і дефолтить на 0 для нечислового значення", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "2026-01-15",
          amount_kopiykas: 100,
          direction: "income",
          description: "X",
          confidence: 4.2,
        },
        {
          date: "2026-01-16",
          amount_kopiykas: 200,
          direction: "income",
          description: "Y",
          confidence: "not a number",
        },
      ],
    });
    expect(draft.rows[0]?.confidence).toBe(1);
    expect(draft.rows[1]?.confidence).toBe(0);
  });

  it("нормалізує time '9:05' → '09:05'; нечитабельний time → null", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "2026-01-15",
          time: "9:05",
          amount_kopiykas: 100,
          direction: "expense",
          description: "X",
        },
        {
          date: "2026-01-16",
          time: "не час",
          amount_kopiykas: 100,
          direction: "expense",
          description: "Y",
        },
      ],
    });
    expect(draft.rows[0]?.time).toBe("09:05");
    expect(draft.rows[1]?.time).toBeNull();
  });

  it("time відсутній/null → null (push-повідомлення без мітки часу)", () => {
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "2026-01-15",
          amount_kopiykas: 100,
          direction: "expense",
          description: "X",
        },
      ],
    });
    expect(draft.rows[0]?.time).toBeNull();
  });

  it("time-індекс не зсувається, коли попередній рядок відкинуто (regression: index-mismatch bug)", () => {
    // Рядок 0 без валідної дати — відкидається; рядок 1 валідний і МАЄ
    // отримати СВІЙ time ("15:00"), не time рядка 0.
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows: [
        {
          date: "не дата",
          time: "11:11",
          amount_kopiykas: 100,
          direction: "expense",
          description: "Відкинутий",
        },
        {
          date: "2026-01-15",
          time: "15:00",
          amount_kopiykas: 200,
          direction: "expense",
          description: "Валідний",
        },
      ],
    });
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]?.time).toBe("15:00");
    expect(draft.rows[0]?.description).toBe("Валідний");
  });

  it("обрізає rows до 200 позицій", () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({
      date: "2026-01-15",
      amount_kopiykas: 100,
      direction: "expense",
      description: `Row ${i}`,
    }));
    const draft = normalizeImportScreenshotResult({
      doc_type: "bank_screenshot",
      rows,
    });
    expect(draft.rows).toHaveLength(200);
  });
});

describe("IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT", () => {
  it("забороняє рядки балансу/доступно/ліміту (спека § Фаза 2)", () => {
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(/баланс/i);
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(/доступно/i);
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(/ліміт/i);
  });

  it("вимагає виводити рік від якоря «сьогодні», не пізніше за нього (live-бенч 2026-08-18: без якоря моделі галюцинували 2023/2024)", () => {
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(
      /сьогоднішню дату з повідомлення користувача/,
    );
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(
      /НЕ пізніший за сьогодні/,
    );
    // Сам якір — в user-промпті, з параметром київського дня.
    expect(buildImportScreenshotUserPrompt("2026-08-18")).toMatch(
      /Сьогодні 2026-08-18/,
    );
  });

  it("виключає невдалі операції і рекламні підписи (live-бенч: failed Moneyveo йшли у витрати)", () => {
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(
      /Недостатньо коштів/,
    );
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(/НЕВДАЛІ операції/);
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(
      /рекламні чи жартівливі підписи/,
    );
  });

  it("вимагає цілі копійки (не гривні/дробові)", () => {
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toMatch(/копійок/);
  });

  it("несе doc_type-контракт bank_screenshot/receipt/other", () => {
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toContain("bank_screenshot");
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toContain('"receipt"');
    expect(IMPORT_SCREENSHOT_VISION_SYSTEM_PROMPT).toContain('"other"');
  });
});

describe("screenshotAnalyzeHandler", () => {
  it("503 IMPORT_VISION_UNAVAILABLE, коли немає жодного ключа і provider не stub", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "openrouter";
    envMock.OPENROUTER_API_KEY = "";
    envMock.ANTHROPIC_API_KEY = "";

    const req = makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" });
    await expect(
      screenshotAnalyzeHandler(req, makeRes()),
    ).rejects.toMatchObject({
      status: 503,
      code: "IMPORT_VISION_UNAVAILABLE",
    });
    expect(anthropicMessages).not.toHaveBeenCalled();
  });

  it("happy path (stub-провайдер): повертає draft без виклику мережі", async () => {
    const req = makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" });
    const res = makeRes();

    await screenshotAnalyzeHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      draft: { docType: string; bank: string | null };
    };
    expect(body.draft.docType).toBe("bank_screenshot");
    expect(body.draft.bank).toBe("monobank");
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
    await screenshotAnalyzeHandler(req, res);

    expect(res.statusCode).toBe(415);
  });

  it("парсить реальну (не-stub) відповідь моделі через extractJsonFromText", async () => {
    envMock.LLM_RECEIPT_PROVIDER = "openrouter";
    envMock.OPENROUTER_API_KEY = "or-key";
    anthropicMessages.mockResolvedValueOnce(
      anthropicResponses.text(
        'Ось результат:\n```json\n{"doc_type":"bank_screenshot","bank":"privat24","rows":[{"date":"2026-01-15","amount_kopiykas":500,"direction":"income","description":"Переказ","confidence":0.8}]}\n```',
      ),
    );

    const req = makeReq({ image_base64: PNG_BASE64, mime_type: "image/png" });
    const res = makeRes();
    await screenshotAnalyzeHandler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      draft: { bank: string | null; rows: Array<{ amountKopiykas: number }> };
    };
    expect(body.draft.bank).toBe("privat24");
    expect(body.draft.rows[0]?.amountKopiykas).toBe(500);
  });
});
