# L1 — `package.json` overrides — confirm `uuid` resolves

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Severity**   | Low                                                       |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                 |
| **Owner**      | platform                                                  |
| **Effort**     | 0.1 person-day                                            |
| **Status**     | Closed (2026-05-05) — batched M20 + L1 + L14 hardening PR |
| **Discovered** | 2026-05-03 deep security review                           |

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

## Resolution

- Tightened `package.json -> pnpm.overrides.uuid` from `">=14.0.0"`
  (loose, allowed any future major) to `"^14.0.0"` (single-major).
  Lockfile diff is one byte — no transitive resolution drift; we
  already had `uuid@14.0.0` resolved single-major, and now the override
  enforces that explicitly.
- Added [`scripts/check-pnpm-overrides.mjs`](../../../scripts/check-pnpm-overrides.mjs)
  - `pnpm lint:pnpm-overrides` script. The script reads every key from
    `pnpm.overrides`, runs `pnpm why <name> -r --json` and asserts that
    exactly one major is resolved across the workspace. Fails on (a)
    unsatisfiable ranges that resolve to nothing, (b) overrides for deps
    no workspace package depends on (dead override), (c) overrides whose
    range still permits multiple majors. The script self-discovers new
    overrides — no allowlist to keep in sync.
- Wired the script into
  [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) right
  after `pnpm audit` so override-drift is caught on every PR.
- Documented every override's CVE/rationale in
  [`audit-exceptions.md` → `pnpm.overrides` rationale (L1)](../audit-exceptions.md#pnpmoverrides-rationale-l1)
  so future contributors can decide whether to drop an override (when
  the upstream consumer-package itself bumps to a patched major).

## Cross-references

- [`../audit-exceptions.md`](../audit-exceptions.md)
- [`./L14-pnpm-frozen-lockfile-dev.md`](./L14-pnpm-frozen-lockfile-dev.md)
