/**
 * Fizruk route catalogue (React Native).
 *
 * Mirrors `apps/web/src/modules/fizruk/shell/fizrukRoute.ts` so the
 * same page identifiers (`dashboard`, `workouts`, `plan`, …) are used
 * on both platforms. Mobile navigation uses Expo Router nested Stack
 * under `app/(tabs)/fizruk/*`; these ids are the file-segment names
 * (with the single exception that `dashboard` maps to `index.tsx`
 * because Expo Router's convention uses `index` as the stack root).
 *
 * Keeping the list pure here means shared analytics / deep-link
 * helpers can reference it without pulling navigation runtime in.
 */

export const FIZRUK_PAGES = [
  "dashboard",
  "plan",
  "atlas",
  "workouts",
  "progress",
  "measurements",
  "programs",
  "body",
  "exercise",
] as const;

export type FizrukPage = (typeof FIZRUK_PAGES)[number];

/**
 * Maps a logical `FizrukPage` id to the Expo Router segment below
 * `/fizruk`. `dashboard` lives at the stack root (`index.tsx`).
 */
export function fizrukRouteFor(page: FizrukPage): string {
  if (page === "dashboard") return "/fizruk";
  return `/fizruk/${page}`;
}
