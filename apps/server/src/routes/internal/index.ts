import { Router } from "express";
import type { Pool } from "pg";
import { env } from "../../env.js";
import { safeStringEqual } from "../../http/safeCompare.js";
import { verifyWebhookSignature } from "../../http/verifyWebhookSignature.js";
import { createBillingInternalRouter } from "./billing.js";
import { createCategorizeInternalRouter } from "./categorize.js";
import { createAiUsageInternalRouter } from "./ai-usage.js";
import { createPromptsInternalRouter } from "./prompts.js";
import { createSeoInternalRouter } from "./seo.js";
import { createGrowthInternalRouter } from "./growth.js";
import { createMarketingInternalRouter } from "./marketing.js";
import { createEmailInternalRouter } from "./email.js";
import { createUsersInternalRouter } from "./users.js";
import { createGovernanceInternalRouter } from "./governance.js";
import { createOpenClawInternalRouter } from "./openclaw.js";
import { createAlertsInternalRouter } from "./alerts.js";
import { createMonoInternalRouter } from "./mono.js";
import { createWebhookEventsInternalRouter } from "./webhook-events.js";
import { createStrategicInternalRouter } from "./strategic.js";
import { createAiMemoryInternalRouter } from "./ai-memory.js";

/**
 * Mounts all /api/internal/* routes behind a shared bearer-token guard +
 * an optional HMAC-SHA256 webhook signature verifier (PR-48 follow-up).
 *
 * Two layers, run in order:
 *
 *   1. `Authorization: Bearer <INTERNAL_API_KEY>` — required, fail-closed.
 *      Compare via `safeStringEqual` (constant-time `crypto.timingSafeEqual`),
 *      because naive `!==` leaks the first mismatching byte through CPU
 *      branch timing and turns the secret into a one-byte-at-a-time
 *      recovery problem for an on-path attacker.
 *
 *   2. `verifyWebhookSignature()` — runs ONLY when
 *      `WEBHOOK_HMAC_SECRET` is set. Checks `X-Signature` (HMAC-SHA256
 *      hex) and `X-Timestamp` (UNIX-seconds, 5-min replay window). Grace
 *      mode (`WEBHOOK_HMAC_REQUIRED=false`, the default) warn-logs
 *      mismatches but passes through, so n8n workflows can roll out one
 *      at a time; flip `WEBHOOK_HMAC_REQUIRED=true` after every wired
 *      workflow signs (`manifest.json: hmac_signed: true`). See
 *      `docs/observability/security.md` for the rollout playbook.
 *
 * These routes are intentionally NOT session-auth — they are machine-to-machine.
 * They must NEVER be exposed to end-users or third-party services.
 */
export function createInternalRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  router.use("/api/internal", (req, res, next) => {
    const internalKey = env.INTERNAL_API_KEY;
    if (!internalKey) {
      // Fail closed: if the key is not configured, deny all requests
      res.status(503).json({ error: "Internal API not configured" });
      return;
    }
    const auth = req.headers.authorization ?? "";
    if (!safeStringEqual(auth, `Bearer ${internalKey}`)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  // HMAC verification runs AFTER the bearer-token guard so we never spend
  // a constant-time compare on an unauthenticated request. The middleware
  // is a no-op when `WEBHOOK_HMAC_SECRET` is empty — so mounting it
  // unconditionally is safe across dev/test/prod.
  router.use("/api/internal", verifyWebhookSignature());

  router.use(createBillingInternalRouter({ pool }));
  router.use(createCategorizeInternalRouter());
  router.use(createAiUsageInternalRouter({ pool }));
  router.use(createPromptsInternalRouter());
  router.use(createSeoInternalRouter({ pool }));
  router.use(createGrowthInternalRouter({ pool }));
  router.use(createMarketingInternalRouter({ pool }));
  router.use(createEmailInternalRouter({ pool }));
  router.use(createUsersInternalRouter({ pool }));
  router.use(createGovernanceInternalRouter({ pool }));
  router.use(createOpenClawInternalRouter({ pool }));
  router.use(createAlertsInternalRouter({ pool }));
  router.use(createMonoInternalRouter({ pool }));
  router.use(createWebhookEventsInternalRouter({ pool }));
  router.use(createStrategicInternalRouter({ pool }));
  router.use(createAiMemoryInternalRouter({ pool }));

  return router;
}
