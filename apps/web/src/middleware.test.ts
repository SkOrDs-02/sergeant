// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import middleware from "../middleware";

/**
 * rel-03: Edge Middleware підписує IP клієнта для бекенду. Контракт заголовків
 * спільний із `apps/server/src/http/clientIp.ts`.
 */
const SECRET = "k".repeat(40);
const sign = (ip: string) =>
  createHmac("sha256", SECRET).update(ip).digest("base64url");

let upstreamHeaders: Headers | undefined;

beforeEach(() => {
  upstreamHeaders = undefined;
  process.env["BACKEND_URL"] = "https://api.example.test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      upstreamHeaders = new Headers(init.headers);
      return new Response("ok", { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["BACKEND_URL"];
  delete process.env["SERGEANT_CLIENT_IP_SECRET"];
});

function call(headers: Record<string, string>) {
  return middleware(
    new Request("https://app.example.test/api/auth/sign-in/email", {
      method: "GET",
      headers,
    }),
  );
}

describe("web middleware: підписаний IP клієнта (rel-03)", () => {
  it("ставить x-sergeant-client-ip = перше значення XFF і правильний HMAC-підпис", async () => {
    process.env["SERGEANT_CLIENT_IP_SECRET"] = SECRET;
    await call({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(upstreamHeaders?.get("x-sergeant-client-ip")).toBe("203.0.113.5");
    expect(upstreamHeaders?.get("x-sergeant-client-ip-sig")).toBe(
      sign("203.0.113.5"),
    );
  });

  it("стирає підроблені клієнтом заголовки й ставить власні", async () => {
    process.env["SERGEANT_CLIENT_IP_SECRET"] = SECRET;
    await call({
      "x-forwarded-for": "203.0.113.5",
      "x-sergeant-client-ip": "6.6.6.6",
      "x-sergeant-client-ip-sig": sign("6.6.6.6"),
    });
    expect(upstreamHeaders?.get("x-sergeant-client-ip")).toBe("203.0.113.5");
    expect(upstreamHeaders?.get("x-sergeant-client-ip-sig")).toBe(
      sign("203.0.113.5"),
    );
  });

  it("без секрету лише стирає підроблені заголовки й нічого не підписує", async () => {
    await call({
      "x-forwarded-for": "203.0.113.5",
      "x-sergeant-client-ip": "6.6.6.6",
      "x-sergeant-client-ip-sig": "forged",
    });
    expect(upstreamHeaders?.has("x-sergeant-client-ip")).toBe(false);
    expect(upstreamHeaders?.has("x-sergeant-client-ip-sig")).toBe(false);
  });

  it("слабкий секрет (<32) вважається незаданим", async () => {
    process.env["SERGEANT_CLIENT_IP_SECRET"] = "short";
    await call({ "x-forwarded-for": "203.0.113.5" });
    expect(upstreamHeaders?.has("x-sergeant-client-ip")).toBe(false);
  });

  it("секрет не потрапляє в жоден заголовок", async () => {
    process.env["SERGEANT_CLIENT_IP_SECRET"] = SECRET;
    await call({ "x-forwarded-for": "203.0.113.5" });
    for (const [, value] of upstreamHeaders ?? []) {
      expect(value).not.toContain(SECRET);
    }
  });

  it("без XFF нічого не підписує", async () => {
    process.env["SERGEANT_CLIENT_IP_SECRET"] = SECRET;
    await call({});
    expect(upstreamHeaders?.has("x-sergeant-client-ip-sig")).toBe(false);
  });
});
