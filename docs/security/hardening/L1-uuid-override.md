# L1 — `package.json` overrides — confirm `uuid` resolves

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`package.json` `pnpm.overrides` includes `"uuid": ">=14.0.0"`. The latest
stable `uuid` versions in 2026 are 11.x / 12.x. The pin may be unsatisfiable
and silently fall back to the dependency's own pinned version, defeating the
override.

## Recommendation

- Run `pnpm why uuid` after a clean install in CI.
- Pin to a known-good version (`^11` or `^12`) and document in
  `audit-exceptions.md` why the override exists.

## Correction points

- `package.json` — adjust the override to a real major.
- `.github/workflows/ci.yml` — add a step that fails if `pnpm why uuid`
  reports an unresolved override.

## Verification

- **CI:** `pnpm install --frozen-lockfile && pnpm why uuid` reports a
  single resolved version.

## Cross-references

- [`../audit-exceptions.md`](../audit-exceptions.md)
