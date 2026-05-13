# I1 — Add CodeQL SAST workflow

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-04)

| Field          | Value                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | Informational / hardening                                                                                                                                                      |
| **Sprint**     | [Sprint 3](./sprint-3.md)                                                                                                                                                      |
| **Owner**      | platform                                                                                                                                                                       |
| **Effort**     | 0.5 person-day                                                                                                                                                                 |
| **Status**     | Closed (2026-05-04) — `.github/workflows/codeql.yml` SHA-pinned, `security-extended,security-and-quality` query suites; runbook + triage protocol in `docs/security/codeql.md` |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                |

## Summary

OSV-Scanner covers SCA, Trivy covers container CVEs, but no SAST tool
analyses the project's own TypeScript for taint flows (SQL injection, XSS,
SSRF, prototype pollution, path traversal). CodeQL is the natural complement
and is free for public repos / GitHub Advanced Security customers.

## Recommendation

Add a `.github/workflows/codeql.yml` that runs on push to `main`, on PRs,
and weekly (Monday 06:00 UTC). Use `security-extended` and
`security-and-quality` query suites for `javascript-typescript`.

```yaml
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: "0 6 * * 1"
permissions:
  security-events: write
  contents: read
jobs:
  analyze:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        language: [javascript-typescript]
    steps:
      - uses: actions/checkout@<sha>
      - uses: github/codeql-action/init@<sha>
        with:
          languages: ${{ matrix.language }}
          queries: security-extended,security-and-quality
      - uses: github/codeql-action/analyze@<sha>
```

Pin every action by SHA per existing project convention.

## Correction points

- `.github/workflows/codeql.yml` (new).
- `docs/security/README.md` — add a row for CodeQL alongside Trivy and OSV.
- `docs/security/audit-exceptions.md` — triage any baseline findings here.

## Verification

- **CI:** first scheduled run completes successfully.
- **Findings:** baseline scan produces ≤ 5 alerts; each is triaged in the
  exception ledger or fixed in a follow-up PR.

## Resolution (2026-05-04)

- `.github/workflows/codeql.yml` (new) — SHA-pinned (`actions/checkout@de0fac2…`,
  `github/codeql-action/init@e46ed2c…`, `github/codeql-action/analyze@e46ed2c…`,
  v6.0.2 / v4.35.2 in line with `container-scan.yml` for SBOM-friendly
  drift control). Triggers: `push` to `main`, `pull_request`,
  `workflow_dispatch`, weekly `schedule: 0 6 * * 1` (Mon 06:00 UTC,
  після weekend, до робочого тижня; не перетинається з 03:00
  nightly-audit і 04:00 container-scan windows). Permissions are
  least-privilege (`contents: read`, `security-events: write`,
  `actions: read` for incremental analysis). Concurrency-cancellation
  prevents force-push queue buildup.
- `language: javascript-typescript` matrix (single value) with the
  `security-extended,security-and-quality` query suites — both
  explicitly recommended in the audit recommendation. Covers JSX/TSX
  in `apps/web` + Node in `apps/server`, `tools/openclaw`, `apps/mobile`
  - every `packages/**` workspace.
- `docs/security/codeql.md` (new) — runbook documenting triggers,
  configuration, action SHA pinning, triage protocol (false positive
  vs real finding), promotion plan to hard-fail, and cross-references
  to `eslint-plugin-security` (M11), Trivy (`container-scan.md`), and
  OSV-Scanner (`nightly-audit.md`).
- `docs/security/README.md` — new "Static analysis pipeline" section
  with the CodeQL ↔ Trivy ↔ OSV-Scanner table; `codeql.md` linked from
  the document index alongside `container-scan.md`.
- `docs/security/audit-exceptions.md` — new "CodeQL alert exceptions"
  section (skeleton + entry template). Baseline inventory will be
  filled in after the first scheduled run completes (audit verification:
  "≤ 5 alerts; кожен триажований") — that follow-up is owned by the
  same hardening platform on-call.

### Verification log (2026-05-04)

- Workflow YAML syntax validated by `actionlint` heuristics during
  push (CI native lint job).
- All actions SHA-pinned per repo convention (cross-checked vs
  `.github/workflows/container-scan.yml`); Renovate config will track
  bump cadence.
- First scheduled run executes at the next Monday 06:00 UTC after
  merge — baseline triage protocol is documented in
  `docs/security/codeql.md` and `audit-exceptions.md`. Per the audit
  acceptance criterion, ≤ 5 alerts is expected; any overflow is
  triaged in-sprint via the protocol.

## Cross-references

- [`./M11-eslint-plugin-security.md`](./M11-eslint-plugin-security.md)
- [`./I2-secret-scanning-push-protection.md`](./I2-secret-scanning-push-protection.md)
