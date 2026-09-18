import { ApiError } from "@sergeant/api-client";
import { formatPhotoApiError } from "../photoErrorFormatting";

const apiError = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({
    kind: "http",
    message: "",
    url: "/api/nutrition/photo",
    ...init,
  });

describe("formatPhotoApiError", () => {
  it("aborted → порожній рядок (тихе скасування)", () => {
    expect(formatPhotoApiError(apiError({ kind: "aborted" }), "fb")).toBe("");
  });

  it("network → офлайн-текст", () => {
    expect(formatPhotoApiError(apiError({ kind: "network" }), "fb")).toBe(
      "Немає звʼязку. Перевір інтернет і спробуй ще раз.",
    );
  });

  it("402/429 → перевищена AI-квота", () => {
    expect(formatPhotoApiError(apiError({ status: 402 }), "fb")).toBe(
      "Перевищено AI-квоту. Спробуй пізніше.",
    );
    expect(formatPhotoApiError(apiError({ status: 429 }), "fb")).toBe(
      "Перевищено AI-квоту. Спробуй пізніше.",
    );
  });

  it("413 → завелике фото", () => {
    expect(formatPhotoApiError(apiError({ status: 413 }), "fb")).toBe(
      "Занадто велике фото. Стисни/обріж і спробуй ще раз.",
    );
  });

  it("500 без ANTHROPIC-ключа → текст про відсутній ключ", () => {
    expect(
      formatPhotoApiError(
        apiError({ status: 500, message: "ANTHROPIC_API_KEY not set" }),
        "fb",
      ),
    ).toBe("Сервер харчування не налаштовано (немає ключа AI).");
  });

  it("інший HTTP → serverMessage із body.error має пріоритет", () => {
    expect(
      formatPhotoApiError(
        apiError({ status: 400, message: "raw", body: { error: "bad input" } }),
        "fb",
      ),
    ).toBe("bad input");
  });

  it("звичайний Error → його message", () => {
    expect(formatPhotoApiError(new Error("boom"), "fb")).toBe("boom");
  });

  it("невідома помилка → fallback", () => {
    expect(formatPhotoApiError(null, "fallback")).toBe("fallback");
  });
});
