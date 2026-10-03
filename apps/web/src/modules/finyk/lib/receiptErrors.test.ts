import { describe, expect, it } from "vitest";
import { ApiError } from "@shared/api";
import { formatReceiptError } from "./receiptErrors";

describe("formatReceiptError", () => {
  it("passes through the server's human message for the standard envelope (e.g. DPS_TOKEN_MISSING)", () => {
    const err = new ApiError({
      kind: "http",
      status: 503,
      message: "HTTP 503",
      url: "https://api.test/finyk/receipts/lookup",
      body: {
        error:
          "Пошук чека за QR тимчасово недоступний, спробуй сфотографувати чек.",
        code: "DPS_TOKEN_MISSING",
      },
    });
    expect(formatReceiptError(err, "fallback")).toBe(
      "Пошук чека за QR тимчасово недоступний, спробуй сфотографувати чек.",
    );
  });

  it("passes through DPS_RECEIPT_NOT_FOUND's human message", () => {
    const err = new ApiError({
      kind: "http",
      status: 404,
      message: "HTTP 404",
      url: "https://api.test/finyk/receipts/lookup",
      body: {
        error:
          "Чек ще не зʼявився в реєстрі ДПС, спробуй за кілька хвилин або сфотографуй чек.",
        code: "DPS_RECEIPT_NOT_FOUND",
      },
    });
    expect(formatReceiptError(err, "fallback")).toMatch(/ще не зʼявився/);
  });

  it("maps TOO_LARGE image-validation 413 to the size instruction", () => {
    const err = new ApiError({
      kind: "http",
      status: 413,
      message: "HTTP 413",
      url: "https://api.test/finyk/receipts/analyze",
      body: { code: "TOO_LARGE", detail: "payload too large" },
    });
    expect(formatReceiptError(err, "fallback")).toBe(
      "Фото завелике (максимум 5 МБ). Стисни або обери інше.",
    );
  });

  it("maps MAGIC_MISMATCH image-validation 415 to the not-an-image instruction", () => {
    const err = new ApiError({
      kind: "http",
      status: 415,
      message: "HTTP 415",
      url: "https://api.test/finyk/import/screenshot/analyze",
      body: {
        code: "MAGIC_MISMATCH",
        detail: "bad magic",
        declared_mime: "image/png",
        detected_mime: "application/pdf",
      },
    });
    expect(formatReceiptError(err, "fallback")).toBe(
      "Файл не схожий на зображення. Обери інший.",
    );
  });

  it("maps INVALID_BASE64 and TRUNCATED codes", () => {
    const base = {
      kind: "http" as const,
      status: 413 as const,
      message: "HTTP 413",
      url: "https://api.test/finyk/receipts/analyze",
    };
    expect(
      formatReceiptError(
        new ApiError({
          ...base,
          body: { code: "INVALID_BASE64", detail: "x" },
        }),
        "fallback",
      ),
    ).toMatch(/не вдалося прочитати фото/i);
    expect(
      formatReceiptError(
        new ApiError({ ...base, body: { code: "TRUNCATED", detail: "x" } }),
        "fallback",
      ),
    ).toMatch(/не повністю/);
  });

  it("does not treat a 413 with the STANDARD envelope as an image-validation body", () => {
    // Standard envelope carries `error`/`message`/`code`, not `detail` —
    // isImageValidationErrorBody() must reject it so formatApiError's
    // normal path runs instead.
    const err = new ApiError({
      kind: "http",
      status: 413,
      message: "HTTP 413",
      url: "https://api.test/finyk/receipts",
      body: { error: "щось інше" },
    });
    expect(formatReceiptError(err, "fallback")).toBe("щось інше");
  });

  it("falls back for a plain Error", () => {
    expect(formatReceiptError(new Error("boom"), "fallback")).toBe("boom");
  });

  it("uses the caller fallback for non-error values", () => {
    expect(formatReceiptError(null, "fallback")).toBe("fallback");
  });
});
