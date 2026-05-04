# Security

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

Security policy, vulnerability response, audits, and recovery discipline.

| Document                                                         | Purpose                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| [`access-policy.md`](./access-policy.md)                         | Privileged access policy for Founder+1 operations      |
| [`access-matrix.md`](./access-matrix.md)                         | Canonical inventory of privileged surfaces             |
| [`secret-ownership-register.md`](./secret-ownership-register.md) | Ownership, cadence, and blast radius for secret groups |
| [`audit-exceptions.md`](./audit-exceptions.md)                   | Approved exceptions from automated security findings   |
| [`container-scan.md`](./container-scan.md)                       | Trivy scanning for the API image                       |
| [`nightly-audit.md`](./nightly-audit.md)                         | Nightly dependency and audit triage                    |
| [`disaster-recovery.md`](./disaster-recovery.md)                 | Disaster classes, RPO/RTO targets, restore discipline  |
| [`vulnerability-sla.md`](./vulnerability-sla.md)                 | Response and remediation SLA                           |
| [`hardening/`](./hardening/README.md)                            | Living security hardening backlog (per-finding cards)  |

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
