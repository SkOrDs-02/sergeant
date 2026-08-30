import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const dpsMocks = vi.hoisted(() => ({ fetchDpsCheckXml: vi.fn() }));
vi.mock("./dpsClient.js", () => ({
  fetchDpsCheckXml: dpsMocks.fetchDpsCheckXml,
}));

import lookupReceiptHandler from "./lookup.js";

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

const VALID_BODY = {
  fn: "4000123456",
  id: "RRO001",
  date: "20260115",
  time: "143210",
  sm: "150.00",
};

function makeReq(body: unknown = VALID_BODY): Request {
  return { body } as unknown as Request;
}

const VALID_XML =
  '<CHECK><CHECKHEAD><ORGNM>Сільпо</ORGNM><ORGTIN>30363252</ORGTIN><ORDATE>20260115</ORDATE><ORTIME>143210</ORTIME><ORDERTAXNUM>4000123456</ORDERTAXNUM><SUM>15000</SUM></CHECKHEAD><CHECKBODY><ROW ROWNUM="1"><NAME>Молоко</NAME><AMOUNT>1</AMOUNT><PRICE>3200</PRICE><COST>3200</COST></ROW></CHECKBODY></CHECK>';

beforeEach(() => {
  dpsMocks.fetchDpsCheckXml.mockReset();
});

describe("lookupReceiptHandler", () => {
  it("503 DPS_TOKEN_MISSING, коли токена нема", async () => {
    dpsMocks.fetchDpsCheckXml.mockResolvedValueOnce({ status: "no_token" });
    await expect(
      lookupReceiptHandler(makeReq(), makeRes()),
    ).rejects.toMatchObject({
      status: 503,
      code: "DPS_TOKEN_MISSING",
    });
  });

  it("404 DPS_RECEIPT_NOT_FOUND, коли чека ще нема в реєстрі", async () => {
    dpsMocks.fetchDpsCheckXml.mockResolvedValueOnce({ status: "not_found" });
    await expect(
      lookupReceiptHandler(makeReq(), makeRes()),
    ).rejects.toMatchObject({
      status: 404,
      code: "DPS_RECEIPT_NOT_FOUND",
    });
  });

  it("502 DPS_PARSE_ERROR, коли XML не розпізнається", async () => {
    dpsMocks.fetchDpsCheckXml.mockResolvedValueOnce({
      status: "ok",
      xml: "<html>щось інше</html>",
    });
    await expect(
      lookupReceiptHandler(makeReq(), makeRes()),
    ).rejects.toMatchObject({
      status: 502,
      code: "DPS_PARSE_ERROR",
    });
  });

  it("happy path: повертає draft з source:'dps' і БЕЗ запису в БД", async () => {
    dpsMocks.fetchDpsCheckXml.mockResolvedValueOnce({
      status: "ok",
      xml: VALID_XML,
    });

    const res = makeRes();
    await lookupReceiptHandler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { draft: Record<string, unknown> };
    expect(body.draft["source"]).toBe("dps");
    expect(body.draft["store"]).toBe("Сільпо");
    expect(body.draft["fiscalNum"]).toBe("4000123456");
    expect(body.draft["totalKopiykas"]).toBe(15000);
    expect(body.draft["confidence"]).toBeNull();
    expect(body.draft["rawPayload"]).toEqual({ xml: VALID_XML });
  });

  it("fiscalNum падає назад на body.fn, якщо ORDERTAXNUM у XML відсутній", async () => {
    const xmlWithoutFiscal = VALID_XML.replace(
      "<ORDERTAXNUM>4000123456</ORDERTAXNUM>",
      "",
    );
    dpsMocks.fetchDpsCheckXml.mockResolvedValueOnce({
      status: "ok",
      xml: xmlWithoutFiscal,
    });

    const res = makeRes();
    await lookupReceiptHandler(makeReq(VALID_BODY), res);

    const body = res.body as { draft: Record<string, unknown> };
    expect(body.draft["fiscalNum"]).toBe(VALID_BODY.fn);
  });

  it("передає всі пʼять полів body у fetchDpsCheckXml", async () => {
    dpsMocks.fetchDpsCheckXml.mockResolvedValueOnce({
      status: "ok",
      xml: VALID_XML,
    });
    await lookupReceiptHandler(makeReq(), makeRes());
    expect(dpsMocks.fetchDpsCheckXml).toHaveBeenCalledWith(VALID_BODY);
  });
});
