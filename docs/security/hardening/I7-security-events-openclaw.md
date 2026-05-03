# I7 — Push security events to OpenClaw

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Informational / hardening                     |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | backend                                       |
| **Effort**     | 1 person-day                                  |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

Earlier sprints introduce metrics: `mono_webhook_bad_payload`,
`auth.session.ua_drift`, `prompt_injection_attempt`,
`transcribe.usd_cap_hit`, `chat.tool_iteration_cap_hit`. These metrics live
in Sentry / Pino — useful for forensics, slow for response. A push to the
OpenClaw founder bot turns them into actionable signals.

## Recommendation

- Define a "security topic" in OpenClaw with a fixed set of event types.
- Server emits compact payloads: `{ event, severity, user_id_hash,
  details, timestamp }`.
- Rate-limit the push at source so a burst does not flood Telegram.

## Correction points

- `apps/server/src/obs/securityEvents.ts` (new) — typed emitter.
- `apps/server/src/modules/mono/webhook.ts`, `auth.ts`, `chat.ts`,
  `transcribe.ts` — call sites for each event.
- `apps/console/src/openclaw/securityRoom.ts` (new) — OpenClaw consumer.
- `docs/runbooks/security-events.md` (new) — operator playbook for each
  event type.

## Verification

- **Synthetic:** trigger each event in staging; the OpenClaw room receives
  the message within 30 s.
- **Operational:** the founder can mute / unmute the room without code
  changes (config flag).

## Cross-references

- [`./M3-pino-redact-paths.md`](./M3-pino-redact-paths.md)
- [`./M8-prompt-injection-tool-output.md`](./M8-prompt-injection-tool-output.md)
- [`./M14-internal-push-ip-allowlist.md`](./M14-internal-push-ip-allowlist.md)
