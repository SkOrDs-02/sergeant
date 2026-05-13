# PR-37: Postgres image SHA-pinning

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed — merged [#2308](https://github.com/Skords-01/Sergeant/pull/2308) (commit `348f5773`). CI workflows (`ci.yml:410`, `extended-e2e.yml:57`, `visual-regression.yml:40`, `db-backup-verify.yml:34`) already pin `pgvector/pgvector:pg16@sha256:7d400e34…` (landed earlier under M21 / supply-chain hardening). Цей PR закрив останнє drift-місце — `docker-compose.yml` (local dev) — і додав Renovate `pinDigests` rule + setup runbook.

|                    |                                                                             |
| ------------------ | --------------------------------------------------------------------------- |
| **Severity**       | Low (L10)                                                                   |
| **Linked finding** | L10 (`00-overview.md`)                                                      |
| **Owner**          | @Skords-01                                                                  |
| **Effort**         | 0.5 дня                                                                     |
| **Risk**           | Low (compose / CI-only; сам SQL workload identical)                         |
| **Touches**        | `docker-compose.yml`, `docker-compose.test.yml`, CI Postgres service config |
| **Trigger**        | next time pgvector minor-update пропускає silent breaking change            |

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
  packageRules: [
    {
      matchPackagePatterns: ["^pgvector/"],
      pinDigests: true,
      schedule: "monthly",
    },
  ],
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

- [x] `docker-compose.yml` SHA-pinned to `pgvector/pgvector:pg16@sha256:7d400e34…`. (`docker-compose.test.yml` у репо відсутній — локальний dev використовує єдиний `docker-compose.yml`; CI підводить свої services безпосередньо у workflow-ах.)
- [x] CI workflow Postgres service SHA-pinned (`ci.yml:410`, `extended-e2e.yml:57`, `visual-regression.yml:40`, `db-backup-verify.yml:34` — 4 workflow-и вже мають digest pin).
- [x] `renovate.json` має `pgvector pinDigests` rule (місячний schedule, `automerge: false`, group `pgvector`, label `infra-pin`).
- [x] `docs/development/local-postgres-setup.md` written («Why SHA-pin», «Bumping the SHA» auto/manual, troubleshooting, cross-links).
- [~] Smoke test: Не виконано локально в цьому PR (Devin VM без docker-host для service-image pull-у) — SHA ідентичний до того, що CI вже місяцями регулярно запускає, тому регресії не очікується.

## Тести

- Smoke: integration tests проходять на pinned SHA.
- Renovate dry-run: PR generated на newer SHA → pass CI.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                           | Mitigation                                                 |
| ---------------------------------------------- | ---------------------------------------------------------- |
| SHA-pin lock-ить нас на CVE-vulnerable version | Renovate monthly schedule + manual security advisory check |
| Renovate auto-PR ламає migration tests         | Renovate PR triggers full CI; merge тільки manual-approve  |

## Touchpoints (file:line)

- `docker-compose.yml:25` — `image:` line (цей PR).
- `.github/workflows/ci.yml:410` — Postgres service `image:` (already pinned).
- `.github/workflows/extended-e2e.yml:57` — already pinned.
- `.github/workflows/visual-regression.yml:40` — already pinned.
- `.github/workflows/db-backup-verify.yml:34` — already pinned.
- `renovate.json:148-157` — `pgvector pinDigests` rule (цей PR).
- `docs/development/local-postgres-setup.md` — new (цей PR).
- `docker-compose.test.yml` — відсутній в репо (out of scope; CI workflow-и мають services безпосередньо).
- `.github/workflows/contract-tests.yml` (PR-23) — відсутній (PR-23 ще Planned, пін буде додано в тому PR-і).

## Refs

- [Docker image digests vs tags](https://docs.docker.com/registry/spec/api/#content-digests)
- [Renovate `pinDigests`](https://docs.renovatebot.com/configuration-options/#pindigests)
