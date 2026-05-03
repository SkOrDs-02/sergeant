# H2 — Немає Dependabot / Renovate (відсутність авто-оновлень залежностей)

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Open

| Field              | Value                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High** (CVSS 7.0 — Supply-chain MTTR window)                                                              |
| **Sprint**         | [Sprint 1](./sprint-1.md)                                                                                   |
| **Owner**          | devops                                                                                                      |
| **Effort**         | 0.5 hour (config) + ~2h на review першого batch-у PR                                                        |
| **Status**         | Open                                                                                                        |
| **Discovered**     | 2026-05-03                                                                                                  |
| **Threat model**   | Supply Chain → Tampering / Information Disclosure                                                           |
| **Affected files** | `.github/dependabot.yml` (відсутній), `.github/workflows/nightly-audit.yml`, `package.json:overrides`        |

## Summary

Репо має сильну **реактивну** CI: `nightly-audit.yml` відкриває GitHub-issue при critical/high у `pnpm audit` + OSV-Scanner. Але немає **автоматичних PR**, які б оновлювали уразливу залежність — людська реакція на issue займає days-to-weeks. За цей час експлойти вже у дикому світі.

`package.json:overrides` уже містить ручні pin-и для `tar`, `xmldom`, `serialize-javascript`, `postcss`, `uuid` — це означає, що команда вже **вручну** робила exception-and-pin для CVE. Кожен такий випадок — час, який автоматизація зекономила б.

## Evidence

```bash
$ ls .github/dependabot.yml .github/renovate.json renovate.json
ls: cannot access '.github/dependabot.yml': No such file or directory
ls: cannot access '.github/renovate.json': No such file or directory
ls: cannot access 'renovate.json': No such file or directory
```

```jsonc
// package.json — manual overrides, що замінюють Dependabot
{
  "overrides": {
    "tar": ">=6.2.1",
    "xmldom": "npm:@xmldom/xmldom@^0.8.10",
    "serialize-javascript": ">=6.0.2",
    "postcss": ">=8.4.31",
    "uuid": ">=14.0.0"  // ← див. L1 (можливо, нерезольвиться)
  }
}
```

```yaml
# .github/workflows/nightly-audit.yml — реактивний, не proactive
on:
  schedule:
    - cron: "0 6 * * *"
# ↑ робить тільки issue, не PR
```

## Impact

1. **MTTR (Mean Time To Remediation) — дні-тижні**. Від CVE-disclosure до merged-fix: nightly-audit (24h) → issue triage (1–3d) → manual `pnpm update <pkg>` + lockfile review (1d) → PR review + merge (1–2d) = total **3–7 днів**.
2. **Transitive deps gap** — `pnpm-lock.yaml` має сотні транзитивних залежностей. CVE на будь-якій з них залишається невідомим до nightly-audit-у.
3. **Team-toil** — ручне `pnpm update` для кожного нового CVE забирає dev-time, який можна автоматизувати.
4. **GitHub Actions / Docker base images** — без оновлень Actions і `node:20-alpine` версій, security-pinned actions старіють і втрачають CVE-fixes.

## Recommendation

Додати `.github/dependabot.yml` з трьома ecosystem-ами (npm, github-actions, docker) і grouping-стратегією для зменшення PR-noise:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    versioning-strategy: "increase"
    groups:
      production-deps:
        dependency-type: "production"
        update-types: ["minor", "patch"]
      dev-deps:
        dependency-type: "development"
      security:
        applies-to: security-updates
    ignore:
      # Manual pins handled via package.json overrides — leave these alone.
      - dependency-name: "uuid"
      - dependency-name: "tar"
      - dependency-name: "xmldom"
      - dependency-name: "serialize-javascript"
      - dependency-name: "postcss"
    labels:
      - "dependencies"
      - "automerge-eligible"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "ci"

  - package-ecosystem: "docker"
    directory: "/"  # uses Dockerfile.api
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "docker"
```

### Auto-merge для security-updates

Додати workflow `.github/workflows/dependabot-automerge.yml`, що auto-merge-ить **patch-only** security-updates після зеленого CI:

```yaml
name: Dependabot Auto-Merge
on: pull_request_target
permissions:
  contents: write
  pull-requests: write
jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: dependabot/fetch-metadata@<sha>
        id: meta
      - if: steps.meta.outputs.update-type == 'version-update:semver-patch' && steps.meta.outputs.dependency-type == 'direct:production' && contains(steps.meta.outputs.package-ecosystem, 'npm')
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Альтернатива: Renovate

Якщо хочемо більш гранулярного контролю (group-by-package, package-rules з prefixed labels):

```jsonc
// renovate.json
{
  "extends": ["config:recommended", ":semanticCommits", ":automergePatch"],
  "schedule": ["before 6am on monday"],
  "labels": ["dependencies"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "matchCurrentVersion": "!/^0/",
      "automerge": true
    }
  ]
}
```

## Correction points

| File                                                | Action                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `.github/dependabot.yml` (new)                      | Створити (повний спек вище).                                                                          |
| `.github/workflows/dependabot-automerge.yml` (new)  | Auto-merge patch-only security-updates після зеленого CI.                                             |
| `.github/labels.yml` (якщо існує)                   | Додати labels: `dependencies`, `security`, `automerge-eligible`, `ci`, `docker`.                       |
| GitHub repo settings → Code security                | Увімкнути `dependabot-alerts` + `secret-scanning` + `secret-scanning-push-protection` (див. [I2](./README.md)). |
| `docs/security/audit-exceptions.md`                 | Перевірити, що manual-pin-и (uuid, tar, postcss, xmldom, serialize-javascript) задокументовані як exceptions. |

## Verification

1. **Static check** — `actionlint .github/dependabot.yml` пройшов.
2. **Manual trigger** — після merge `dependabot.yml` → у Settings → Dependabot → "Last updated" = свіжо.
3. **First batch** — Dependabot створив perший batch PR протягом 7 днів (перевірити Dependabot dashboard).
4. **Auto-merge test** — підготувати штучний PR з patch-only-update → CI зелений → auto-merge спрацював.
5. **Audit-trail** — кожен Dependabot-PR має правильні labels.

## Cross-references

- [docs/security/hardening/sprint-1.md](./sprint-1.md) — sprint context.
- [docs/security/audit-exceptions.md](../audit-exceptions.md) — manual-pin-и (overrides у `package.json`).
- [docs/security/nightly-audit.md](../nightly-audit.md) — реактивна частина (стає supplementary).
- [docs/security/vulnerability-sla.md](../vulnerability-sla.md) — SLA на оновлення.
- [GitHub Docs: Dependabot configuration](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file).
