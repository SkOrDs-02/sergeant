# `ops/n8n-workflows/_lib/`

Reference snippets that ship as files, not as workflow JSON. The
validator (`scripts/n8n/validate-n8n-workflows.mjs`) explicitly ignores
filenames that don't match `^\d{2,}-.+\.json$`, so anything under this
directory is invisible to the manifest-vs-files contract.

Use these as paste-into-n8n templates — DO NOT `require()` them from
workflow JSON (n8n runs Function nodes in a sandbox without access to the
project filesystem).

## Files

- [`sign-internal-request.js`](./sign-internal-request.js) — Function-node
  template that computes `X-Signature` (HMAC-SHA256 hex) + `X-Timestamp`
  (UNIX seconds) for outbound calls to `POST /api/internal/*` on the
  Sergeant server. PR-48 follow-up; pair with
  `apps/server/src/http/verifyWebhookSignature.ts` on the server side
  and with `manifest.json: { hmacSigned: true }` once rolled out.

  Roll-out playbook: [`docs/observability/security.md`](../../../docs/observability/security.md#api-internal-hmac-rollout).
