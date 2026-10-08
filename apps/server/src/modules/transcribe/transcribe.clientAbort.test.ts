/**
 * rel-17 (`docs/work/specs/audits/2026-10-01-full-app-audit/reliability.md`) —
 * розрив з'єднання клієнтом має скасовувати виклик Groq Whisper.
 *
 * РЕАЛЬНИЙ `http.createServer` + Express у формі, як у проді: `express.raw` →
 * async-мідлвара з `await` → хендлер. Слухач `req.on("close")` у хендлері
 * ніколи не спрацьовував, бо `req` емітить 'close' одразу після дочитування
 * тіла, ще до реєстрації слухача. Юніт-тести з EventEmitter-моком цього не
 * бачать.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Mock } from "vitest";

vi.mock("../../lib/groq.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/groq.js")>(
      "../../lib/groq.js",
    );
  return { ...actual, transcribeAudio: vi.fn() };
});

import { transcribeAudio as _transcribeAudio } from "../../lib/groq.js";
import transcribeHandler from "./transcribe.js";

const transcribeAudio = _transcribeAudio as unknown as Mock;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: http.Server | undefined;

async function startServer(): Promise<number> {
  const app = express();
  app.use(express.raw({ type: "audio/*" }));
  // Форма як у проді: async-мідлвара з реальним `await` перед хендлером.
  app.use(async (req, _res, next) => {
    await sleep(25);
    (req as unknown as { groqKey: string }).groqKey = "test-key";
    next();
  });
  app.post("/api/transcribe", (req, res, next) => {
    transcribeHandler(req, res).catch(next);
  });
  app.use(
    (
      _err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (!res.headersSent) res.status(500).json({ error: "test" });
    },
  );
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

function post(port: number): http.ClientRequest {
  const payload = Buffer.from(new Uint8Array([1, 2, 3, 4]));
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: "/api/transcribe",
    method: "POST",
    headers: {
      "content-type": "audio/webm",
      "content-length": payload.length,
    },
  });
  req.on("error", () => {
    /* очікуваний ECONNRESET після destroy() */
  });
  req.end(payload);
  return req;
}

async function waitForUpstreamSignal(): Promise<AbortSignal> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const arg = transcribeAudio.mock.calls[0]?.[0] as
      { signal?: AbortSignal } | undefined;
    if (arg?.signal) return arg.signal;
    await sleep(10);
  }
  throw new Error("Groq не було викликано");
}

beforeEach(() => {
  transcribeAudio.mockReset();
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("transcribe handler — client disconnect (rel-17, реальний HTTP-сервер)", () => {
  it("розрив сокета під час Groq-виклику abort-ить сигнал", async () => {
    transcribeAudio.mockImplementation(
      (args: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          args.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const port = await startServer();
    const clientReq = post(port);

    const signal = await waitForUpstreamSignal();
    expect(signal.aborted).toBe(false);

    await sleep(100);
    clientReq.destroy();
    await sleep(150);

    expect(signal.aborted).toBe(true);
  });

  it("штатно завершена відповідь НЕ abort-ить сигнал", async () => {
    transcribeAudio.mockResolvedValue({ text: "ok", durationSec: 1 });

    const port = await startServer();
    const status = await new Promise<number>((resolve, reject) => {
      const clientReq = post(port);
      clientReq.on("response", (r) => {
        r.resume();
        r.on("end", () => resolve(r.statusCode ?? 0));
      });
      clientReq.on("error", reject);
    });
    expect(status).toBe(200);

    const signal = await waitForUpstreamSignal();
    await sleep(100);
    expect(signal.aborted).toBe(false);
  });
});
