/**
 * O3 (Phase 2.B) — public surface OpenClaw monthly OKR review.
 * HTTP route `/api/internal/openclaw/ritual/monthly` і консумери, що
 * рендерять OKR review, імпортують звідси.
 */

export { buildMonthlyOkrReview } from "./template.js";
export { assembleMonthlyOkrReview } from "./builder.js";
export type { AssembleMonthlyOkrOptions } from "./builder.js";
export { INTERIM_OKRS, krProgressPct } from "./okrs.js";
export type { KeyResult, Okr, OkrSource } from "./okrs.js";
export type {
  AssembleMonthlyOkrInput,
  MonthlyNarrativeSection,
  MonthlyOkrData,
  MonthlyOkrProgressSection,
  MonthlyOkrResponse,
  MonthlyRisksSection,
  MonthlyWinsSection,
} from "./types.js";
