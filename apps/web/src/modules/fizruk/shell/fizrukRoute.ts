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
  // Каталог і шаблони до цього жили `view`-станом усередині
  // `/fizruk/workouts`: на одній адресі рендерились чотири різні екрани,
  // тож браузерне «назад» вело геть із модуля, а посиланням поділитись
  // було нічим. Тепер у кожного власна адреса; обидва мапляться на таб
  // «Тренування» (`fizrukNavActiveId`).
  "catalog",
  "templates",
] as const;

export type FizrukPage = (typeof FIZRUK_PAGES)[number];
