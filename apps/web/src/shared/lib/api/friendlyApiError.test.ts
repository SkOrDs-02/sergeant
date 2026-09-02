import { describe, it, expect } from "vitest";
import { friendlyApiError } from "./friendlyApiError";

describe("friendlyApiError (shared)", () => {
  it("для 429 віддає серверне повідомлення (AI-3: конкретний час очікування)", () => {
    // Сервер (`rateLimitExpress`) тепер сам називає, скільки чекати —
    // «Забагато запитів. Спробуй через 12 секунд.» — а не голе «пізніше».
    expect(
      friendlyApiError(429, "Забагато запитів. Спробуй через 12 секунд."),
    ).toBe("Забагато запитів. Спробуй через 12 секунд.");
  });

  it("429 без повідомлення — фолбек на фіксований текст", () => {
    expect(friendlyApiError(429)).toBe(
      "Забагато запитів. Спробуй через хвилину.",
    );
    expect(friendlyApiError(429, "")).toBe(
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

  it("шлюзові збої лишаються у формі `Помилка N` — і це навмисно", () => {
    // Спокуса дати тут текст із дією велика, але `formatApiError` розпізнає
    // саме цю форму як «маперу нема чого сказати» і підставляє
    // caller-специфічний fallback, конкретніший за будь-який загальний
    // текст про шлюз. Доменний текст живе в обгортці HubChat.
    expect(friendlyApiError(504)).toBe("Помилка 504");
    expect(friendlyApiError(502)).toBe("Помилка 502");
  });

  it("фолбек `Помилка {status}`, коли повідомлення порожнє", () => {
    expect(friendlyApiError(500)).toBe("Помилка 500");
    expect(friendlyApiError(418, "")).toBe("Помилка 418");
    expect(friendlyApiError(418, null)).toBe("Помилка 418");
  });
});
