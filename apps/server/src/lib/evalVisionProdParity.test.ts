/**
 * Паритет зорового стенду з продом на ТРАНСПОРТІ (2026-11-19).
 *
 * `evalVisionStand.test.ts` перевіряє промпти, але стенд до цього дня ходив
 * іншим транспортом (`/chat/completions` з `image_url`), ніж прод
 * (`anthropicMessages` → `/messages`). Тут ловимо, що САМ прод передає в
 * `anthropicMessages` на кожному з чотирьох зорових шляхів (чек, виписка,
 * analyze-photo, refine-photo), і порівнюємо з тілом, яке будує стенд:
 * байт у байт (порядок полів включно), плюс таймаут і `endpoint`. Хтось
 * змінить `max_tokens`, температуру чи промпт у проді — тест упаде, а не
 * стенд тихо мірятиме інший виклик.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import type { Request, Response } from "express";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  anthropicResponses,
  createAnthropicMockHandle,
} from "../test/__mocks__/anthropic.js";

vi.mock("./anthropic.js", () => createAnthropicMockHandle());

import { anthropicMessages as _anthropicMessages } from "./anthropic.js";
import { env } from "../env/env.js";
import { callReceiptVision } from "../modules/finyk/receipts/visionClient.js";
import { callImportScreenshotVision } from "../modules/finyk/import/visionClient.js";
import analyzePhotoHandler from "../modules/nutrition/analyze-photo.js";
import refinePhotoHandler from "../modules/nutrition/refine-photo.js";
import { validateImageBase64 } from "./imageMagic.js";
import { REFINE_INPUT, VISION_PIPELINES } from "../../scripts/eval/vision.js";
import {
  buildProdVisionPayload,
  receiptShape,
  statementShape,
  type ProdVisionShape,
} from "../../scripts/eval/visionProdTransport.js";
import { fixtureImage } from "../../scripts/eval/vision.finyk.js";
import {
  FIXTURE_FILES,
  RECEIPTS,
  STATEMENTS,
  STATEMENT_TODAY,
} from "../../scripts/eval/visionDocs.data.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const mutableEnv = env as unknown as Record<string, unknown>;
const saved = { ...mutableEnv };

const pipeline = (key: string) => {
  const p = VISION_PIPELINES.find((x) => x.key === key);
  if (!p) throw new Error(`пайплайн ${key} зник зі стенду`);
  return p;
};

/** Останній виклик `anthropicMessages`: тіло й опції. */
function lastCall(): {
  payload: Record<string, unknown>;
  opts: Record<string, unknown>;
} {
  const call = anthropicMessages.mock.calls.at(-1) as
    [string, Record<string, unknown>, Record<string, unknown>] | undefined;
  if (!call) throw new Error("прод не викликав anthropicMessages");
  return { payload: call[1], opts: call[2] };
}

function expectSameCall(
  shape: ProdVisionShape,
  image: { base64: string; mimeType: string },
) {
  const { payload, opts } = lastCall();
  const bench = buildProdVisionPayload(String(payload["model"]), shape, image);
  // JSON-рядок, а не toEqual: порядок полів теж частина «того самого тіла».
  expect(JSON.stringify(payload)).toBe(JSON.stringify(bench));
  expect(opts["timeoutMs"]).toBe(shape.timeoutMs);
  expect(opts["endpoint"]).toBe(shape.prodEndpoint);
  // Прод іде на шлюз, як і стенд (`allowOpenRouter: true` для openrouter-кандидата).
  expect(opts["allowOpenRouter"]).toBe(true);
}

function fakeRes(): Response {
  const res = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json: vi.fn(),
    on: vi.fn(),
    writableFinished: false,
  };
  return res as unknown as Response;
}

beforeEach(() => {
  anthropicMessages.mockReset();
  anthropicMessages.mockResolvedValue(anthropicResponses.text("{}"));
  mutableEnv["OPENROUTER_API_KEY"] = "test-gateway-key";
  mutableEnv["LLM_RECEIPT_PROVIDER"] = "openrouter";
  mutableEnv["VISION_VIA_OPENROUTER"] = true;
});

afterEach(() => {
  Object.assign(mutableEnv, saved);
  vi.useRealTimers();
});

describe("зоровий стенд шле те саме тіло, що прод", () => {
  it("скан чека — `callReceiptVision`", async () => {
    const image = fixtureImage(FIXTURE_FILES.receipt("cafe"));
    await callReceiptVision({
      base64: image.base64,
      mediaType: image.mimeType,
    });
    expectSameCall(receiptShape(), image);
    expect(pipeline("receipt-scan").shape).toEqual(receiptShape());
  });

  it("імпорт виписки — `callImportScreenshotVision` з тим самим якорем дати", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${STATEMENT_TODAY}T10:00:00Z`));
    const image = fixtureImage(FIXTURE_FILES.statement("app-light"));
    await callImportScreenshotVision({
      base64: image.base64,
      mediaType: image.mimeType,
    });
    expectSameCall(statementShape(STATEMENT_TODAY), image);
    expect(pipeline("statement-import").shape).toEqual(
      statementShape(STATEMENT_TODAY),
    );
  });

  it("analyze-photo — продовий хендлер", async () => {
    const p = pipeline("analyze-photo");
    const image = p.cases[0]?.image;
    if (!image) throw new Error("кейс без зображення");
    const req = {
      body: {
        image_base64: image.base64,
        mime_type: image.mimeType,
        locale: "uk-UA",
      },
      anthropicKey: "k",
    } as unknown as Request;
    await analyzePhotoHandler(req, fakeRes());
    expectSameCall(p.shape, image);
  });

  it("refine-photo — продовий хендлер з тілом кейса", async () => {
    const p = pipeline("refine-photo");
    const c = p.cases[0];
    if (!c?.image) throw new Error("кейс без зображення");
    const req = {
      body: {
        ...REFINE_INPUT,
        image_base64: c.image.base64,
        mime_type: c.image.mimeType,
      },
      anthropicKey: "k",
    } as unknown as Request;
    await refinePhotoHandler(req, fakeRes());
    expectSameCall({ ...p.shape, user: c.user }, c.image);
  });

  it("кейси фінʼїка несуть продовий user-промпт пайплайна", () => {
    for (const key of ["receipt-scan", "statement-import"]) {
      const p = pipeline(key);
      for (const c of p.cases)
        expect(c.user, `${key}/${c.name}`).toBe(p.shape.user);
    }
  });
});

describe("фікстури чеків і виписок", () => {
  const dir = new URL("../__fixtures__/vision-eval/", import.meta.url);

  it("кожен документ даних має файл, і прод-валідатор його приймає", () => {
    const files = [
      ...RECEIPTS.map((d) => FIXTURE_FILES.receipt(d.key)),
      ...STATEMENTS.map((d) => FIXTURE_FILES.statement(d.key)),
      FIXTURE_FILES.chat,
    ];
    for (const file of files) {
      const image = fixtureImage(file);
      const v = validateImageBase64(image.base64, image.mimeType);
      expect(v.ok, `${file}: ${JSON.stringify(v)}`).toBe(true);
    }
    // Зайвих файлів немає: каталог = дані, інакше фікстура тихо застаріла.
    expect(readdirSync(dir).sort()).toEqual([...files].sort());
  });

  it("сумарно до 1,5 МБ (бриф: малі фікстури в репо)", () => {
    const total = readdirSync(dir).reduce(
      (s, f) => s + statSync(new URL(f, dir)).size,
      0,
    );
    expect(total).toBeLessThan(1_500_000);
  });

  it("жодних схожих на справжні реквізитів у даних", () => {
    for (const file of ["visionDocs.data.ts", "visionDocs.statements.ts"]) {
      const source = readFileSync(
        new URL(`../../scripts/eval/${file}`, import.meta.url),
        "utf-8",
      );
      // IBAN (UA + 27 цифр), 16-значні номери карток, 10-значний ІПН.
      expect(source, file).not.toMatch(/UA\d{27}/);
      expect(source, file).not.toMatch(
        /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/,
      );
      expect(source, file).not.toMatch(/\b\d{10}\b/);
    }
  });
});
