# I5 — Pre-commit hooks for secret detection

> **Last validated:** 2026-05-14 by Devin. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/04-governance/security/hardening/I5-pre-commit-secret-detection.md`.

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.25 person-day                 |
| **Status**     | **Closed (2026-05-14)**         |
| **Discovered** | 2026-05-03 deep security review |

## Summary

Gitleaks runs in CI. Catching secrets earlier — at `git commit` — is
cheaper than catching them at the pull-request boundary because the
attacker timeline starts the moment a secret is committed locally.

## Implementation

This repo uses **Husky** rather than the Python `pre-commit` framework
(see `.husky/pre-commit` and `package.json` `prepare` script), so the
gitleaks step lives as a Node wrapper invoked from the existing Husky
hook chain — no new tooling dependency is introduced for contributors.

- `scripts/pre-commit-gitleaks.mjs` — Node wrapper:
  - Detects if `gitleaks` is on `PATH`. If yes, runs
    `gitleaks protect --staged --redact --no-banner --verbose` against
    the staged changeset.
  - If `gitleaks` is **not** installed, prints an actionable install
    hint and exits 0. We do not block the commit because the CI gate
    (`secret-scan` job) still catches anything that bypasses the local
    hook — forcing every dev to install gitleaks before they can
    `git commit` would create onboarding friction without a security
    improvement on top of the CI gate.
  - Honours the existing `.gitleaksignore` (and any future
    `.gitleaks.toml`) at the repo root for consistency with the CI job.
  - Break-glass: `SERGEANT_SKIP_GITLEAKS=1 git commit …` logs a stderr
    warning and skips the local scan. Hard Rule #7 (`--no-verify` ban)
    is unchanged — documented false-positives must enter
    `.gitleaksignore` in the same commit.
- `.husky/pre-commit` — appended `node scripts/pre-commit-gitleaks.mjs`
  after `lint-staged`.
- `package.json` — `pnpm lint:secrets` script for manual runs over the
  staged set.
- `CONTRIBUTING.md` — install command + behaviour documented under
  §«Локальний secret-scan (gitleaks)» and the updated «Pre-commit hooks»
  section.

## Verification

- **Manual:** staging a fake `ghp_…` token in a tracked file and
  running `pnpm lint:secrets` (or `git commit`) is rejected locally with
  the gitleaks `github-pat` rule (verified 2026-05-14 against
  `gitleaks` v8.21.2).
- **CI:** the pre-existing `secret-scan` job in `.github/workflows/ci.yml`
  remains the authoritative gate; unchanged by this PR.

## Cross-references

- [`./I2-secret-scanning-push-protection.md`](./I2-secret-scanning-push-protection.md)
- [`./H2-dependabot.md`](./H2-dependabot.md)
