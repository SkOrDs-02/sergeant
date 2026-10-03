-- 080: openclaw_approval_nonce — single-use approval nonces for OpenClaw
-- write-tool endpoints (ADR-0036 Phase 4 hardening; branch security review
-- 2026-07-09, MEDIUM).
--
-- Problem: `/api/internal/openclaw/write/*` enforced founder-approval only
-- on the console side. Server-side, anything holding INTERNAL_API_KEY could
-- POST a write with NO approval verification — one leaked key = full write
-- capability (open PRs, pause prod workflows, mute Sentry).
--
-- Fix: the console requests a signed, short-TTL nonce from
-- `/api/internal/openclaw/approval-nonce` at the moment it renders the
-- founder's Approve keyboard, then replays it on the write call. The nonce
-- payload (`jti`, `tool`, `argsHash`, `exp`) is HMAC-signed so it cannot be
-- forged or repurposed for a different tool/args, and this table makes it
-- SINGLE-USE: `consumed_at` is stamped atomically on first successful
-- verification, so a captured write request cannot be replayed.
--
-- Rollout mirrors the `WEBHOOK_HMAC_REQUIRED` grace-mode used for n8n
-- internal routes: verify-and-consume opportunistically first
-- (OPENCLAW_WRITE_NONCE_REQUIRED=false), flip to required once the console
-- (separate repo, tools/openclaw) ships its Approve-flow change.
--
-- Forward-additive: existing writes keep working while the secret is unset
-- or the flag is off. The table is append-on-mint + update-on-consume; a
-- retention poller / manual sweep GCs expired rows (short TTL keeps it tiny).

CREATE TABLE IF NOT EXISTS openclaw_approval_nonce (
  -- Random 128-bit id (32-char hex) minted per approval. Also the signed
  -- token's `jti` claim — the row is the single-use ledger for that token.
  jti          TEXT PRIMARY KEY,

  -- One of OPENCLAW_WRITE_TOOL_NAMES (commit_to_strategy_doc,
  -- create_github_issue, post_to_topic, pause_workflow, mute_alert). Bound
  -- into the HMAC so a nonce minted for one tool can't authorize another.
  -- Soft-validated as TEXT so future Phase 4.x tools don't need a redeploy.
  tool         TEXT NOT NULL,

  -- sha256(canonical-json(projected write args)) hex. Binds the nonce to the
  -- exact args the founder approved — a captured nonce can't be repurposed
  -- for a different payload of the same tool.
  args_hash    TEXT NOT NULL,

  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hard expiry (issued_at + OPENCLAW_APPROVAL_NONCE_TTL_SEC). The consume
  -- UPDATE also checks `expires_at > NOW()` so an expired-but-unconsumed
  -- nonce is rejected even if the signed token's clock check were bypassed.
  expires_at   TIMESTAMPTZ NOT NULL,

  -- NULL until the write endpoint consumes it. Stamped atomically
  -- (UPDATE ... WHERE jti = $1 AND consumed_at IS NULL) so two concurrent
  -- writes racing the same nonce can never both win.
  consumed_at  TIMESTAMPTZ
);

-- Sweep expired/consumed rows (retention GC + `/audit`-style scans).
CREATE INDEX IF NOT EXISTS openclaw_approval_nonce_expires_idx
  ON openclaw_approval_nonce (expires_at);

COMMENT ON TABLE openclaw_approval_nonce IS
  'Single-use approval nonces for OpenClaw write-tools. Minted at console approval time, consumed on the /write/* call. ADR-0036 Phase 4 hardening.';

COMMENT ON COLUMN openclaw_approval_nonce.jti IS
  '128-bit hex nonce id; also the signed token jti. Row is the single-use ledger.';

COMMENT ON COLUMN openclaw_approval_nonce.args_hash IS
  'sha256 of canonical-json(projected write args). Binds the nonce to the approved payload.';

COMMENT ON COLUMN openclaw_approval_nonce.consumed_at IS
  'Stamped atomically on first successful verification. Non-null → already spent.';
