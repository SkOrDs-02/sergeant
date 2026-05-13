# I2 — Enable secret-scanning + push protection

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** **Closed (2026-05-04)**

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.1 person-day                  |
| **Status**     | **Closed (2026-05-04)**         |
| **Discovered** | 2026-05-03 deep security review |

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
- [`../README.md` → Secret scanning policy](../README.md#secret-scanning-policy) — operational runbook.

## Resolution log

### 2026-05-04 — Closed

GitHub native secret scanning + push protection вже включені на репо
(`security_and_analysis.secret_scanning = enabled`,
`secret_scanning_push_protection = enabled` через GitHub API). Перевірено
через `GET /repos/Skords-01/Sergeant`.

**Doc-side зроблено:**

- `docs/security/README.md` — додано секцію `Secret scanning policy` з
  тришаровим описом (GitHub native + CI gitleaks + Husky pre-commit) і двома
  operational runbook-ами:
  1. Що робити, якщо `git push` заблокований push-protection-ом
     (real-leak vs false-positive paths).
  2. Що робити, якщо секрет уже у remote (incident response: ротація → history
     scrub → запис у audit-exceptions).
- `docs/security/audit-exceptions.md` — додано дві нові секції:
  `Secret-scanning false positives` (для bypass-ів через GitHub UI) і
  `Secret-leak incidents` (для зафіксованих витоків). Кожна — з шаблоном
  для нового запису.

**Defense-in-depth status:**

- ✅ Layer 1: GitHub native secret-scanning + push-protection (enabled).
- ✅ Layer 2: CI `gitleaks` (`secret-scan` job у `.github/workflows/ci.yml`,
  `gitleaks/gitleaks-action` SHA-pinned).
- ✅ Layer 3: Husky pre-commit (ESLint + Prettier через lint-staged,
  не secret-detection напряму, але закриває console.log + merge-конфлікт-маркери).

**Не закрито (паркуємо як майбутні I-картки):**

- `secret_scanning_non_provider_patterns` (paid GitHub Advanced Security
  feature; для public-repo вже free, для private — не активовано без
  GHAS-ліцензії). Поточна релевантність — низька, бо CI gitleaks покриває
  custom-патерни (`BETTER_AUTH_SECRET`, `*_TOKEN_ENC_KEY`).
- `secret_scanning_validity_checks` (GHAS-feature, перевіряє чи секрет дійсний
  у провайдера). Залишаємо паркованим.
- I5 (pre-commit secret-detection через gitleaks/trufflehog у Husky-хуку) —
  трекається окремо як [I5](./I5-pre-commit-secret-detection.md), якщо
  команда вирішить зміцнити layer 3.

**Verification:**

```bash
$ curl -s -H "Authorization: token $GIT_PAT" \
    https://api.github.com/repos/Skords-01/Sergeant \
    | jq '.security_and_analysis.secret_scanning_push_protection'
{
  "status": "enabled"
}
```
