# I5 — Pre-commit hooks for secret detection

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

Gitleaks runs in CI. Catching secrets earlier — at `git commit` — is
cheaper than catching them at the pull-request boundary because the
attacker timeline starts the moment a secret is committed locally.

## Recommendation

- Install `gitleaks-pre-commit` (or `pre-commit` framework with the
  gitleaks hook) and document the install command in `CONTRIBUTING.md`.
- Use the same `.gitleaks.toml` config as CI to keep results consistent.

## Correction points

- `.pre-commit-config.yaml` — add the gitleaks hook.
- `CONTRIBUTING.md` — document `pre-commit install`.
- `package.json` `prepare` script — `pre-commit install --install-hooks`.
- `docs/security/audit-exceptions.md` — entries for any unavoidable
  false positives (rare).

## Verification

- **Manual:** committing a fake AWS key on a branch is rejected locally
  with a clear error.
- **CI:** an existing CI run still catches anything that bypasses the
  local hook (defense in depth).

## Cross-references

- [`./I2-secret-scanning-push-protection.md`](./I2-secret-scanning-push-protection.md)
- [`./H2-dependabot.md`](./H2-dependabot.md)
