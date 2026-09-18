/**
 * @status Active
 * @owner @Skords-01
 *
 * Curated illustration set for the design system — exported as React
 * components so consumers stay token-aware (no `<img src>` raster fallback,
 * no inline hex). Each illustration paints with `currentColor` and design-token
 * utilities, so wrapping context controls the dominant hue automatically.
 *
 * Naming follows the use-case (`EmptyList`, `NoResults`, `Offline`,
 * `ServerError`, `NotFound`, `SuccessCelebration`) rather than the visual
 * metaphor — when a design swap happens, the import name doesn't need to
 * change.
 */

export type { IllustrationProps } from "./types";

export { EmptyListIllustration } from "./EmptyListIllustration";
export { NoResultsIllustration } from "./NoResultsIllustration";
export { OfflineIllustration } from "./OfflineIllustration";
export { ServerErrorIllustration } from "./ServerErrorIllustration";
export { NotFoundIllustration } from "./NotFoundIllustration";
export { SuccessCelebrationIllustration } from "./SuccessCelebrationIllustration";

export const ILLUSTRATION_NAMES = [
  "empty-list",
  "no-results",
  "offline",
  "server-error",
  "not-found",
  "success-celebration",
] as const;

export type IllustrationName = (typeof ILLUSTRATION_NAMES)[number];
