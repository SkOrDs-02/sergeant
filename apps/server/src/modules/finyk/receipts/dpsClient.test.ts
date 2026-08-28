import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * `dpsClient.ts` читає лише `env.DPS_API_TOKEN` — мокаємо саме його
 * (той самий hoisted-mutable-обʼєкт патерн, що `lib/anthropic.test.ts`),
 * щоб перемикати "токен є / нема токена" без реального env-модуля.
 */
const envMock = vi.hoisted(() => ({ DPS_API_TOKEN: "" }));
vi.mock("../../../env.js", () => ({ env: envMock }));

vi.mock("../../../obs/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../../lib/externalHttp.js", () => ({
  recordExternalHttp: vi.fn(),
}));

import { __bankProxyTestHooks } from "../../../lib/bankProxy.js";
import { dpsDateParam, fetchDpsCheckXml } from "./dpsClient.js";

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

function fetchMock(): Mock {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock as Mock;
}

/** JSON-конверт chkAll (`api-registers.html`) навколо base64-XML. */
function envelope(xml: string): string {
  return JSON.stringify({
    check: Buffer.from(xml, "utf8").toString("base64"),
    fn: "4000123456",
    xml: true,
    sign: false,
    resultCode: null,
    resultText: null,
  });
}

beforeEach(() => {
  envMock.DPS_API_TOKEN = "";
  __bankProxyTestHooks().reset();
  __bankProxyTestHooks().configure({
    retryDelaysMs: [0, 0, 0],
    retryJitterMs: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PARAMS = {
  fn: "4000123456",
  id: "RRO001",
  date: "20260115",
  time: "1432",
  sm: "150.00",
};

const XML = "<CHECK><CHECKHEAD><ORGNM>x</ORGNM></CHECKHEAD></CHECK>";

describe("dpsDateParam", () => {
  it("складає документований формат з QR date=yyyyMMdd + time=HHmm", () => {
    expect(dpsDateParam("20250713", "1423")).toBe("2025-07-13 14:23:00");
  });

  it("приймає time=HHmmss (секунди з QR зберігаються)", () => {
    expect(dpsDateParam("20260115", "143210")).toBe("2026-01-15 14:32:10");
  });

  it("нечитабельний time → 00:00:00 (дата важливіша за час)", () => {
    expect(dpsDateParam("20260115", "півдня")).toBe("2026-01-15 00:00:00");
  });

  it("нечитабельний date → null (параметр опційний, 400 гірший за пошук без дати)", () => {
    expect(dpsDateParam("15.01.2026", "1432")).toBeNull();
  });
});

describe("fetchDpsCheckXml", () => {
  it('повертає {status:"no_token"} без DPS_API_TOKEN — жодного мережевого запиту', async () => {
    const fetch = fetchMock();
    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "no_token" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("розпаковує JSON-конверт: base64(XML) у полі `check` → ok з XML", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(response(200, envelope(XML)));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "ok", xml: XML });
  });

  it("декодує windows-1251 XML за encoding= із декларації", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    // "Тест" у windows-1251: D2 E5 F1 F2 — TextEncoder такого не вміє,
    // тому байти складено вручну.
    const bytes = Buffer.concat([
      Buffer.from(
        '<?xml version="1.0" encoding="windows-1251"?><CHECK><CHECKHEAD><ORGNM>',
        "latin1",
      ),
      Buffer.from([0xd2, 0xe5, 0xf1, 0xf2]),
      Buffer.from("</ORGNM></CHECKHEAD></CHECK>", "latin1"),
    ]);
    const body = JSON.stringify({ check: bytes.toString("base64"), xml: true });
    fetchMock().mockResolvedValue(response(200, body));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.xml).toContain("<ORGNM>Тест</ORGNM>");
    }
  });

  it("толерантно приймає сирий XML у тілі (легасі-очікування первісного коду)", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(response(200, XML));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "ok", xml: XML });
  });

  it("шле id/fn/date у документованому форматі/type=1/token і НЕ шле time/sm", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    const fetch = fetchMock().mockResolvedValue(response(200, envelope(XML)));

    await fetchDpsCheckXml(PARAMS);

    const calledUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(calledUrl.href).toContain(
      "cabinet.tax.gov.ua/ws/api_public/rro/chkAll",
    );
    expect(calledUrl.searchParams.get("fn")).toBe("4000123456");
    expect(calledUrl.searchParams.get("id")).toBe("RRO001");
    expect(calledUrl.searchParams.get("date")).toBe("2026-01-15 14:32:00");
    expect(calledUrl.searchParams.get("type")).toBe("1");
    expect(calledUrl.searchParams.get("token")).toBe("secret-token");
    expect(calledUrl.searchParams.has("time")).toBe(false);
    expect(calledUrl.searchParams.has("sm")).toBe(false);
  });

  it("опускає date з query, коли QR-дата нечитабельна", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    const fetch = fetchMock().mockResolvedValue(response(200, envelope(XML)));

    await fetchDpsCheckXml({ ...PARAMS, date: "не-дата" });

    const calledUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(calledUrl.searchParams.has("date")).toBe(false);
  });

  it('повертає {status:"not_found"} на HTTP 404', async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(response(404, ""));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "not_found" });
  });

  it('повертає {status:"not_found"} на 200 із порожнім тілом (лаг реєстру)', async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(response(200, ""));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "not_found" });
  });

  it('повертає {status:"not_found"} на 200-конверт БЕЗ `check` (чека ще нема)', async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(
      response(200, '{"check":null,"resultCode":1,"resultText":"Не знайдено"}'),
    );

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "not_found" });
  });

  it("віддає ok з недекодабельним check як є — вердикт за XML-парсером (502, не 404)", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    const body = JSON.stringify({
      check: Buffer.from("не xml взагалі", "utf8").toString("base64"),
    });
    fetchMock().mockResolvedValue(response(200, body));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "ok", xml: "не xml взагалі" });
  });

  // Live-проба 2026-08-18: реєстр відповідає 400-ом «На період дії
  // воєнного стану обмежено доступ до публічних електронних реєстрів» —
  // це НЕ битий запит і НЕ невалідний токен (те саме без токена взагалі).
  it("кидає DPS_ACCESS_RESTRICTED (503) на 400 «обмежено доступ», БЕЗ ретраю", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    const fetch = fetchMock().mockResolvedValue(
      response(
        400,
        '{"error":"Помилка","error_description":"Помилка перевірки На період дії воєнного стану обмежено доступ до публічних електронних реєстрів"}',
      ),
    );

    await expect(fetchDpsCheckXml(PARAMS)).rejects.toMatchObject({
      status: 503,
      code: "DPS_ACCESS_RESTRICTED",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("кидає DPS_UPSTREAM_ERROR (502) на інший 400 («Помилка обробки запиту»)", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(
      response(
        400,
        '{"error":"Помилка","error_description":"Помилка обробки запиту"}',
      ),
    );

    await expect(fetchDpsCheckXml(PARAMS)).rejects.toMatchObject({
      status: 502,
      code: "DPS_UPSTREAM_ERROR",
    });
  });

  it("кидає ExternalServiceError (502) на 500 від upstream", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    // 3 спроби (retryDelaysMs довжина 3) — усі 500. `mockImplementation`
    // (не `mockResolvedValue`) — кожен виклик отримує СВІЖИЙ `Response`;
    // `bankProxyFetch` читає `.text()` на кожній спробі, а тіло
    // `Response` можна прочитати лише раз (той самий патерн, що
    // `lib/bankProxy.test.ts` "opens the circuit ..." тест).
    const fetch = fetchMock().mockImplementation(() =>
      Promise.resolve(response(500, "internal error")),
    );

    await expect(fetchDpsCheckXml(PARAMS)).rejects.toMatchObject({
      status: 502,
      code: "DPS_UPSTREAM_ERROR",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  // Review-фікс Trivial: 401/403 — зламаний/протермінований токен, не
  // "upstream тимчасово лежить" — окремий, не-ретраєбельний код.
  it.each([401, 403])(
    "кидає ExternalServiceError (503, DPS_AUTH_ERROR) на %i від upstream, БЕЗ ретраю",
    async (status) => {
      envMock.DPS_API_TOKEN = "secret-token";
      const fetch = fetchMock().mockResolvedValue(
        response(status, "forbidden"),
      );

      await expect(fetchDpsCheckXml(PARAMS)).rejects.toMatchObject({
        status: 503,
        code: "DPS_AUTH_ERROR",
      });
      // Не-ретраєбельний: bankProxyFetch ретраїть лише 5xx
      // (`isRetryableStatus`), тож РІВНО одна спроба на 401/403.
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
