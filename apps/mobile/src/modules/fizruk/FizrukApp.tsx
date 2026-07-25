/**
 * FizrukApp — mobile RN-root for the Fizruk module.
 *
 * Web counterpart: `apps/web/src/modules/fizruk/FizrukApp.tsx` (129 LOC).
 *
 * The web shell does three things: hash-router, cross-page hooks
 * (workouts, templates, program, monthly plan), and a `ModuleShell`
 * chrome (header + bottom-nav + settings drawer). On mobile those
 * responsibilities split across Expo Router:
 *
 *   - Routing is file-based (`apps/mobile/app/(tabs)/fizruk/*.tsx`).
 *     `Stack` lives in `_layout.tsx`; each screen file is a leaf that
 *     renders the matching component from `./pages/`.
 *   - 12 route files are mounted: `atlas`, `body`, `exercise`, `index`,
 *     `measurements`, `plan`, `programs`, `progress`, `workouts`,
 *     `workout/new`, `workout/[id]`, `_layout`. `./pages/` carries the
 *     full screen set behind them (Dashboard, Workouts, Programs, Body,
 *     Measurements, Progress, Exercise, PlanCalendar, Atlas) — full
 *     web/shell/RN parity, see `docs/02-engineering/architecture/platforms.md:43`
 *     and `docs/01-product/model/fizruk.md` §11.
 *
 * This file exports the `Dashboard` screen — the index-route wrapper
 * that the stack pushes when the tab is focused. Naming the file
 * `FizrukApp` keeps the one-to-one mapping with the web module so
 * reviewers can diff-check conventions.
 *
 * Last validated: 2026-07-25
 */

export {
  Dashboard as default,
  Dashboard as FizrukApp,
} from "./pages/Dashboard";
