import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/bankProxy.js", () => ({
  bankProxyFetch: vi.fn(),
}));

vi.mock("../../http/validate.js", () => ({
  parseQuery: vi.fn(),
}));

import { bankProxyFetch as _bankProxyFetch } from "../../lib/bankProxy.js";
import { parseQuery as _parseQuery } from "../../http/validate.js";
import handler from "./privat.js";

const bankProxyFetch = _bankProxyFetch as unknown as Mock;
const parseQuery = _parseQuery as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  sent: unknown;
  headers: Record<string, string>;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
  send(payload: unknown): TestRes;
  setHeader(name: string, value: string): void;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    sent: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.sent = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  return res as TestRes & Response;
}

function makeReq(
  headers: Record<string, unknown> = {},
  query: Record<string, unknown> = {},
): Request {
  return { headers, query } as unknown as Request;
}

const CREDS = { "x-privat-id": "merchant1", "x-privat-token": "secret1" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: parseQuery yields the safe balance path.
  parseQuery.mockReturnValue({ path: "/statements/balance/final" });
});

describe("privat handler — credential & path guards", () => {
  it("401 when merchant id is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ "x-privat-token": "secret1" }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Credentials відсутні" });
    expect(bankProxyFetch).not.toHaveBeenCalled();
  });

  it("401 when merchant token is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ "x-privat-id": "merchant1" }), res);
    expect(res.statusCode).toBe(401);
    expect(bankProxyFetch).not.toHaveBeenCalled();
  });

  it("400 when the requested path is not on the allowlist", async () => {
    parseQuery.mockReturnValue({ path: "/statements/secret-dump" });
    const res = makeRes();
    await handler(makeReq(CREDS), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Недозволений API шлях" });
    expect(bankProxyFetch).not.toHaveBeenCalled();
  });

  it("allows a prefixed sub-path of an allowlisted base", async () => {
    parseQuery.mockReturnValue({ path: "/statements/transactions/20240101" });
    bankProxyFetch.mockResolvedValue({
      status: 200,
      body: "[]",
      contentType: "application/json",
    });
    const res = makeRes();
    await handler(makeReq(CREDS), res);
    expect(res.statusCode).toBe(200);
    expect(bankProxyFetch).toHaveBeenCalledTimes(1);
  });

  it("400 when a header value contains a CRLF injection attempt", async () => {
    const res = makeRes();
    await handler(
      makeReq({ "x-privat-id": "good", "x-privat-token": "bad\r\nX-Evil: 1" }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Недозволений заголовок" });
    expect(bankProxyFetch).not.toHaveBeenCalled();
  });
});

describe("privat handler — upstream delegation", () => {
  it("forwards credentials to bankProxyFetch and returns parsed JSON on 200", async () => {
    bankProxyFetch.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ balance: 4200 }),
      contentType: "application/json",
    });
    const res = makeRes();
    await handler(makeReq(CREDS, { foo: "bar", path: "ignored" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ balance: 4200 });

    const call = bankProxyFetch.mock.calls[0]![0];
    expect(call).toMatchObject({
      upstream: "privatbank",
      baseUrl: "https://acp.privatbank.ua/api",
      path: "/statements/balance/final",
      headers: { id: "merchant1", token: "secret1" },
    });
    // `path` query param is stripped before forwarding to the upstream.
    expect(call.query).not.toHaveProperty("path");
    expect(call.query).toMatchObject({ foo: "bar" });
  });

  it("maps a 429 upstream to a rate-limit message", async () => {
    bankProxyFetch.mockResolvedValue({
      status: 429,
      body: "",
      contentType: "",
    });
    const res = makeRes();
    await handler(makeReq(CREDS), res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "Занадто багато запитів" });
  });

  it.each([401, 403])(
    "maps a %i upstream to an invalid-credentials message",
    async (status) => {
      bankProxyFetch.mockResolvedValue({ status, body: "", contentType: "" });
      const res = makeRes();
      await handler(makeReq(CREDS), res);
      expect(res.statusCode).toBe(status);
      expect(res.body).toEqual({ error: "Невірні credentials PrivatBank" });
    },
  );

  it("passes through the upstream body for other error statuses", async () => {
    bankProxyFetch.mockResolvedValue({
      status: 500,
      body: "upstream exploded",
      contentType: "text/plain",
    });
    const res = makeRes();
    await handler(makeReq(CREDS), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "upstream exploded" });
  });

  it("falls back to a generic message when an error body is empty", async () => {
    bankProxyFetch.mockResolvedValue({
      status: 503,
      body: "",
      contentType: "",
    });
    const res = makeRes();
    await handler(makeReq(CREDS), res);
    expect(res.body).toEqual({ error: "Помилка 503" });
  });

  it("streams a non-JSON 200 body through with its content-type", async () => {
    bankProxyFetch.mockResolvedValue({
      status: 200,
      body: "not-json-at-all",
      contentType: "text/csv; charset=utf-8",
    });
    const res = makeRes();
    await handler(makeReq(CREDS), res);
    expect(res.statusCode).toBe(200);
    expect(res.sent).toBe("not-json-at-all");
    expect(res.headers["Content-Type"]).toBe("text/csv; charset=utf-8");
    expect(res.body).toBeUndefined();
  });
});
