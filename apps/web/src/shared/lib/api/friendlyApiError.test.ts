import { describe, it, expect } from "vitest";
import { friendlyApiError } from "./friendlyApiError";

describe("friendlyApiError (shared)", () => {
  it("повертає фіксований текст для 429", () => {
    expect(friendlyApiError(429)).toBe(
      "Забагато запитів. Спробуй через хвилину.",
    );
    expect(friendlyApiError(429, "rate limit")).toBe(
      "Забагато запитів. Спробуй через хвилину.",
    );
  });

  it("повертає фіксований текст для 401/403", () => {
    expect(friendlyApiError(401)).toBe("Доступ заборонено.");
    expect(friendlyApiError(403, "Forbidden")).toBe("Доступ заборонено.");
  });

  it("віддає серверне повідомлення, якщо воно є", () => {
    expect(friendlyApiError(500, "boom")).toBe("boom");
    expect(friendlyApiError(502, "upstream down")).toBe("upstream down");
  });

  it("фолбек `Помилка {status}`, коли повідомлення порожнє", () => {
    expect(friendlyApiError(500)).toBe("Помилка 500");
    expect(friendlyApiError(418, "")).toBe("Помилка 418");
    expect(friendlyApiError(418, null)).toBe("Помилка 418");
  });
});
