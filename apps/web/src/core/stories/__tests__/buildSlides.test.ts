// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("../../insights/useWeeklyDigest", () => ({
  aggregateFinyk: vi.fn(() => null),
  aggregateFizruk: vi.fn(() => null),
  aggregateNutrition: vi.fn(() => null),
  aggregateRoutine: vi.fn(() => null),
}));

import { buildSlides } from "../buildSlides";
import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
} from "../../insights/useWeeklyDigest";

const mFinyk = vi.mocked(aggregateFinyk);
const mFizruk = vi.mocked(aggregateFizruk);
const mNutrition = vi.mocked(aggregateNutrition);
const mRoutine = vi.mocked(aggregateRoutine);

describe("buildSlides", () => {
  it("always includes intro slide", () => {
    const slides = buildSlides(null, "2026-W17", "21–27 квітня");
    expect(slides[0]!.kind).toBe("intro");
    expect(slides[0]!.weekRange).toBe("21–27 квітня");
  });

  it("skips module slides when no aggregates and no digest data", () => {
    const slides = buildSlides(null, "2026-W17", undefined);
    expect(slides).toHaveLength(1);
    expect(slides[0]!.kind).toBe("intro");
  });

  it("adds finyk slide when aggregate has txCount > 0", () => {
    mFinyk.mockReturnValueOnce({ txCount: 5 } as ReturnType<
      typeof aggregateFinyk
    >);
    const slides = buildSlides(null, "2026-W17", undefined);
    const finykSlide = slides.find((s) => s.kind === "finyk");
    expect(finykSlide).toBeDefined();
    expect(finykSlide!.label).toBe("Фінанси");
    expect(finykSlide!.agg).toEqual({ txCount: 5 });
  });

  it("adds finyk slide when digest.finyk is present even without aggregate", () => {
    const slides = buildSlides(
      { finyk: { summary: "Good week" } },
      "2026-W17",
      undefined,
    );
    const finykSlide = slides.find((s) => s.kind === "finyk");
    expect(finykSlide).toBeDefined();
    expect(finykSlide!.ai).toEqual({ summary: "Good week" });
  });

  it("adds fizruk slide when aggregate has workoutsCount > 0", () => {
    mFizruk.mockReturnValueOnce({ workoutsCount: 3 } as ReturnType<
      typeof aggregateFizruk
    >);
    const slides = buildSlides(null, "2026-W17", undefined);
    const fizrukSlide = slides.find((s) => s.kind === "fizruk");
    expect(fizrukSlide).toBeDefined();
    expect(fizrukSlide!.label).toBe("Тренування");
  });

  it("adds nutrition slide when aggregate has daysLogged > 0", () => {
    mNutrition.mockReturnValueOnce({ daysLogged: 2 } as ReturnType<
      typeof aggregateNutrition
    >);
    const slides = buildSlides(null, "2026-W17", undefined);
    const nutritionSlide = slides.find((s) => s.kind === "nutrition");
    expect(nutritionSlide).toBeDefined();
    expect(nutritionSlide!.label).toBe("Харчування");
  });

  it("adds routine slide when aggregate has habitCount > 0", () => {
    mRoutine.mockReturnValueOnce({ habitCount: 4 } as ReturnType<
      typeof aggregateRoutine
    >);
    const slides = buildSlides(null, "2026-W17", undefined);
    const routineSlide = slides.find((s) => s.kind === "routine");
    expect(routineSlide).toBeDefined();
    expect(routineSlide!.label).toBe("Звички");
  });

  it("adds overall slide when overallRecommendations is non-empty", () => {
    const slides = buildSlides(
      { overallRecommendations: ["Drink more water"] },
      "2026-W17",
      undefined,
    );
    const overallSlide = slides.find((s) => s.kind === "overall");
    expect(overallSlide).toBeDefined();
    expect(overallSlide!.recommendations).toEqual(["Drink more water"]);
  });

  it("skips overall slide when overallRecommendations is empty", () => {
    const slides = buildSlides(
      { overallRecommendations: [] },
      "2026-W17",
      undefined,
    );
    expect(slides.find((s) => s.kind === "overall")).toBeUndefined();
  });

  it("carries weekRange to every slide", () => {
    mFinyk.mockReturnValueOnce({ txCount: 1 } as ReturnType<
      typeof aggregateFinyk
    >);
    const slides = buildSlides(null, "2026-W17", "21–27 квітня");
    for (const slide of slides) {
      expect(slide.weekRange).toBe("21–27 квітня");
    }
  });

  it("builds all slides in correct order when all modules have data", () => {
    mFinyk.mockReturnValueOnce({ txCount: 1 } as ReturnType<
      typeof aggregateFinyk
    >);
    mFizruk.mockReturnValueOnce({ workoutsCount: 1 } as ReturnType<
      typeof aggregateFizruk
    >);
    mNutrition.mockReturnValueOnce({ daysLogged: 1 } as ReturnType<
      typeof aggregateNutrition
    >);
    mRoutine.mockReturnValueOnce({ habitCount: 1 } as ReturnType<
      typeof aggregateRoutine
    >);
    const slides = buildSlides(
      { overallRecommendations: ["tip"] },
      "2026-W17",
      undefined,
    );
    const kinds = slides.map((s) => s.kind);
    expect(kinds).toEqual([
      "intro",
      "finyk",
      "fizruk",
      "nutrition",
      "routine",
      "overall",
    ]);
  });
});
