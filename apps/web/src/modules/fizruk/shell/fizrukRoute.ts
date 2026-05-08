export const FIZRUK_PAGES = [
  "dashboard",
  "atlas",
  "workouts",
  "progress",
  "measurements",
  "programs",
  "body",
  "exercise",
] as const;

export type FizrukPage = (typeof FIZRUK_PAGES)[number];
