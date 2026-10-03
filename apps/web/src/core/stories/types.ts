import type {
  FinykAggregate,
  FizrukAggregate,
  NutritionAggregate,
  RoutineAggregate,
} from "../insights/useWeeklyDigest";

export type SlideKind =
  "intro" | "finyk" | "fizruk" | "nutrition" | "routine" | "overall";

export interface AISlidePayload {
  summary?: string;
  comment?: string;
}

export type SlideAggregate =
  FinykAggregate | FizrukAggregate | NutritionAggregate | RoutineAggregate;

export interface Slide {
  id: string;
  kind: SlideKind;
  label: string;
  bg: string;
  agg?: SlideAggregate | null;
  ai?: AISlidePayload | null;
  recommendations?: string[] | undefined;
  weekRange?: string | undefined;
}

export interface FinykSlideData extends Slide {
  kind: "finyk";
  agg?: FinykAggregate | null;
}

export interface FizrukSlideData extends Slide {
  kind: "fizruk";
  agg?: FizrukAggregate | null;
}

export interface NutritionSlideData extends Slide {
  kind: "nutrition";
  agg?: NutritionAggregate | null;
}

export interface RoutineSlideData extends Slide {
  kind: "routine";
  agg?: RoutineAggregate | null;
}

export type TapZone = "prev" | "next";

export type PauseReason = "hold" | "explicit" | "drag";
