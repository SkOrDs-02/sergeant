import { Router } from "express";
import {
  rateLimitExpress,
  requireAiQuota,
  requireAnthropicKey,
  setModule,
} from "../http/index.js";
import weeklyDigest from "../modules/digest/weekly-digest.js";

export function createWeeklyDigestRouter(): Router {
  const r = Router();
  r.post(
    "/api/weekly-digest",
    setModule("weekly-digest"),
    rateLimitExpress({
      key: "api:weekly-digest",
      limit: 10,
      windowMs: 60 * 60_000,
    }),
    requireAnthropicKey(),
    requireAiQuota(),
    weeklyDigest,
  );
  return r;
}
