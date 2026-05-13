import { Router } from "express";
import type { Pool } from "pg";
import { env } from "../../env.js";
import { safeStringEqual } from "../../http/safeCompare.js";
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
import { createAiMemoryDlqInternalRouter } from "./ai-memory-dlq.js";

/**
 * Mounts all /api/internal/* routes behind a shared bearer-token guard.
 *
 * n8n workflows must include `Authorization: Bearer <INTERNAL_API_KEY>` on
 * every request. The key is set via the INTERNAL_API_KEY env var on the server
 * and on the n8n side as a Header Auth credential.
 *
 * Bearer-token compare goes through `safeStringEqual` — naive `!==` leaks
 * the first mismatching byte through CPU branch timing and turns the secret
 * into a one-byte-at-a-time recovery problem for an on-path attacker.
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
  router.use(createAiMemoryDlqInternalRouter({ pool }));

  return router;
}
