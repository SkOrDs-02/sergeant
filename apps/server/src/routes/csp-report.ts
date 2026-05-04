import { Router } from "express";
import { asyncHandler, rateLimitExpress } from "../http/index.js";
import cspReportHandler from "../modules/observability/csp-report.js";

/**
 * Wires the CSP `report-uri` sink referenced from the frontend's
 * `Content-Security-Policy-Report-Only` header (set in root `vercel.json`).
 *
 * Closes Phase 1 of hardening card C2
 * (`docs/security/hardening/C2-frontend-csp.md`): the policy was already
 * shipping but `report-uri` pointed at a placeholder URL, so violations
 * were being dropped on the floor instead of feeding the
 * `csp_violation_total` time series.
 *
 * The route is anonymous on purpose — browsers POST violations from
 * unauthenticated page loads, and adding auth would just defeat the
 * sink. The `rateLimitExpress` bucket below caps abuse: per-IP bursts
 * of 120/min (2/s sustained) are far above any real browser report
 * rate but well below what an attacker needs to flood the metric.
 */
export function createCspReportRouter(): Router {
  const r = Router();
  r.post(
    "/api/csp-report",
    rateLimitExpress({ key: "api:csp-report", limit: 120, windowMs: 60_000 }),
    asyncHandler(cspReportHandler),
  );
  return r;
}
