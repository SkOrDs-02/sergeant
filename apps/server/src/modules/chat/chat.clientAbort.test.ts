/**
 * rel-17 (`docs/work/specs/audits/2026-10-01-full-app-audit/reliability.md`) —
 * розрив з'єднання клієнтом має скасовувати upstream-виклик LLM.
 *
 * Юніт-тести `chat.test.ts` / `chat.stream.test.ts` мокають Express-`req`/`res`
 * і роблять `on()` no-op, тож нездатні зловити цей клас багів: слухач
 * `req.on("close")` реєструвався в хендлері ПІСЛЯ async-мідлвар
 * (`requireSession`, `requireAiQuota`), а в Node >=16 `IncomingMessage`
 * емітить 'close' одразу після дочитування тіла — до реєстрації. Сигнал був
 * мертвий, і закрита вкладка оплачувалась повністю.
 *
 * Тут — РЕАЛЬНИЙ `http.createServer` з Express у формі, як у проді: `express.json`
 * → async-мідлвара з `await` → хендлер. `anthropicMessages` — fake upstream, що
 * тримає запит і слухає `options.signal`. Клієнт рве сокет, поки upstream ще
 * «думає».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
  ),
  recordAnthropicUsage: vi.fn(),
}));

const { resolveHealthConsentMock } = vi.hoisted(() => ({
  resolveHealthConsentMock: vi.fn(),
}));
vi.mock("../../lib/healthConsent.js", () => ({
  resolveHealthConsent: resolveHealthConsentMock,
}));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: http.Server | undefined;

async function startServer(): Promise<number> {
  const app = express();
  app.use(express.json());
  // Форма як у проді: до хендлера стоять async-мідлвари з реальним `await`
  // (сесія/квота ходять у БД). Саме вони відсувають реєстрацію слухача за
  // момент, коли `req` вже відеміттив 'close'.
  app.use(async (req, _res, next) => {
    await sleep(25);
    (req as unknown as { anthropicKey: string }).anthropicKey = "sk-test";
    next();
  });
  app.post("/api/chat", (req, res, next) => {
    handler(req, res).catch(next);
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

function post(port: number, body: unknown): http.ClientRequest {
  const payload = JSON.stringify(body);
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: "/api/chat",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    },
  });
  req.on("error", () => {
    /* очікуваний ECONNRESET після destroy() */
  });
  req.end(payload);
  return req;
}

/** Чекає, поки fake upstream отримає виклик, і повертає його signal. */
async function waitForUpstreamSignal(): Promise<AbortSignal> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const opts = anthropicMessages.mock.calls[0]?.[2] as
      { signal?: AbortSignal } | undefined;
    if (opts?.signal) return opts.signal;
    await sleep(10);
  }
  throw new Error("upstream не було викликано");
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  resolveHealthConsentMock.mockReset();
  resolveHealthConsentMock.mockResolvedValue(true);
  __resetChatResponseCache();
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe("chat handler — client disconnect (rel-17, реальний HTTP-сервер)", () => {
  it("розрив сокета під час upstream-виклику abort-ить сигнал, переданий в Anthropic", async () => {
    // Fake upstream: висить, доки не прилетить abort (як справжній fetch).
    anthropicMessages.mockImplementation(
      (_key: string, _payload: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    const port = await startServer();
    const clientReq = post(port, {
      messages: [{ role: "user", content: "rel-17 disconnect" }],
    });

    const signal = await waitForUpstreamSignal();
    expect(signal.aborted).toBe(false);

    // Клієнт іде геть (закрита вкладка / «стоп» / обрив мережі).
    await sleep(100);
    clientReq.destroy();
    await sleep(150);

    expect(signal.aborted).toBe(true);
  });

  it("штатно завершена відповідь НЕ abort-ить сигнал", async () => {
    anthropicMessages.mockResolvedValue({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Привіт" }] },
    });

    const port = await startServer();
    const status = await new Promise<number>((resolve, reject) => {
      const clientReq = post(port, {
        messages: [{ role: "user", content: "rel-17 normal completion" }],
      });
      clientReq.on("response", (r) => {
        r.resume();
        r.on("end", () => resolve(r.statusCode ?? 0));
      });
      clientReq.on("error", reject);
    });
    expect(status).toBe(200);

    const signal = await waitForUpstreamSignal();
    // Дати res 'close' (після штатного завершення) відпрацювати.
    await sleep(100);
    expect(signal.aborted).toBe(false);
  });
});
