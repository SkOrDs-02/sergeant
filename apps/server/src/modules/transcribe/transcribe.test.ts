import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../../lib/groq.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/groq.js")>(
      "../../lib/groq.js",
    );
  return {
    ...actual,
    transcribeAudio: vi.fn(),
  };
});

import {
  transcribeAudio as _transcribeAudio,
  GroqTranscribeError,
} from "../../lib/groq.js";
import transcribeHandler from "./transcribe.js";

const transcribeAudio = _transcribeAudio as unknown as Mock;

interface TestRes {
  statusCode: number;
  body:
    | {
        error?: string;
        code?: string;
        text?: string;
        durationSec?: number | null;
        model?: string;
      }
    | undefined;
  writableEnded: boolean;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as TestRes["body"];
      this.writableEnded = true;
      return this;
    },
  };
  return res as TestRes & Response;
}

interface MakeReqOpts {
  contentType?: string | null;
  body?: Buffer | unknown;
  query?: Record<string, string>;
  /** `null` явно прибирає groqKey (для теста 503-кейса). */
  groqKey?: string | null;
}

function makeReq(opts: MakeReqOpts = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.contentType !== null) {
    headers["content-type"] = opts.contentType ?? "audio/webm";
  }
  const emitter = new EventEmitter();
  const groqKey =
    opts.groqKey === null
      ? undefined
      : opts.groqKey === undefined
        ? "test-key"
        : opts.groqKey;
  const req = Object.assign(emitter, {
    headers,
    body: opts.body ?? Buffer.from(""),
    query: opts.query ?? {},
    groqKey,
  });
  return req as unknown as Request;
}

describe("transcribeHandler", () => {
  beforeEach(() => {
    transcribeAudio.mockReset();
  });

  it("503 коли GROQ_API_KEY відсутній", async () => {
    const req = makeReq({ groqKey: null });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe("GROQ_KEY_MISSING");
  });

  it("415 на неаудіо Content-Type", async () => {
    const req = makeReq({
      contentType: "application/json",
      body: Buffer.from("x"),
    });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(415);
    expect(res.body?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("415 на неподтримуваний audio MIME", async () => {
    const req = makeReq({
      contentType: "audio/aac",
      body: Buffer.from("x"),
    });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(415);
  });

  it("400 на порожнє тіло", async () => {
    const req = makeReq({ body: Buffer.alloc(0) });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.code).toBe("EMPTY_BODY");
  });

  it("400 коли тіло не Buffer (raw парсер не спрацював)", async () => {
    const req = makeReq({ body: { foo: "bar" } });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("413 на тіло понад 10MB", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    const req = makeReq({ body: big });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(413);
    expect(res.body?.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("400 на занадто довгий prompt", async () => {
    const req = makeReq({
      body: Buffer.from("x"),
      query: { prompt: "a".repeat(2000) },
    });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("happy path: повертає text + durationSec", async () => {
    transcribeAudio.mockResolvedValueOnce({
      text: "жим штанги 80 кг 8 разів",
      durationSec: 3.4,
    });
    const req = makeReq({
      body: Buffer.from(new Uint8Array([1, 2, 3, 4])),
      query: { language: "uk", prompt: "жим, присід, тяга" },
    });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body?.text).toBe("жим штанги 80 кг 8 разів");
    expect(res.body?.durationSec).toBe(3.4);
    expect(res.body?.model).toBeTruthy();
    expect(transcribeAudio).toHaveBeenCalledOnce();
    const callArg = transcribeAudio.mock.calls[0][0];
    expect(callArg.language).toBe("uk");
    expect(callArg.prompt).toBe("жим, присід, тяга");
    expect(callArg.mimeType).toBe("audio/webm");
  });

  it("проксіює статус і outcome з GroqTranscribeError", async () => {
    transcribeAudio.mockRejectedValueOnce(
      new GroqTranscribeError("upstream 429", 429, "rate_limited"),
    );
    const req = makeReq({ body: Buffer.from("x") });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(429);
    expect(res.body?.code).toBe("TRANSCRIBE_UPSTREAM_FAILED");
  });

  it("re-throw на не-Groq помилку (попадає в errorHandler)", async () => {
    transcribeAudio.mockRejectedValueOnce(new Error("boom"));
    const req = makeReq({ body: Buffer.from("x") });
    const res = makeRes();
    await expect(transcribeHandler(req, res)).rejects.toThrow("boom");
  });
});
