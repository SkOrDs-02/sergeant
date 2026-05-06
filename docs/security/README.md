# Security

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Active

Security policy, vulnerability response, audits, and recovery discipline.

| Document                                                         | Purpose                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| [`access-policy.md`](./access-policy.md)                         | Privileged access policy for Founder+1 operations      |
| [`access-matrix.md`](./access-matrix.md)                         | Canonical inventory of privileged surfaces             |
| [`secret-ownership-register.md`](./secret-ownership-register.md) | Ownership, cadence, and blast radius for secret groups |
| [`audit-exceptions.md`](./audit-exceptions.md)                   | Approved exceptions from automated security findings   |
| [`container-scan.md`](./container-scan.md)                       | Trivy scanning for the API image                       |
| [`codeql.md`](./codeql.md)                                       | CodeQL SAST taint-flow analysis for TypeScript         |
| [`nightly-audit.md`](./nightly-audit.md)                         | Nightly dependency and audit triage                    |
| [`threat-model.md`](./threat-model.md)                           | STRIDE threat map by surface                           |
| [`disaster-recovery.md`](./disaster-recovery.md)                 | Disaster classes, RPO/RTO targets, restore discipline  |
| [`vulnerability-sla.md`](./vulnerability-sla.md)                 | Response and remediation SLA                           |
| [`hardening/`](./hardening/README.md)                            | Living security hardening backlog (per-finding cards)  |

## Static analysis pipeline

Three complementary scanners run on every PR + on a daily / weekly
schedule. Each tool covers a different layer; together they form the
project's full SAST + SCA coverage.

| Tool                                                       | Layer                                                                               | Trigger                                                                                        | Failure mode                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **CodeQL** ([`codeql.md`](./codeql.md))                    | TypeScript source taint-flow (SQLi, XSS, SSRF, prototype pollution, path traversal) | PR + push to `main` + Mon 06:00 UTC                                                            | Reported in PR Security tab; weekly baseline ≤ 5 alerts |
| **Trivy** ([`container-scan.md`](./container-scan.md))     | Hub API container image (alpine OS + runtime npm tree)                              | PR (touching `Dockerfile.api` / server / shared / lockfile) + push to `main` + daily 04:00 UTC | Hard-fail CI on CRITICAL / HIGH (ignore-unfixed)        |
| **OSV-Scanner** ([`nightly-audit.md`](./nightly-audit.md)) | Lockfile dependencies (SCA across npm + transitive)                                 | nightly 03:00 UTC                                                                              | Triaged in `audit-exceptions.md`; blocker fixes via PR  |

The wider lint pipeline also runs `eslint-plugin-security` (M11) on
`apps/server/**` and `tools/console/**` — that is a per-PR review-time
signal layered on top of CodeQL's deeper taint analysis.

## Secret scanning policy

Repo має **тришаровий** захист від випадкового коміту секретів (defense-in-depth):

1. **GitHub native secret scanning + push protection** (увімкнено через
   Settings → Code security → "Secret scanning" + "Push protection").
   Блокує `git push`, якщо у diff-і є відомі формати секретів (AWS, Stripe,
   Anthropic, Groq, OpenAI, Google API, GitHub PAT тощо). Покриває
   100+ провайдерів зі стандартним патерном.
2. **CI gitleaks** (`secret-scan` job у `.github/workflows/ci.yml`,
   `gitleaks/gitleaks-action` SHA-pinned). Блокує merge у `main`, якщо
   gitleaks знаходить додаткові патерни (наприклад, `BETTER_AUTH_SECRET`,
   `*_TOKEN_ENC_KEY`), яких нема у GitHub native list.
3. **Pre-commit hook** (Husky + `lint-staged`, див. `.husky/pre-commit`) —
   ESLint + Prettier на staged файлах. Покриває локальні merge-конфлікт-маркери
   та accidental console.log; secret-detection — на push-stage (push protection).

**Що робити, якщо `git push` заблокований push-protection-ом:**

- **Якщо секрет потрапив реально** — видали з історії (rebase + force-push на
  feature-branch, або `git filter-repo`), згенеруй новий, ротує у production
  (Railway/Vercel env-vars), запиши у [`secret-ownership-register.md`](./secret-ownership-register.md).
- **Якщо це false-positive** — задокументуй у [`audit-exceptions.md`](./audit-exceptions.md)
  у секції `Secret-scanning false positives`, потім використай GitHub UI
  ("Bypass" + reason) для одноразового override-у. Контрибутор + founder
  отримають email-нотифікацію.
- **Ніколи** не використовуй `--no-verify` для обходу pre-commit-у або
  push-protection-у. Hard rule #7 у [`AGENTS.md`](../../AGENTS.md).

**Що робити, якщо секрет уже у remote (GitHub-native catch не спрацював):**

1. **Ротуй секрет негайно** у production (Railway/Vercel UI) — секрет вважається
   compromised навіть якщо PR не merged.
2. Видали з історії через `git filter-repo --invert-paths --path <file>` або
   `git filter-branch`, force-push.
3. Запиши у [`audit-exceptions.md`](./audit-exceptions.md) як incident
   (`severity: high`) із timeline-ом ротації.
4. Якщо це provider-key, який валідовується GitHub-ом (validity-check feature),
   GitHub автоматично `report` на provider-side.
