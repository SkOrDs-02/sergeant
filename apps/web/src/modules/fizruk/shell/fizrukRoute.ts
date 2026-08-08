/**
 * Last validated: 2026-06-05
 * Status: Active
 */
export const FIZRUK_PAGES = [
  "dashboard",
  "atlas",
  "workouts",
  "progress",
  "measurements",
  "programs",
  "body",
  "exercise",
  "workout",
  // 03-A — dedicated history route (`/fizruk/history`). Own URL, no
  // start-CTA; see `pages/WorkoutHistory.tsx`.
  "history",
] as const;

export type FizrukPage = (typeof FIZRUK_PAGES)[number];
