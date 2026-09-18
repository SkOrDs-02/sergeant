import { describe, it, expect, afterEach } from "vitest";
import { getAllowedOrigins, isOriginAllowed, setCorsHeaders } from "./cors.js";

describe("getAllowedOrigins", () => {
  const prev = process.env["ALLOWED_ORIGINS"];
  const prevNodeEnv = process.env["NODE_ENV"];

  afterEach(() => {
    if (prev === undefined) delete process.env["ALLOWED_ORIGINS"];
    else process.env["ALLOWED_ORIGINS"] = prev;
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;
  });

  it("parses comma-separated ALLOWED_ORIGINS", () => {
    process.env["ALLOWED_ORIGINS"] = " https://a.test , https://b.test ";
    const origins = getAllowedOrigins();
    expect(origins).toContain("https://a.test");
    expect(origins).toContain("https://b.test");
  });

  it("falls back to defaults with localhost поза production", () => {
    delete process.env["ALLOWED_ORIGINS"];
    process.env["NODE_ENV"] = "development";
    const origins = getAllowedOrigins();
    expect(origins).toContain("https://sergeant.vercel.app");
    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("http://127.0.0.1:5173");
  });

  it("не дає localhost у production defaults", () => {
    delete process.env["ALLOWED_ORIGINS"];
    process.env["NODE_ENV"] = "production";
    const origins = getAllowedOrigins();
    expect(origins).toContain("https://sergeant.vercel.app");
    expect(origins).not.toContain("http://localhost:5173");
    expect(origins).not.toContain("http://127.0.0.1:5173");
    expect(origins).not.toContain("http://localhost:8081");
  });

  it("дозволяє localhost у production лише через ALLOWED_ORIGINS", () => {
    process.env["NODE_ENV"] = "production";
    process.env["ALLOWED_ORIGINS"] = "http://localhost:5173";
    expect(getAllowedOrigins()).toContain("http://localhost:5173");
  });
});

describe("setCorsHeaders", () => {
  it("sets ACAO when origin is allowed", () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const req = { headers: { origin: "http://localhost:5173" } };
    setCorsHeaders(res as never, req as never);
    expect(headers["Access-Control-Allow-Origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("allows browser auth, sync, and tracing headers by default", () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const req = { headers: { origin: "http://127.0.0.1:5173" } };
    setCorsHeaders(res as never, req as never);
    expect(headers["Access-Control-Allow-Headers"]).toContain(
      "X-Requested-With",
    );
    expect(headers["Access-Control-Allow-Headers"]).toContain(
      "X-Origin-Device-Id",
    );
    expect(headers["Access-Control-Allow-Headers"]).toContain("traceparent");
  });

  it("does not set ACAO when origin is unknown", () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const req = { headers: { origin: "https://evil.example" } };
    setCorsHeaders(res as never, req as never);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("sets Access-Control-Expose-Headers when exposeHeaders is provided", () => {
    // Потрібно для Retry-After на 429 з /api/mono. Без expose-headers браузер
    // приховує заголовок у cross-origin fetch, і client pagination loop не
    // отримує retry-after → targeted backoff не працює.
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const req = { headers: { origin: "http://localhost:5173" } };
    setCorsHeaders(res as never, req as never, {
      exposeHeaders: "Retry-After",
    });
    expect(headers["Access-Control-Expose-Headers"]).toBe("Retry-After");
  });

  it("omits Access-Control-Expose-Headers by default", () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };
    const req = { headers: { origin: "http://localhost:5173" } };
    setCorsHeaders(res as never, req as never);
    expect(headers["Access-Control-Expose-Headers"]).toBeUndefined();
  });
});

describe("isOriginAllowed (ALLOWED_ORIGIN_REGEX)", () => {
  const prev = process.env["ALLOWED_ORIGIN_REGEX"];
  afterEach(() => {
    if (prev === undefined) delete process.env["ALLOWED_ORIGIN_REGEX"];
    else process.env["ALLOWED_ORIGIN_REGEX"] = prev;
  });

  it("accepts Vercel previews matching a team-anchored regex", () => {
    process.env["ALLOWED_ORIGIN_REGEX"] =
      "^https://sergeant-git-[a-z0-9-]+-myteam\\.vercel\\.app$";
    expect(
      isOriginAllowed("https://sergeant-git-branch-myteam.vercel.app"),
    ).toBe(true);
    expect(isOriginAllowed("https://attacker.vercel.app")).toBe(false);
  });

  it("широкий `sergeant-*.vercel.app` патерн пускає чужий тенант", () => {
    // Простір імен проєктів на vercel.app глобальний: без суфікса команди
    // патерн віддає credentialed CORS будь-кому, хто зареєструє сумісний
    // піддомен. Тест фіксує, ЧОМУ приклад у doc-коментарі вузький.
    process.env["ALLOWED_ORIGIN_REGEX"] =
      "^https://sergeant(?:-[a-z0-9-]+)?\\.vercel\\.app$";
    expect(isOriginAllowed("https://sergeant-attacker.vercel.app")).toBe(true);
  });

  it("ignores invalid regex (fail-closed)", () => {
    process.env["ALLOWED_ORIGIN_REGEX"] = "[";
    expect(isOriginAllowed("https://anything.vercel.app")).toBe(false);
    // defaults still work
    expect(isOriginAllowed("https://sergeant.vercel.app")).toBe(true);
  });
});
