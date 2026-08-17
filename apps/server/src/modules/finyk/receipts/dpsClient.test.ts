import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * `dpsClient.ts` читає лише `env.DPS_API_TOKEN` — мокаємо саме його
 * (той самий hoisted-mutable-об'єкт патерн, що `lib/anthropic.test.ts`),
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
import { fetchDpsCheckXml } from "./dpsClient.js";

function response(status: number, body: string): Response {
  return new Response(body, { status });
}

function fetchMock(): Mock {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock as Mock;
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
  time: "143210",
  sm: "150.00",
};

describe("fetchDpsCheckXml", () => {
  it('повертає {status:"no_token"} без DPS_API_TOKEN — жодного мережевого запиту', async () => {
    const fetch = fetchMock();
    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "no_token" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("повертає {status:'ok', xml} на 2xx з <CHECK> у тілі", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    const xml = "<CHECK><CHECKHEAD><ORGNM>x</ORGNM></CHECKHEAD></CHECK>";
    fetchMock().mockResolvedValue(response(200, xml));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "ok", xml });
  });

  it("передає token/fn/id/date/time/sm/type=1 у query до chkAll", async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    const fetch = fetchMock().mockResolvedValue(
      response(200, "<CHECK><CHECKHEAD><ORGNM>x</ORGNM></CHECKHEAD></CHECK>"),
    );

    await fetchDpsCheckXml(PARAMS);

    const calledUrl = String(fetch.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("cabinet.tax.gov.ua/ws/api_public/rro/chkAll");
    expect(calledUrl).toContain("fn=4000123456");
    expect(calledUrl).toContain("id=RRO001");
    expect(calledUrl).toContain("date=20260115");
    expect(calledUrl).toContain("time=143210");
    expect(calledUrl).toContain("type=1");
    expect(calledUrl).toContain("token=secret-token");
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

  it('повертає {status:"not_found"} на 200 без тегу <CHECK> у тілі', async () => {
    envMock.DPS_API_TOKEN = "secret-token";
    fetchMock().mockResolvedValue(response(200, '{"error":"not found"}'));

    const result = await fetchDpsCheckXml(PARAMS);
    expect(result).toEqual({ status: "not_found" });
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
});
