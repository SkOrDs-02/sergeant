import type {
  Slide,
  FinykSlideData,
  FizrukSlideData,
  NutritionSlideData,
  RoutineSlideData,
} from "../../types";
import { IntroSlide } from "./IntroSlide";
import { FinykSlide } from "./FinykSlide";
import { FizrukSlide } from "./FizrukSlide";
import { NutritionSlide } from "./NutritionSlide";
import { RoutineSlide } from "./RoutineSlide";
import { OverallSlide } from "./OverallSlide";

export function renderSlide(slide: Slide) {
  switch (slide.kind) {
    case "intro":
      return <IntroSlide slide={slide} />;
    case "finyk":
      return <FinykSlide slide={slide as FinykSlideData} />;
    case "fizruk":
      return <FizrukSlide slide={slide as FizrukSlideData} />;
    case "nutrition":
      return <NutritionSlide slide={slide as NutritionSlideData} />;
    case "routine":
      return <RoutineSlide slide={slide as RoutineSlideData} />;
    case "overall":
      return <OverallSlide slide={slide} />;
    default:
      return null;
  }
}
