-- M14 — Append-only audit log for `POST /api/push/send` calls
-- (`docs/security/hardening/M14-internal-push-ip-allowlist.md`).
--
-- The internal `/api/push/send` endpoint is the broadest fan-out write in
-- the API: a single call can deliver an arbitrary payload to every
-- registered web push subscription of a target user. Today it is gated
-- only by `requireApiSecret(API_SECRET)`. If `INTERNAL_API_KEY` ever
-- leaks (or a misconfigured worker keeps logging the secret in a Sentry
-- breadcrumb), the attacker can silently spam every user's notification
-- channel — and we have **no** post-hoc record of who triggered which
-- payload to whom. This table is the persistent forensic trail that
-- closes that gap.
--
-- Append-only by design. We never UPDATE / DELETE individual rows —
-- retention is enforced by a periodic sweep on `created_at` (caller TBD;
-- migration only declares the schema, not the cleanup cadence). That
-- keeps the row immutable from the application path: an attacker who
-- compromises the API user cannot rewrite history, only append more.
-- Rotation policy is captured in `docs/security/access-matrix.md`.
--
-- Data captured per send:
--   * `caller_ip`        — `getIp(req)` resolution (X-Forwarded-For aware
--                          via `app.set('trust proxy', …)`); `inet` so
--                          we can index/range-query (`<<= 100.64.0.0/10`)
--                          for "all sends from Railway internal CIDR".
--   * `target_user_id`   — push recipient. Mirrors `push_subscriptions
--                          .user_id` shape (TEXT, Better Auth uuid v4).
--   * `notification_type`— `module` field from the request body
--                          (`finyk` / `nutrition` / etc); nullable for
--                          legacy callers that don't supply one yet.
--   * `payload_hash`     — SHA-256 (hex) over the canonical JSON payload
--                          (`{title, body, module, tag}`). We do NOT
--                          store the plaintext payload: it can contain
--                          PII (e.g. transaction names from Finyk),
--                          and a hash is enough to prove "the same
--                          payload was fanned out N times" or to
--                          correlate with a payload we still hold in a
--                          short-lived log.
--   * `subs_count`       — number of `push_subscriptions` rows the
--                          handler fanned the payload out to. Lets an
--                          analyst see "this user had 3 devices when
--                          the spam happened".
--   * `sent_count`       — subset of `subs_count` that returned
--                          `outcome = "ok"` from `sendWebPush`.
--   * `created_at`       — server clock at insert; `DEFAULT NOW()` so
--                          callers don't need to pass it.

CREATE TABLE IF NOT EXISTS push_send_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_ip INET,
  target_user_id TEXT NOT NULL,
  notification_type TEXT,
  payload_hash TEXT NOT NULL,
  subs_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Show me every push that landed on this user in the last hour" is the
-- forensic query that motivates this index. Without it the table scan
-- becomes O(rows) per investigation, which on a busy day is unbounded.
CREATE INDEX IF NOT EXISTS push_send_audit_target_user_idx
  ON push_send_audit (target_user_id, created_at DESC);

-- "Show me every push that originated from this IP in the last hour" —
-- the symmetric query for tracing back to a compromised caller. Indexed
-- on `(caller_ip, created_at)` rather than `caller_ip` alone so the
-- common time-bounded incident-response query stays an index-only scan.
CREATE INDEX IF NOT EXISTS push_send_audit_caller_ip_idx
  ON push_send_audit (caller_ip, created_at DESC);

-- Bare `created_at` index supports the retention sweep
-- (`DELETE … WHERE created_at < NOW() - INTERVAL '90 days'`). Without
-- it the sweep degrades to a sequential scan once the table grows past
-- a few hundred thousand rows.
CREATE INDEX IF NOT EXISTS push_send_audit_created_at_idx
  ON push_send_audit (created_at);
