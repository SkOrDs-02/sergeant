# PR-37: Postgres image SHA-pinning

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| **Severity**       | Low (L10)                                                                    |
| **Linked finding** | L10 (`00-overview.md`)                                                       |
| **Owner**          | TBD (sponsor: @Skords-01)                                                    |
| **Effort**         | 0.5 дня                                                                      |
| **Risk**           | Low (compose / CI-only; сам SQL workload identical)                          |
| **Touches**        | `docker-compose.yml`, `docker-compose.test.yml`, CI Postgres service config  |
| **Trigger**        | next time pgvector minor-update пропускає silent breaking change             |

## Контекст

Repo використовує `pgvector/pgvector:pg16` як Postgres+pgvector image у docker-compose, CI (Testcontainers), і local dev. Тег `pg16` — **floating tag**, оновлюється upstream без notice.

Risks:

1. Silent vector-extension behavior change → tests pass-ять локально, fail-ять у CI два дні через пізніше.
2. Reproducibility — bug-report з 1-місячної давності неможливо exact-reproduce.
3. CVE-trap — broken upstream version може бути auto-pulled.

## Scope

### 1. SHA pin

```yaml
# docker-compose.yml (current)
services:
  postgres:
    image: pgvector/pgvector:pg16
# →
services:
  postgres:
    image: pgvector/pgvector@sha256:<digest>  # pg16 as of 2026-05-07
```

Digest fetched через `docker pull pgvector/pgvector:pg16 && docker inspect`.

### 2. Renovate hint

```json5
// renovate.json5
{
  "packageRules": [{
    "matchPackagePatterns": ["^pgvector/"],
    "pinDigests": true,
    "schedule": "monthly"
  }]
}
```

Renovate auto-bump-итиме SHA monthly з changelog у PR.

### 3. CI integration

`.github/workflows/*.yml` — wherever pg-image referenced, replace with SHA-version.

### 4. Documentation

`docs/development/local-postgres-setup.md`:

- Why SHA-pinned.
- How to bump SHA (manual OR Renovate).
- Schema-migration test після bump-у.

## Out of scope

- Self-hosted pgvector build — backlog.
- Switch на Neon / Supabase — окремий ADR (production hosting).

## Acceptance criteria (DoD)

- [ ] `docker-compose.yml` + `docker-compose.test.yml` SHA-pinned.
- [ ] CI workflow Postgres service SHA-pinned.
- [ ] `renovate.json5` має pgvector rule (якщо Renovate існує).
- [ ] `docs/development/local-postgres-setup.md` updated.
- [ ] Smoke test: `docker-compose up && pnpm test` все ще зелений.

## Тести

- Smoke: integration tests проходять на pinned SHA.
- Renovate dry-run: PR generated на newer SHA → pass CI.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                                  | Mitigation                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| SHA-pin lock-ить нас на CVE-vulnerable version                        | Renovate monthly schedule + manual security advisory check          |
| Renovate auto-PR ламає migration tests                                | Renovate PR triggers full CI; merge тільки manual-approve            |

## Touchpoints (file:line)

- `docker-compose.yml` — `image:` lines
- `docker-compose.test.yml` (якщо існує)
- `.github/workflows/ci.yml` — Postgres service block
- `.github/workflows/contract-tests.yml` (PR-23) — те саме
- `renovate.json5` — pgvector pin rule
- `docs/development/local-postgres-setup.md` — new

## Refs

- [Docker image digests vs tags](https://docs.docker.com/registry/spec/api/#content-digests)
- [Renovate `pinDigests`](https://docs.renovatebot.com/configuration-options/#pindigests)
