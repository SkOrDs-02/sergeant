# I4 — `/.well-known/security.txt` content + expiry refresh

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`vercel.json` already exposes `/.well-known/security.txt`. Confirm the
content includes:

- `Contact: mailto:security@2dmanager.com.ua` (or equivalent).
- `Expires: 2026-12-31T23:59:59Z` — refreshed yearly.
- `Preferred-Languages: uk, en`.
- `Encryption: <PGP-key URL>` (optional but recommended).

Without a fresh `Expires` field, RFC 9116 considers the file expired and
researchers may be deterred from reporting.

## Recommendation

- Standardise the content; commit a `apps/web/public/.well-known/security.txt`
  source file.
- Add a CI guard that fails if `Expires` is < 30 days from now.

## Correction points

- `apps/web/public/.well-known/security.txt` — refreshed content.
- `scripts/check-security-txt-expiry.sh` (new) — CI guard.
- `docs/security/README.md` — link to the file and the maintenance
  cadence.

## Verification

- **Manual:** `curl https://<domain>/.well-known/security.txt` returns the
  expected fields.
- **CI:** the guard fails when `Expires` is within 30 days.

## Cross-references

- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
