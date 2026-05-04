import { describe, expect, it } from "vitest";
import { redactSensitiveUrl } from "./sensitiveUrl.js";

describe("redactSensitiveUrl", () => {
  it("повертає пустий рядок для null/undefined/'' (нормалізація)", () => {
    expect(redactSensitiveUrl(null)).toBe("");
    expect(redactSensitiveUrl(undefined)).toBe("");
    expect(redactSensitiveUrl("")).toBe("");
  });

  it("маскує секрет у /api/mono/webhook/<secret>", () => {
    expect(redactSensitiveUrl("/api/mono/webhook/abc123")).toBe(
      "/api/mono/webhook/[redacted]",
    );
    expect(
      redactSensitiveUrl(
        "/api/mono/webhook/very-long-random-string-from-monobank",
      ),
    ).toBe("/api/mono/webhook/[redacted]");
  });

  it("зберігає query-string", () => {
    expect(redactSensitiveUrl("/api/mono/webhook/abc123?retry=1")).toBe(
      "/api/mono/webhook/[redacted]?retry=1",
    );
    expect(redactSensitiveUrl("/api/mono/webhook/abc?a=1&b=2")).toBe(
      "/api/mono/webhook/[redacted]?a=1&b=2",
    );
  });

  it("зберігає fragment", () => {
    expect(redactSensitiveUrl("/api/mono/webhook/abc#section")).toBe(
      "/api/mono/webhook/[redacted]#section",
    );
  });

  it("маскує versioned-path /api/v1/mono/webhook/<secret>", () => {
    expect(redactSensitiveUrl("/api/v1/mono/webhook/abc123")).toBe(
      "/api/v1/mono/webhook/[redacted]",
    );
    expect(redactSensitiveUrl("/api/v1/mono/webhook/abc?x=1")).toBe(
      "/api/v1/mono/webhook/[redacted]?x=1",
    );
  });

  it("не чіпає URL без чутливого префіксу", () => {
    expect(redactSensitiveUrl("/api/me")).toBe("/api/me");
    expect(redactSensitiveUrl("/api/finyk/transactions?from=2026-01-01")).toBe(
      "/api/finyk/transactions?from=2026-01-01",
    );
    expect(redactSensitiveUrl("/")).toBe("/");
  });

  it("не маскує сам префікс без секрету (POST /api/mono/webhook без сегмента)", () => {
    // Новий header-based endpoint матиме саме такий URL — для нього нема
    // секрету у path-і, тож редагувати нічого. Зберігаємо as-is.
    expect(redactSensitiveUrl("/api/mono/webhook")).toBe("/api/mono/webhook");
  });

  it("обробляє абсолютні URL з origin-ом (Sentry може передавати повний URL)", () => {
    // Sentry `event.request.url` буває повним: scheme + host + path. Хелпер
    // не парсить його як URL-об'єкт, але path-prefix не співпаде, тому
    // повертаємо as-is — `event.request.url` від Sentry для express-app
    // насправді `req.originalUrl`-альний path. Цей кейс — sanity check, що
    // ми не ламаємо абсолютні URL і не редагуємо те, що не повинні.
    expect(
      redactSensitiveUrl("https://api.example.com/api/mono/webhook/abc"),
    ).toBe("https://api.example.com/api/mono/webhook/abc");
  });

  it("залишає suffix після секрету (defensive — на майбутнє під-роути)", () => {
    // Якщо коли-небудь з'явиться `/api/mono/webhook/<secret>/replay` — суфікс
    // не має маскуватись, тільки сам секрет.
    expect(redactSensitiveUrl("/api/mono/webhook/abc123/replay")).toBe(
      "/api/mono/webhook/[redacted]/replay",
    );
  });
});
