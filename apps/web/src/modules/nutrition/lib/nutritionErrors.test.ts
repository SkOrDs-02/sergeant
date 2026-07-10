import { describe, expect, it } from "vitest";
import { ApiError } from "@shared/api";
import { friendlyApiError } from "@shared/lib/api/friendlyApiError";
import {
  friendlyApiError as nutritionFriendlyApiError,
  formatNutritionError,
} from "./nutritionErrors";

describe("nutritionErrors", () => {
  describe("friendlyApiError", () => {
    it("maps missing AI key 500s to a nutrition-specific message", () => {
      expect(nutritionFriendlyApiError(500, "ANTHROPIC key not set")).toBe(
        "Сервер харчування не налаштовано (немає ключа AI).",
      );
      expect(nutritionFriendlyApiError(500, "API key missing")).toMatch(
        /не налаштовано/,
      );
    });

    it("maps 413 to the oversized-photo instruction", () => {
      expect(nutritionFriendlyApiError(413)).toBe(
        "Занадто велике фото. Стисни/обріж і спробуй ще раз.",
      );
    });

    it("delegates other statuses to the shared friendly mapper", () => {
      expect(nutritionFriendlyApiError(401, "nope")).toBe(
        friendlyApiError(401, "nope"),
      );
      expect(nutritionFriendlyApiError(429)).toBe(friendlyApiError(429));
    });
  });

  describe("formatNutritionError", () => {
    it("uses the nutrition HTTP mapper for ApiError http responses", () => {
      const err = new ApiError({
        kind: "http",
        status: 413,
        message: "HTTP 413",
        url: "https://api.test/nutrition/photo",
        body: { error: "payload too large" },
      });
      expect(formatNutritionError(err, "Помилка аналізу фото")).toMatch(
        /Занадто велике фото/,
      );
    });

    it("returns the Error message when present", () => {
      expect(
        formatNutritionError(new Error("boom"), "Помилка аналізу фото"),
      ).toBe("boom");
    });

    it("uses the caller fallback for non-error values", () => {
      expect(formatNutritionError(null, "Помилка аналізу фото")).toBe(
        "Помилка аналізу фото",
      );
    });
  });
});
