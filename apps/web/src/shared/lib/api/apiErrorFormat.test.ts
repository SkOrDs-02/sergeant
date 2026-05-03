import { describe, it, expect, afterEach, vi } from "vitest";
import { ApiError } from "@shared/api";
import { formatApiError } from "./apiErrorFormat";

const URL = "/api/test";

describe("formatApiError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ApiError http → шлях через friendlyApiError за замовчуванням (429)", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 429",
      status: 429,
      url: URL,
    });
    expect(formatApiError(err, { fallback: "fb" })).toBe(
      "Забагато запитів. Спробуй через хвилину.",
    );
  });

  it("ApiError http + auth (401) → стандартне 'Доступ заборонено.'", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 401",
      status: 401,
      url: URL,
    });
    expect(formatApiError(err)).toBe("Доступ заборонено.");
  });

  it("ApiError http → доменний httpStatusToMessage перекриває дефолт", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 413",
      status: 413,
      url: URL,
    });
    const out = formatApiError(err, {
      fallback: "fb",
      httpStatusToMessage: (s) =>
        s === 413 ? "Фото завелике" : `Помилка ${s}`,
    });
    expect(out).toBe("Фото завелике");
  });

  it("ApiError http без serverMessage і без спец-мапінгу → caller-fallback, а не 'Помилка N'", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 502",
      status: 502,
      url: URL,
    });
    expect(formatApiError(err, { fallback: "Помилка генерації звіту" })).toBe(
      "Помилка генерації звіту",
    );
  });

  it("ApiError http без serverMessage і без caller-fallback → 'Помилка N' (як було)", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 502",
      status: 502,
      url: URL,
    });
    expect(formatApiError(err)).toBe("Помилка 502");
  });

  it("ApiError http + serverMessage → використовує server text при дефолтному мапері", () => {
    const err = new ApiError({
      kind: "http",
      message: "HTTP 500",
      status: 500,
      body: { error: "boom" },
      requestId: "req_123",
      url: URL,
    });
    expect(formatApiError(err, { fallback: "fb" })).toBe(
      "boom (requestId: req_123)",
    );
  });

  it("ApiError network + offline → офлайн-копія", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const err = new ApiError({
      kind: "network",
      message: "Failed to fetch",
      url: URL,
    });
    expect(formatApiError(err)).toBe(
      "Немає підключення до інтернету. Спробуй пізніше.",
    );
  });

  it("ApiError network + online → message або дефолт", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const err = new ApiError({
      kind: "network",
      message: "DNS failed",
      url: URL,
    });
    expect(formatApiError(err)).toBe("DNS failed");
  });

  it("ApiError parse + HTML body → спеціальний rewrite-текст", () => {
    const err = new ApiError({
      kind: "parse",
      message: "Unexpected token <",
      // eslint-disable-next-line sergeant-design/no-ellipsis-dots -- literal HTML fixture, not user-facing copy
      bodyText: "<!doctype html><html>...</html>",
      url: URL,
    });
    expect(formatApiError(err)).toBe(
      "API повернув HTML замість JSON (ймовірно, rewrite перехоплює /api/*).",
    );
  });

  it("ApiError aborted → порожній рядок (onError не має чого показувати)", () => {
    const err = new ApiError({
      kind: "aborted",
      message: "Запит скасовано",
      url: URL,
    });
    expect(formatApiError(err, { fallback: "fb" })).toBe("");
  });

  it("plain Error → .message пріоритетніший за fallback", () => {
    expect(formatApiError(new Error("boom"), { fallback: "fb" })).toBe("boom");
  });

  it("Error без message → fallback", () => {
    expect(formatApiError(new Error(), { fallback: "fb" })).toBe("fb");
  });

  it("довільне значення → fallback", () => {
    expect(formatApiError(undefined, { fallback: "fb" })).toBe("fb");
    expect(formatApiError(null, { fallback: "fb" })).toBe("fb");
    expect(formatApiError({}, { fallback: "fb" })).toBe("fb");
  });

  it("string error → проходить як є", () => {
    expect(formatApiError("raw string error", { fallback: "fb" })).toBe(
      "raw string error",
    );
  });

  it("без fallback → дефолтний текст", () => {
    expect(formatApiError(undefined)).toBe(
      "Щось пішло не так. Спробуй ще раз.",
    );
  });
});
