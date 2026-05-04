# I3 — Generate SBOM during container build

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Informational / hardening       |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.5 person-day                  |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

A Software Bill of Materials (SBOM) lists every package included in a
container image. With an SBOM artifact attached to each release, the
project can quickly answer "are we affected by CVE-X" without running a
fresh scan, and customers / auditors can request the SBOM for compliance
purposes.

## Recommendation

- Use `docker buildx build --sbom=true` (or `syft` / `trivy sbom`) during
  the CI image build.
- Upload the resulting `SBOM.spdx.json` (and / or `SBOM.cdx.json`) to the
  GitHub Release assets.
- Optional: attest the SBOM with cosign / sigstore.

## Correction points

- `.github/workflows/deploy-api.yml` — add SBOM generation + upload
  steps.
- `docs/security/container-scan.md` — link to the SBOM artifact location.
- `docs/security/audit-exceptions.md` — note any policy exceptions
  granted while integrating sigstore.

## Verification

- **CI:** every container release publishes a non-empty
  `SBOM.spdx.json`.
- **Manual:** download the SBOM, run `trivy sbom SBOM.spdx.json` to
  cross-validate against the latest CVE feed.

## Cross-references

- [`../container-scan.md`](../container-scan.md)
- [`./I1-codeql-workflow.md`](./I1-codeql-workflow.md)
