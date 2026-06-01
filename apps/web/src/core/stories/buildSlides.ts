import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
} from "../insights/useWeeklyDigest";
import { BG_GRADIENTS } from "./constants";
import type { Slide } from "./types";

export function buildSlides(
  digest: Record<string, unknown> | null,
  weekKey: string,
  weekRange: string | undefined,
): Slide[] {
  const slides: Slide[] = [
    {
      id: "intro",
      kind: "intro",
      label: "Тиждень",
      bg: BG_GRADIENTS.intro,
    },
  ];

  const finykAgg = aggregateFinyk(weekKey);
  if (digest?.["finyk"] || (finykAgg && finykAgg.txCount > 0)) {
    slides.push({
      id: "finyk",
      kind: "finyk",
      label: "Фінанси",
      bg: BG_GRADIENTS.finyk,
      agg: finykAgg,
      ai: digest?.["finyk"] ?? null,
    });
  }

  const fizrukAgg = aggregateFizruk(weekKey);
  if (digest?.["fizruk"] || (fizrukAgg && fizrukAgg.workoutsCount > 0)) {
    slides.push({
      id: "fizruk",
      kind: "fizruk",
      label: "Тренування",
      bg: BG_GRADIENTS.fizruk,
      agg: fizrukAgg,
      ai: digest?.["fizruk"] ?? null,
    });
  }

  const nutritionAgg = aggregateNutrition(weekKey);
  if (digest?.["nutrition"] || (nutritionAgg && nutritionAgg.daysLogged > 0)) {
    slides.push({
      id: "nutrition",
      kind: "nutrition",
      label: "Харчування",
      bg: BG_GRADIENTS.nutrition,
      agg: nutritionAgg,
      ai: digest?.["nutrition"] ?? null,
    });
  }

  const routineAgg = aggregateRoutine(weekKey);
  if (digest?.["routine"] || (routineAgg && routineAgg.habitCount > 0)) {
    slides.push({
      id: "routine",
      kind: "routine",
      label: "Звички",
      bg: BG_GRADIENTS.routine,
      agg: routineAgg,
      ai: digest?.["routine"] ?? null,
    });
  }

  if (
    Array.isArray(digest?.["overallRecommendations"]) &&
    digest["overallRecommendations"].length > 0
  ) {
    slides.push({
      id: "overall",
      kind: "overall",
      label: "Підсумок",
      bg: BG_GRADIENTS.overall,
      recommendations: digest["overallRecommendations"],
    });
  }

  // Carry week metadata on every slide for header rendering.
  return slides.map((s) => ({ ...s, weekRange }));
}
