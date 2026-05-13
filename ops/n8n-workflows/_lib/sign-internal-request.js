/**
 * n8n Function-node template — outbound HMAC-SHA256 signing for
 * `POST /api/internal/*` calls (Sergeant server, PR-48 follow-up).
 *
 * Paste this code into a Function-node placed IMMEDIATELY BEFORE an
 * HTTP-Request node that hits `/api/internal/*`. It produces three
 * fields on `$json` that the HTTP-Request node should reference via
 * `={{ $json.xSignature }}`, `={{ $json.xTimestamp }}`, and the
 * already-serialized body `={{ $json.bodyJson }}` (set the HTTP-Request
 * "Body Content Type" to **"Raw"** and copy `bodyJson` verbatim — n8n's
 * JSON body builder re-serializes the object and would invalidate the
 * signature otherwise).
 *
 * Server side: `apps/server/src/http/verifyWebhookSignature.ts`. The
 * signature format is identical: hex-HMAC-SHA256 of
 * `<timestamp>.<rawBody>` keyed by `WEBHOOK_HMAC_SECRET`. Replay window
 * is 5min (`WEBHOOK_HMAC_TS_TOLERANCE_SEC`, server-side env).
 *
 * Roll-out:
 *   1. Add this Function-node to one workflow at a time.
 *   2. Test against staging with `WEBHOOK_HMAC_REQUIRED=false`
 *      (default grace mode) — server passes the request through but
 *      logs `webhook_hmac_mismatch` on any mistakes, which you'll see
 *      in Grafana / Sentry.
 *   3. Flip `manifest.json: { hmacSigned: true }` for the workflow
 *      and add `"WEBHOOK_HMAC_SECRET"` to `requiredEnv` (validator
 *      enforces this).
 *   4. After all `INTERNAL_API_KEY` workflows are migrated, flip
 *      `WEBHOOK_HMAC_REQUIRED=true` on the server.
 */

// Input — what the upstream node produced. Adjust the body shape per
// workflow; the rest of the snippet does not depend on body schema.
const upstream = $input.first()?.json ?? {};
const body = upstream.body ?? upstream; // workflow-specific — replace as needed

// Serialize body to a stable string. We sign the EXACT bytes that the
// HTTP-Request node will transmit, so anything that re-orders keys or
// re-encodes whitespace would break the signature on the server side.
const bodyJson = JSON.stringify(body);

// `WEBHOOK_HMAC_SECRET` must be set on the n8n side as well — add it to
// the workflow's `requiredEnv` in manifest.json once you flip
// `hmacSigned: true`. Empty / undefined → workflow is misconfigured.
const secret = $env.WEBHOOK_HMAC_SECRET || "";
if (!secret) {
  throw new Error(
    "WEBHOOK_HMAC_SECRET is not set on the n8n side — outbound HMAC signing requires the same secret as the server",
  );
}

const xTimestamp = Math.floor(Date.now() / 1000);

// n8n's Function-node sandbox bundles Node.js `crypto`. The hex-encoded
// digest is what the server's constant-time compare expects (the server
// uses `Buffer.from(hex, "utf8")` on both sides — same length, same
// representation).
const crypto = require("crypto");
const xSignature = crypto
  .createHmac("sha256", secret)
  .update(`${xTimestamp}.`)
  .update(bodyJson, "utf8")
  .digest("hex");

return [
  {
    json: {
      ...upstream,
      bodyJson,
      xTimestamp: String(xTimestamp),
      xSignature,
    },
  },
];
