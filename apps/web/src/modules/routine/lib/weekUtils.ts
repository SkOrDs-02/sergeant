/**
 * Week / date-key helpers — moved into `@sergeant/routine-domain`
 * (Phase 5 / PR 2). Re-exported here so existing call-sites in
 * `apps/web` don't need to update their import paths.
 */

export {
  addDays,
  dateKeyFromDate,
  parseDateKey,
  startOfIsoWeek,
} from "@sergeant/routine-domain";
