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
import transcribeHandler, { __testing } from "./transcribe.js";

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
  writableFinished: boolean;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  // Хендлер слухає `res.on("close")` (rel-17), тож мок — EventEmitter.
  const res: TestRes = Object.assign(new EventEmitter(), {
    statusCode: 200,
    body: undefined as TestRes["body"],
    writableEnded: false,
    writableFinished: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as TestRes["body"];
      this.writableEnded = true;
      this.writableFinished = true;
      return this;
    },
  });
  return res as unknown as TestRes & Response;
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

  it("ValidationError на занадто довгий prompt", async () => {
    const req = makeReq({
      body: Buffer.from("x"),
      query: { prompt: "a".repeat(2000) },
    });
    await expect(transcribeHandler(req, makeRes())).rejects.toMatchObject({
      name: "ValidationError",
    });
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
    const callArg = transcribeAudio!.mock.calls[0]![0];
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

  // M5 — audio MIME aliases must be folded onto the canonical form.
  // See docs/security/hardening/M5-audio-mime-normalize.md.
  it.each([
    ["audio/wave", "audio/wav"],
    ["audio/x-wav", "audio/wav"],
    ["audio/m4a", "audio/mp4"],
    ["audio/x-m4a", "audio/mp4"],
    ["audio/mp3", "audio/mpeg"],
  ])("M5: alias %s normalises to canonical %s", async (alias, canonical) => {
    transcribeAudio.mockResolvedValueOnce({ text: "ok", durationSec: 1 });
    const req = makeReq({
      contentType: alias,
      body: Buffer.from(new Uint8Array([1, 2, 3])),
    });
    const res = makeRes();
    await transcribeHandler(req, res);
    expect(res.statusCode).toBe(200);
    const callArg = transcribeAudio!.mock.calls[0]![0];
    expect(callArg.mimeType).toBe(canonical);
  });
});

// M4 — Groq Whisper model allowlist. HR-2 moved enforcement to the env
// single-source-of-truth: `GROQ_TRANSCRIBE_MODEL` is a `z.enum` + default in
// `apps/server/src/env/env.ts`, so an unknown model fails the enum → boot
// fail-fast at env parse. Full default / empty-string / unknown-rejection
// semantics now live in `apps/server/src/env/groqTranscribeModel.test.ts`;
// here we only smoke that resolveGroqModel routes through the validated env.
describe("M4: GROQ_TRANSCRIBE_MODEL allowlist", () => {
  it("resolveGroqModel returns the env-resolved, allowlisted model", () => {
    expect(["whisper-large-v3-turbo", "whisper-large-v3"]).toContain(
      __testing.resolveGroqModel(),
    );
  });
});

// rel-17 — abort слухає `res` 'close', а не `req` 'close': на момент, коли
// хендлер реєструє слухача (після async-мідлвар і `assertTranscribeUsdCap`),
// `req` вже відеміттив 'close'. Реальний сокет-тест: `transcribe.clientAbort.test.ts`.
describe("rel-17: client disconnect → abort Groq-виклику", () => {
  async function runUntilUpstream(res: TestRes & Response) {
    let signal: AbortSignal | undefined;
    let release!: () => void;
    transcribeAudio.mockImplementationOnce(
      (args: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal = args.signal;
          release = () => resolve({ text: "ok", durationSec: 1 });
        }),
    );
    const req = makeReq({ body: Buffer.from(new Uint8Array([1, 2, 3])) });
    const done = transcribeHandler(req, res);
    while (!signal) await new Promise((r) => setTimeout(r, 1));
    return { req, signal, release, done };
  }

  it("res 'close' до завершення відповіді abort-ить сигнал", async () => {
    const res = makeRes();
    const { signal, release, done } = await runUntilUpstream(res);
    expect(signal.aborted).toBe(false);
    res.emit("close");
    expect(signal.aborted).toBe(true);
    release();
    await done;
  });

  it("req 'close' сигнал НЕ чіпає (слухач саме на res)", async () => {
    const res = makeRes();
    const { req, signal, release, done } = await runUntilUpstream(res);
    (req as unknown as EventEmitter).emit("close");
    expect(signal.aborted).toBe(false);
    release();
    await done;
  });

  it("res 'close' після штатного завершення (writableFinished) не abort-ить", async () => {
    const res = makeRes();
    const { signal, release, done } = await runUntilUpstream(res);
    release();
    await done;
    expect(res.writableFinished).toBe(true);
    res.emit("close");
    expect(signal.aborted).toBe(false);
  });
});
