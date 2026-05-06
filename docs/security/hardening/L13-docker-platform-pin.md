# L13 — `Dockerfile.api` platform pin in CI

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Closed (2026-05-06)

| Field          | Value                                                                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | Low                                                                                                                                                                                                                                                                    |
| **Sprint**     | [Sprint 4](./sprint-4.md)                                                                                                                                                                                                                                              |
| **Owner**      | platform                                                                                                                                                                                                                                                               |
| **Effort**     | 0.25 person-day                                                                                                                                                                                                                                                        |
| **Status**     | Closed (2026-05-06) — `Dockerfile.api` `FROM` lines pinned to `--platform=linux/amd64`; `.github/workflows/container-scan.yml` build step pins `platforms: linux/amd64` and a `docker image inspect` guard fails the job if the loaded image arch is not `linux/amd64` |
| **Discovered** | 2026-05-03 deep security review                                                                                                                                                                                                                                        |

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

- `Dockerfile.api` — both `FROM` lines (builder + runtime stages) declare
  `--platform=linux/amd64`. A non-amd64 host running
  `docker build -f Dockerfile.api .` (or a `docker buildx build`
  without `--platform`) now produces an `amd64` image instead of
  silently emitting the host arch.
- `.github/workflows/container-scan.yml` — the
  `docker/build-push-action` step pins `platforms: linux/amd64`, and a
  follow-up `docker image inspect hub-api:scan` step fails the job if
  the loaded image is not `linux/amd64`. This means Trivy always scans
  the same arch that Railway runs in production, and a future
  contributor cannot silently widen `platforms` (e.g. adding
  `linux/arm64` for a multi-arch publish) without also updating the
  guard.

## Closure (2026-05-06)

Dockerfile.api intentionally pins on the `FROM` line rather than
relying solely on the workflow `platforms` field because:

- `ci.yml` does not build the API image (only `container-scan.yml`
  does). A developer running `docker build -f Dockerfile.api .`
  locally on Apple Silicon previously got an arm64 image with no CI
  signal; the `FROM` pin closes that gap regardless of the build
  context (CI, dev laptop, Devin VM, etc.).
- The Trivy SARIF in GitHub Code Scanning is therefore always tagged
  against the same arch that Railway runs, so trends are comparable
  across runs.

## Verification

- **CI:** the platform-pinned build job succeeds and the
  `Confirm scanned image is linux/amd64` step prints
  `hub-api:scan platform = linux/amd64` before Trivy runs.
- **Local repro:** `docker buildx build --platform linux/amd64 -f Dockerfile.api -t hub-api:scan . && docker image inspect hub-api:scan --format '{{.Os}}/{{.Architecture}}'`
  prints `linux/amd64` on both amd64 and arm64 hosts.

## Cross-references

- [`../container-scan.md`](../container-scan.md)
