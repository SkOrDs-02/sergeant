# Security Events — Operator Playbook

> **Tracking:** I7 sprint card — `feat/security-i7-events-openclaw`
> **Owner:** @Skords-01
> **Last updated:** 2026-05-23

## Overview

The security events pipeline (`apps/server/src/obs/securityEvents.ts`) emits
typed, rate-limited signals when the API server detects an anomalous or
security-relevant condition. Signals are:

1. Logged via Pino at the appropriate level (see mapping below).
2. Pushed to Telegram (`SERGEANT_OPS_CHAT_ID`) via `SERGEANT_ALERT_BOT_TOKEN`.

Rate limit: **max 10 events per event-type per 60-second window** — suppressed
events are counted in `security_event_rate_limited` Pino warns.

---

## Event Reference

### `mono_webhook_bad_payload`

**Severity:** `high`
**Pino level:** `error`

Monobank webhook POST failed Zod schema validation before any DB write. The
payload is untrusted; the issues array is logged (no raw payload echo).

**Possible causes:**
- Monobank changed their webhook schema (upstream breaking change).
- Attacker probing the endpoint with malformed payloads.
- Integration bug in a third-party webhook forwarder.

**Response:**
1. Check the `issues` field in the Pino log for the failing Zod paths.
2. If Monobank API changelog confirms a schema change — update `WebhookPayloadSchema` in `modules/mono/webhook.ts`.
3. If rate is sustained (>50/min from a single IP) — consider adding IP-level
   rate limiting to `POST /api/mono/webhook` in the rate-limit config.
4. Correlate with `mono_webhook_received_total{status="bad_payload"}` in
   Grafana dashboard `mono-webhook`.

---

### `auth_session_ua_drift`

**Severity:** `medium`
**Pino level:** `warn`

Session fingerprint drift detected: user-agent or IP prefix changed between
the stored session fingerprint and the current request (H3 hardening).

**Important:** A single drift event is **not** evidence of compromise. Users
legitimately switch networks (mobile → WiFi) and upgrade browsers. This event
is a forensics signal, not an automatic block.

**Possible causes:**
- User switched networks (home → mobile).
- Browser or OS auto-update changed the UA string.
- Credential sharing / session theft (sustained pattern from different IPs).
- VPN or proxy rotation.

**Response:**
1. Single event: observe but do not act. Note the `userIdHash` for correlation.
2. Sustained pattern (same `userIdHash`, many different IP prefixes within
   minutes): escalate. Consider forcing re-authentication for that user via
   the admin panel or a direct DB `DELETE FROM session WHERE user_id = ?`.
3. Sustained pattern across many `userIdHash` values: possible infrastructure
   issue (load balancer removing `X-Forwarded-For`, clock skew). Check infra.

---

### `prompt_injection_attempt`

**Severity:** `high`
**Pino level:** `error`

A `tool_result` block returned to the chat endpoint contained a prompt-injection
marker (e.g. "ignore previous instructions", `<system>`, "act as evil AI").
The content was still forwarded to the model inside a `<tool_output>` envelope
(M8 hardening), which instructs the model to treat it as data.

**Possible causes:**
- Compromised upstream: Mono webhook `description` field, n8n webhook response,
  or GitHub API response contained injected text.
- Attacker crafted a malicious tool response (would require compromising the
  tool execution path or the user's linked account).
- False positive: legitimate text matched a broad pattern (e.g. a blog post
  excerpt about AI safety that contains "ignore previous instructions").

**Response:**
1. Check the `tool` label in the log to identify which tool triggered.
2. If `tool=unknown` — an orphan `tool_result` block was received; check
   client for state corruption.
3. Review the upstream source for that tool (Mono API, n8n workflow, GitHub).
4. If the pattern is a false positive, review `PROMPT_INJECTION_PATTERNS` in
   `modules/chat/toolOutputWrapping.ts` and narrow the regex if safe to do so.
5. If sustained: consider temporarily disabling the affected tool via
   runtime kill-switch or removing it from `TOOLS` in `modules/chat/tools.ts`.

---

### `transcribe_usd_cap_hit`

**Severity:** `medium`
**Pino level:** `warn`

A user hit the per-day USD cap on the `/api/transcribe` endpoint (H9
hardening). The request was rejected with HTTP 402.

**Possible causes:**
- Legitimate heavy usage (user transcribed many long audio files).
- Automated abuse: bot repeatedly posting audio to exhaust the daily cap
  (DoS against the user's own quota or cost amplification).

**Response:**
1. The cap is configured via `TRANSCRIBE_USD_CAP_PER_USER_PER_DAY_USD` env.
   Check the `bucket` and `cap_micros` values in the log.
2. To unblock a specific user: manually reset their cap row:
   ```sql
   DELETE FROM transcribe_usd_usage
   WHERE subject_key = '<subject>' AND usage_day = CURRENT_DATE;
   ```
3. If the same user is hitting the cap every day through legitimate use,
   raise the cap or contact them about usage patterns.
4. If multiple users are hitting the cap concurrently (bulk abuse): tighten
   the rate limit on `/api/transcribe` in the rate-limit config and alert Ops.

---

### `chat_tool_cap_hit`

**Severity:** `high` (client_request) / `medium` (anthropic_response)
**Pino level:** `error` (high) / `warn` (medium)

The tool-iteration cap (`MAX_TOOL_ITERATIONS = 8`) was exceeded. The request
was rejected with HTTP 422 (M7 hardening).

**`boundary=client_request`** — the client sent more than `MAX_TOOL_ITERATIONS`
`tool_result` blocks in a single request. This is either:
- A manipulated / malformed client payload (most likely abuse).
- A client-side bug where tool execution output was duplicated.

**`boundary=anthropic_response`** — the Anthropic model returned more than
`MAX_TOOL_ITERATIONS` `tool_use` blocks in a single response (runaway model
loop).

**Response:**
1. `boundary=client_request` (high severity):
   - Check `observed` value vs. `MAX_TOOL_ITERATIONS` to gauge how far over.
   - If sustained from one user: investigate for automation / scripted abuse.
   - If from multiple users after a client update: likely a client-side bug;
     coordinate with mobile/web team to fix the tool-execution loop.
2. `boundary=anthropic_response` (medium severity):
   - Usually transient model behavior. Monitor rate.
   - If sustained: review recent prompt/tool definition changes that may be
     causing the model to propose excessive parallel tool calls.

---

## Muting Alerts Temporarily

Set `SECURITY_EVENTS_MUTED=1` in the server Railway environment to suppress
Telegram push for all security events without affecting Pino logging or
Prometheus metrics. This is useful during load tests, planned maintenance, or
when investigating a high-volume false-positive pattern.

**To mute:**
```
railway variables set SECURITY_EVENTS_MUTED=1 --service api
```

**To unmute:**
```
railway variables set SECURITY_EVENTS_MUTED=0 --service api
```

Or remove the variable entirely — the emitter treats any value other than `"1"`
as "not muted".

---

## Prometheus Queries

```promql
# Rate of security events by type (5m window)
sum by (event) (rate(security_event_rate_limited[5m]))

# Correlation: bad payload rate vs. total mono webhook rate
rate(mono_webhook_received_total{status="bad_payload"}[5m])
  / rate(mono_webhook_received_total[5m])

# Tool cap hits by boundary (M7)
rate(chat_tool_iteration_cap_hit_total[5m]) by (boundary)

# Prompt injection hit rate per tool (M8)
rate(chat_prompt_injection_attempt_total[5m]) by (tool)

# Transcribe cap events
rate(transcribe_usd_cap_events_total{outcome="cap_hit"}[1h])
```
