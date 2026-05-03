# L10 — `recordSync*` logs raw `userId` instead of hash

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Low                                           |
| **Sprint**     | [Sprint 4](./sprint-4.md)                     |
| **Owner**      | backend                                       |
| **Effort**     | 0.25 person-day                               |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

Pino redacts `email` and `phone`, but `userId` (UUID) flows raw into logs.
If the log store is ever exposed, an attacker can correlate sessions to
users by joining the leaked UUID against any future `users` table dump.

## Recommendation

- Log `userIdHash = sha256(userId).slice(0, 16)` instead of the raw UUID.
- Keep raw `userId` only in Sentry traces (where PII scrubbing is
  configured) and in audit tables.

## Correction points

- `apps/server/src/obs/logger.ts` — extend `redactPaths` /
  custom-serializer to hash `userId`.
- `apps/server/src/lib/userIdHash.ts` (new) — shared helper.
- Tests in `obs/logger.test.ts` covering the hash format.

## Verification

- **Unit:** log entry containing `userId: "..."` produces an output with
  `userIdHash` and no raw UUID.
- **Manual:** stream Railway logs for 10 minutes; `grep -E
  '[0-9a-f]{8}-[0-9a-f]{4}-…'` returns no UUID matches.

## Cross-references

- [`./M3-pino-redact-paths.md`](./M3-pino-redact-paths.md)
