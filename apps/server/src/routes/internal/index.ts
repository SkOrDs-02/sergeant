import { Router } from "express";
import type { Pool } from "pg";
import { env } from "../../env.js";
import { rateLimitExpress } from "../../http/rateLimit.js";
import { requireInternalIp } from "../../http/requireInternalIp.js";
import { logger } from "../../obs/logger.js";
import { safeStringEqual } from "../../http/safeCompare.js";
import { verifyWebhookSignature } from "../../http/verifyWebhookSignature.js";
import { createBillingInternalRouter } from "./billing.js";
import { createCategorizeInternalRouter } from "./categorize.js";
import { createAiUsageInternalRouter } from "./ai-usage.js";
import { createPromptsInternalRouter } from "./prompts.js";
import { createEmailInternalRouter } from "./email.js";
import { createUsersInternalRouter } from "./users.js";
import { createAlertsInternalRouter } from "./alerts.js";
import { createEvalRagInternalRouter } from "./eval-rag.js";
import { createMonoInternalRouter } from "./mono.js";
import { createSilpoInternalRouter } from "./silpo.js";
import { createWebhookEventsInternalRouter } from "./webhook-events.js";
import { createStrategicInternalRouter } from "./strategic.js";
import { createAiMemoryDlqInternalRouter } from "./ai-memory-dlq.js";
import { createDebugWindowInternalRouter } from "./debug-window.js";
import { createGdprInternalRouter } from "./gdpr.js";

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
 *      hex) and `X-Timestamp` (UNIX-seconds, 5-min replay window).
 *      `WEBHOOK_HMAC_REQUIRED` defaults to `true` since 2026-09-16, so a
 *      missing or invalid signature is a 401; set it to `false` only as a
 *      deliberate, temporary opt-out while a new internal caller learns to
 *      sign. Note the layer is skipped entirely when the secret is empty —
 *      `assertStartupEnv` warns about that combination at boot. See
 *      `docs/governance/security/api-internal-hmac.md`.
 *
 * Перед обома шарами (аудит ai-pipeline B27):
 *
 *   0a. `requireInternalIp` — лише коли задано `INTERNAL_ALLOWED_IPS`.
 *       Порожній список = шар не монтується навіть у production, бо
 *       fail-closed 503 зламав би всіх легітимних викликачів (n8n / Coolify-
 *       крони, `scripts/replay-*.mjs`), чиї адреси ще не інвентаризовані.
 *   0b. Rate-limit `api:internal` (per-IP, 120/хв) — стеля для brute-force
 *       ключа та для витоку ключа → безкоштовні LLM-виклики. Рахує й 401.
 *
 * These routes are intentionally NOT session-auth — they are machine-to-machine.
 * They must NEVER be exposed to end-users or third-party services.
 */
/** Щедро: bulk-реплеї/крони легітимні, але не безмежні. */
const INTERNAL_RATE_LIMIT_PER_MIN = 120;

export function createInternalRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  if (env.INTERNAL_ALLOWED_IPS.trim() !== "") {
    router.use(
      "/api/internal",
      requireInternalIp({
        entries: env.INTERNAL_ALLOWED_IPS,
        onReject: ({ ip, path }) => {
          logger.warn({ msg: "internal_ip_rejected", callerIp: ip, path });
        },
      }),
    );
  }

  router.use(
    "/api/internal",
    rateLimitExpress({
      key: "api:internal",
      limit: INTERNAL_RATE_LIMIT_PER_MIN,
      windowMs: 60_000,
    }),
  );

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
  router.use(createEmailInternalRouter({ pool }));
  router.use(createUsersInternalRouter({ pool }));
  router.use(createAlertsInternalRouter({ pool }));
  router.use(createEvalRagInternalRouter({ pool }));
  router.use(createMonoInternalRouter({ pool }));
  router.use(createSilpoInternalRouter());
  router.use(createWebhookEventsInternalRouter({ pool }));
  router.use(createStrategicInternalRouter({ pool }));
  router.use(createAiMemoryDlqInternalRouter({ pool }));
  router.use(createDebugWindowInternalRouter());
  router.use(createGdprInternalRouter({ pool }));

  return router;
}
