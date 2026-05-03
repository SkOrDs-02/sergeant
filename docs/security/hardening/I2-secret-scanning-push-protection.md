# I2 — Enable secret-scanning + push protection

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Severity**   | Informational / hardening                     |
| **Sprint**     | [Sprint 3](./sprint-3.md)                     |
| **Owner**      | platform                                      |
| **Effort**     | 0.1 person-day                                |
| **Status**     | Open                                          |
| **Discovered** | 2026-05-03 deep security review               |

## Summary

GitHub native secret scanning + push protection blocks commits containing
known-format secrets (AWS, Stripe, Anthropic, Groq, etc.) before they reach
the remote. Combined with the existing pre-commit gitleaks the policy is
defence-in-depth.

## Recommendation

- Repo Settings → Code security → enable "Secret scanning" and "Push
  protection".
- Ensure the founder + every external contributor receives the secret-found
  email.
- Document the policy in `docs/security/README.md` so future contributors
  know what to do when blocked at push time.

## Correction points

- GitHub repo settings — toggle `secret_scanning` and
  `secret_scanning_push_protection` to enabled (out of repo).
- `docs/security/README.md` — add a paragraph and link to GitHub's docs.
- `docs/security/audit-exceptions.md` — document any provider keys that the
  scanner false-positives on.

## Verification

- **Manual:** commit a fake AWS key (placeholder format) on a throwaway
  branch and `git push`; expect the push to be rejected with the documented
  error.
- **Audit trail:** the audit-exceptions ledger tracks every override
  granted via the GitHub UI.

## Cross-references

- [`./H2-dependabot.md`](./H2-dependabot.md)
- [`./I1-codeql-workflow.md`](./I1-codeql-workflow.md)
