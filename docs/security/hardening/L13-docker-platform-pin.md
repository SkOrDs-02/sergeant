# L13 — `Dockerfile.api` platform pin in CI

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Low                             |
| **Sprint**     | [Sprint 4](./sprint-4.md)       |
| **Owner**      | platform                        |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

## Summary

`Dockerfile.api` does not pin to `--platform=linux/amd64`. A developer on
Apple Silicon (`arm64`) building locally can produce an image that does not
match Railway's `amd64` runtime. The Railway build pipeline rebuilds on push
so the production image is correct, but CI / smoke tests run against
locally-built `arm64` images and may pass or fail differently.

## Recommendation

Add a CI step that builds with explicit `--platform=linux/amd64` and
publishes the resulting digest as a check.

## Correction points

- `.github/workflows/ci.yml` — `docker buildx build --platform
linux/amd64 -f Dockerfile.api .`.
- `docs/security/container-scan.md` — note the platform invariant.

## Verification

- **CI:** the platform-pinned build job succeeds and the image is scanned
  by Trivy under the same digest as production.

## Cross-references

- [`../container-scan.md`](../container-scan.md)
