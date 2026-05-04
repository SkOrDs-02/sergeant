# I3 — Generate SBOM during container build

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Phase 1 implemented (workspace-level SBOM on release)

| Field          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| **Severity**   | Informational / hardening                                    |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                    |
| **Owner**      | platform                                                     |
| **Effort**     | 0.5 person-day                                               |
| **Status**     | Phase 1 (workspace SBOM) live; container-SBOM lишається open |
| **Discovered** | 2026-05-03 deep security review                              |

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

## Implementation status

- **Phase 1 (DONE — initiative 0008 Phase 4):** workspace-level SBOM
  через `.github/workflows/release-sbom.yml`. Тригериться на published
  release / pushed tag `v*.*.*` / manual dispatch; видає одночасно
  SPDX-JSON + CycloneDX-JSON через `anchore/sbom-action` (Syft під
  капотом). SBOM описує lockfile-стан тегу — кожна release-версія має
  reproducible artefact для CVE-correlation.
- **Phase 2 (Open):** container-level SBOM, коли репо отримає
  Dockerfile-based build pipeline. Поки apps деплояться без containers
  (Vercel + Railway buildpacks), workspace-SBOM покриває 100% deps; перехід
  на container-SBOM буде опційно через `docker buildx --sbom=true` додатковим
  кроком у тому самому workflow.
- **Phase 3 (Open, optional):** sigstore signing release artifacts
  (`cosign attest --predicate sbom.spdx.json --type spdxjson`).

## Correction points

- `.github/workflows/release-sbom.yml` — workflow живе тут, генерує
  SBOM на release-published / git-tag-push / workflow_dispatch.
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
