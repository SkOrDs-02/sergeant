# I3 — Generate SBOM during container build

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Phase 1 + Phase 3 implemented (workspace-level SBOM + SLSA L1 build-provenance attestation on release)

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Severity**   | Informational / hardening                                                    |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                                    |
| **Owner**      | platform                                                                     |
| **Effort**     | 0.5 person-day                                                               |
| **Status**     | Phase 1 + 3 live (workspace SBOM + SLSA L1 attest); Phase 2 (container) open |
| **Discovered** | 2026-05-03 deep security review                                              |

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
- **Phase 3 (DONE — PR-45 / pr-plan-2026-05 §Security row #45):** sigstore-signed
  SLSA Build Provenance v1.0 attestation для кожного SBOM-файлу через
  `actions/attest-build-provenance@v2.4.0`. Workflow вже мав `id-token: write`
  під коментарем «на майбутнє»; PR-45 додав `attestations: write` і власне
  attest-step між `Summarize SBOM` і `Upload SBOM artifacts`. Attestation-bundle
  (in-toto) пишеться у GitHub Attestations API і прив'язаний до repo. Перевірка
  після релізу:

  ```sh
  gh attestation verify sergeant-vX.Y.Z.spdx.json --repo Skords-01/Sergeant
  gh attestation verify sergeant-vX.Y.Z.cdx.json  --repo Skords-01/Sergeant
  ```

  SLSA Level vs L2/L3: L1 = «documented + automated build provenance», що `actions/
attest-build-provenance` дає out-of-box (predicate `https://slsa.dev/provenance/v1`,
  signed by Sigstore short-lived OIDC cert). L2/L3 потребують SLSA-3-generic
  generator workflow + reusable provenance flow — окремий PR коли з'явиться need.

## Correction points

- `.github/workflows/release-sbom.yml` — workflow живе тут, генерує
  SBOM на release-published / git-tag-push / workflow_dispatch.
- `docs/security/container-scan.md` — link to the SBOM artifact location.
- `docs/security/audit-exceptions.md` — note any policy exceptions
  granted while integrating sigstore.

## Verification

- **CI:** every release publishes non-empty `sergeant-vX.Y.Z.spdx.json` +
  `sergeant-vX.Y.Z.cdx.json` artefacts AND a SLSA L1 build-provenance
  attestation through GitHub Attestations API (visible at
  `https://github.com/Skords-01/Sergeant/attestations`).
- **Manual:** download the SBOM, run `trivy sbom sergeant-vX.Y.Z.spdx.json`
  to cross-validate against the latest CVE feed.
- **Attestation:** `gh attestation verify sergeant-vX.Y.Z.spdx.json
--repo Skords-01/Sergeant` (asserts the SBOM file came from this repo's
  `release-sbom.yml` workflow run, signed by Sigstore — required for
  «SLSA L1» property at audit time).

## Cross-references

- [`../container-scan.md`](../container-scan.md)
- [`./I1-codeql-workflow.md`](./I1-codeql-workflow.md)
