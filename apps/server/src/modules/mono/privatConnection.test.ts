/**
 * Хендлери підключення ПриватБанку: connect / disconnect / status.
 *
 * Тест стереже три речі, які тут коштують дорожче за решту.
 *
 * Перша — **credentials перевіряються ДО збереження**. Шапка модуля
 * пояснює чому: без проби «невірний токен» перетворюється на підключення,
 * що виглядає справним і падає аж на першій синхронізації.
 *
 * Друга — **CRLF у merchantId чи токені відкидається на вході**. Обидва
 * значення йдуть у заголовки upstream-запиту, тож перенос рядка дозволив
 * би дописати свої заголовки. Перевірка стоїть один раз тут, а не перед
 * кожним проксі-викликом, і саме тому мусить мати тест: зникне вона тихо.
 *
 * Третя — **тіло upstream-помилки не тече клієнту**. Назовні йде лише
 * стабільний код, бо відповідь банку може нести внутрішні деталі.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/bankProxy.js", () => ({
  bankProxyFetch: vi.fn(),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("./privatStore.js", () => ({
  savePrivatCredentials: vi.fn(),
  deletePrivatCredentials: vi.fn(),
  getPrivatStatus: vi.fn(),
}));

import { bankProxyFetch as _bankProxyFetch } from "../../lib/bankProxy.js";
import {
  savePrivatCredentials as _save,
  deletePrivatCredentials as _delete,
  getPrivatStatus as _status,
} from "./privatStore.js";
import { logger } from "../../obs/logger.js";
import {
  privatConnectHandler,
  privatDisconnectHandler,
  privatStatusHandler,
} from "./privatConnection.js";

const bankProxyFetch = _bankProxyFetch as unknown as Mock;
const savePrivatCredentials = _save as unknown as Mock;
const deletePrivatCredentials = _delete as unknown as Mock;
const getPrivatStatus = _status as unknown as Mock;

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

/** Автентифікований запит. `user` ставить `requireSession` у роутері. */
function makeReq(
  body: unknown = {},
  user: { id: string } | null = { id: "user-1" },
): Request {
  return { body, ...(user ? { user } : {}) } as unknown as Request;
}

const okProbe = { status: 200, body: "{}" };

beforeEach(() => {
  vi.clearAllMocks();
  bankProxyFetch.mockResolvedValue(okProbe);
  savePrivatCredentials.mockResolvedValue(undefined);
  deletePrivatCredentials.mockResolvedValue(undefined);
  getPrivatStatus.mockResolvedValue({ connected: false });
});

describe("privatConnectHandler", () => {
  it("зберігає credentials лише після успішної проби", async () => {
    const res = makeRes();
    await privatConnectHandler(
      makeReq({ merchantId: "m-1", token: "t-1" }),
      res,
    );

    expect(bankProxyFetch).toHaveBeenCalledTimes(1);
    expect(savePrivatCredentials).toHaveBeenCalledWith("user-1", {
      merchantId: "m-1",
      token: "t-1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ connected: true, merchantId: "m-1" });
  });

  it("проба йде найдешевшим авторизованим викликом і несе credentials у заголовках", async () => {
    await privatConnectHandler(
      makeReq({ merchantId: "m-1", token: "t-1" }),
      makeRes(),
    );

    const call = bankProxyFetch.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      upstream: "privatbank",
      path: "/statements/balance/final",
      headers: expect.objectContaining({ id: "m-1", token: "t-1" }),
    });
  });

  it("обрізає пробіли навколо значень", async () => {
    await privatConnectHandler(
      makeReq({ merchantId: "  m-1  ", token: "\tt-1 " }),
      makeRes(),
    );
    expect(savePrivatCredentials).toHaveBeenCalledWith("user-1", {
      merchantId: "m-1",
      token: "t-1",
    });
  });

  it("без сесії — кидає UnauthorizedError і жодного звернення до банку", async () => {
    await expect(
      privatConnectHandler(
        makeReq({ merchantId: "m-1", token: "t-1" }, null),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "UnauthorizedError",
      status: 401,
      code: "UNAUTHORIZED",
    });

    expect(bankProxyFetch).not.toHaveBeenCalled();
    expect(savePrivatCredentials).not.toHaveBeenCalled();
  });

  it.each([
    ["обидва порожні", {}],
    ["немає токена", { merchantId: "m-1" }],
    ["немає merchantId", { token: "t-1" }],
    ["порожні рядки", { merchantId: "   ", token: "  " }],
    ["не рядки", { merchantId: 42, token: ["t"] }],
  ])("кидає ValidationError без проби, коли %s", async (_label, body) => {
    await expect(
      privatConnectHandler(makeReq(body), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      status: 400,
      code: "VALIDATION",
      message: "Введи Merchant ID та токен",
    });

    expect(bankProxyFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["merchantId", { merchantId: "m-1\r\nX-Injected: 1", token: "t-1" }],
    ["токені", { merchantId: "m-1", token: "t-1\nX-Injected: 1" }],
  ])("відкидає CRLF у %s до звернення в банк", async (_label, body) => {
    await expect(
      privatConnectHandler(makeReq(body), makeRes()),
    ).rejects.toMatchObject({
      name: "ValidationError",
      status: 400,
      code: "VALIDATION",
      message: "Недозволені символи в credentials",
    });

    // Головне саме це: значення не доїхало до збирача заголовків.
    expect(bankProxyFetch).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "%s від банку кидає AppError зі стабільним кодом і нічого не зберігає",
    async (status) => {
      bankProxyFetch.mockResolvedValue({ status, body: "" });

      await expect(
        privatConnectHandler(
          makeReq({ merchantId: "m-1", token: "bad" }),
          makeRes(),
        ),
      ).rejects.toMatchObject({
        status,
        code: "PRIVAT_CREDENTIALS_INVALID",
      });

      expect(savePrivatCredentials).not.toHaveBeenCalled();
    },
  );

  it("інша помилка банку кидає ExternalServiceError(502), а тіло upstream назовні не тече", async () => {
    bankProxyFetch.mockResolvedValue({
      status: 500,
      body: "внутрішня деталь банку",
    });

    let caught: unknown;
    try {
      await privatConnectHandler(
        makeReq({ merchantId: "m-1", token: "t-1" }),
        makeRes(),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toMatchObject({
      name: "ExternalServiceError",
      status: 502,
      code: "PRIVAT_UPSTREAM_ERROR",
      message: "ПриватБанк недоступний",
    });
    expect(JSON.stringify((caught as Error).message)).not.toContain(
      "внутрішня деталь",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "privat_connect_probe_failed" }),
    );
  });

  it("падіння запису кидає AppError(500), а не мовчазним «підключено»", async () => {
    savePrivatCredentials.mockRejectedValue(new Error("db down"));

    await expect(
      privatConnectHandler(
        makeReq({ merchantId: "m-1", token: "t-1" }),
        makeRes(),
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 500,
      message: "Не вдалося зберегти підключення",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "privat_connect_persist_failed" }),
    );
  });
});

describe("privatDisconnectHandler", () => {
  it("витирає credentials власника сесії", async () => {
    const res = makeRes();
    await privatDisconnectHandler(makeReq(), res);

    expect(deletePrivatCredentials).toHaveBeenCalledWith("user-1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ connected: false });
  });

  it("без сесії — кидає UnauthorizedError і нічого не витирає", async () => {
    await expect(
      privatDisconnectHandler(makeReq({}, null), makeRes()),
    ).rejects.toMatchObject({
      name: "UnauthorizedError",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(deletePrivatCredentials).not.toHaveBeenCalled();
  });
});

describe("privatStatusHandler", () => {
  it("віддає статус саме цього користувача", async () => {
    getPrivatStatus.mockResolvedValue({ connected: true, merchantId: "m-1" });
    const res = makeRes();
    await privatStatusHandler(makeReq(), res);

    expect(getPrivatStatus).toHaveBeenCalledWith("user-1");
    expect(res.body).toEqual({ connected: true, merchantId: "m-1" });
  });

  it("без сесії — кидає UnauthorizedError і жодного читання зі сховища", async () => {
    await expect(
      privatStatusHandler(makeReq({}, null), makeRes()),
    ).rejects.toMatchObject({
      name: "UnauthorizedError",
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(getPrivatStatus).not.toHaveBeenCalled();
  });
});
