/**
 * `@sergeant/fizruk-domain/domain/body` — pure selectors backing the
 * Fizruk **Body** dashboard (read-only view over the Measurements
 * store on both web + mobile).
 *
 * REUSE: trend series for charts still come from
 * `@sergeant/fizruk-domain/domain/progress` (`buildMeasurementSeries`,
 * `countValidPoints`). This module only adds the "latest + window
 * delta + arrow direction" summary helpers that the web page used to
 * compute inline.
 */
export * from "./types.js";
export * from "./bodyWeight.js";
export * from "./summary.js";
