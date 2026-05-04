# I1 — Add CodeQL SAST workflow

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

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

## Cross-references

- [`./M11-eslint-plugin-security.md`](./M11-eslint-plugin-security.md)
- [`./I2-secret-scanning-push-protection.md`](./I2-secret-scanning-push-protection.md)
