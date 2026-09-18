import { ApiError } from "@sergeant/api-client";
import { formatNutritionRecipeError } from "../nutritionRecipeError";

const apiError = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({
    kind: "http",
    message: "",
    url: "/api/nutrition/recipes",
    ...init,
  });

describe("formatNutritionRecipeError", () => {
  it("402/429 → перевищена AI-квота", () => {
    expect(formatNutritionRecipeError(apiError({ status: 402 }))).toBe(
      "Перевищено AI-квоту. Спробуй пізніше.",
    );
    expect(formatNutritionRecipeError(apiError({ status: 429 }))).toBe(
      "Перевищено AI-квоту. Спробуй пізніше.",
    );
  });

  it("network → офлайн-текст", () => {
    expect(formatNutritionRecipeError(apiError({ kind: "network" }))).toBe(
      "Немає звʼязку. Перевір інтернет і спробуй ще раз.",
    );
  });

  it("інший HTTP → message помилки", () => {
    expect(
      formatNutritionRecipeError(apiError({ status: 500, message: "boom" })),
    ).toBe("boom");
  });

  it("HTTP без message → fallback зі статусом", () => {
    expect(formatNutritionRecipeError(apiError({ status: 503 }))).toBe(
      "Помилка 503",
    );
  });

  it("звичайний Error → його message", () => {
    expect(formatNutritionRecipeError(new Error("oops"))).toBe("oops");
  });

  it("невідома помилка → generic-текст", () => {
    expect(formatNutritionRecipeError(null)).toBe(
      "Помилка рекомендацій рецептів.",
    );
  });
});
