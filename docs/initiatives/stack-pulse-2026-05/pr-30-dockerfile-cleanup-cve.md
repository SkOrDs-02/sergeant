# PR-30: Dockerfile post-install cleanup CVE-shrink fragility

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Shipped — PR pending

|                    |                                                                  |
| ------------------ | ---------------------------------------------------------------- |
| **Severity**       | Low (L3)                                                         |
| **Linked finding** | L3 (`00-overview.md`)                                            |
| **Owner**          | TBD (sponsor: @Skords-01)                                        |
| **Effort**         | 1 день                                                           |
| **Risk**           | Low (Docker-only — runtime image build pipeline)                 |
| **Touches**        | `Dockerfile.api` (154 lines), `Dockerfile.console` (97 lines)    |
| **Trigger**        | next dependency upgrade що змінює `node_modules` cleanup pattern |

## Контекст

`Dockerfile.api` (154 рядків) і `Dockerfile.console` (97 рядків) використовують post-install cleanup для shrink-у image розміру + CVE-видалення untrusted bin-arities:

```dockerfile
# (приклад типового pattern-у)
RUN pnpm install --prod \
  && find /app/node_modules -name "*.md" -delete \
  && find /app/node_modules -name "*.test.*" -delete \
  && find /app/node_modules -name "test" -type d -exec rm -rf {} + \
  && rm -rf /app/node_modules/**/__tests__
```

Issues:

1. **Fragile** — package може реально потребувати `*.md` runtime (`prismjs/themes`).
2. **Maintenance burden** — кожна нова cleanup-rule перевіряється manually.
3. **CVE-shrink не explicit** — list of removed CVE-paths нема в коді.
4. **Inconsistent** — `Dockerfile.api` має іншу cleanup-rule list від `Dockerfile.console`.

## Scope

### 1. Multi-stage build

```dockerfile
# Build stage — full dev deps
FROM node:20-alpine AS builder
RUN corepack enable
COPY ../../package.json ../../pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime stage — only prod deps + dist
FROM gcr.io/distroless/nodejs20-debian12
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules  # prod-only after pnpm prune
WORKDIR /app
CMD ["node", "dist/index.js"]
```

Distroless eliminates ~90% потенційних CVE-paths без custom `find`-cleanup.

### 2. Shared base layer

`docker/base.Dockerfile` — спільний для api + console. Single SHA-pinned `node:20-alpine` reference.

### 3. CVE-scan automation

Trivy в CI (`.github/workflows/docker-cve-scan.yml`):

```yaml
- uses: aquasecurity/trivy-action@<sha>
  with:
    image-ref: "ghcr.io/skords-01/sergeant-api:${{ github.sha }}"
    severity: "HIGH,CRITICAL"
    exit-code: "1"
```

### 4. Documentation

`docs/ops/docker-image-policy.md`:

- Distroless rationale.
- CVE budget — block on HIGH/CRITICAL у new layer.
- Shared base layer policy.

## Out of scope

- Перехід на nix-based reproducible builds — backlog.
- Switch до Bun runtime — separate ADR.

## Acceptance criteria (DoD)

- [x] `Dockerfile.api` + `Dockerfile.console` рефакторені на multi-stage distroless (`builder` + `deps` + `runtime` (`gcr.io/distroless/nodejs20-debian12:nonroot`)).
- [ ] `docker/base.Dockerfile` shared layer — відкладено як follow-up PR (поточні файли divergent enough — console не потребує db-schema білду, api не потребує tsc-on-build; вигода від поблихи введення базової layer-и не переважує maintenance cost).
- [x] Trivy scan вже є у [`.github/workflows/container-scan.yml`](../../../.github/workflows/container-scan.yml) для Dockerfile.api; розширення на Dockerfile.console — follow-up PR.
- [~] Image size виміряно: api 750 MB, console 166 MB (cold build, без buildx layer cache). Baseline pre-PR-30 не був знятий (вроді без referencing artifact-у CI); -30% target не верифіковано. Distroless runtime base сам по собі ≈165 MB проти alpine ≈50 MB, тому byte-виграш неочевидний — основний win в attack-surface (no shell / no package-managers).
- [x] Smoke-test виконано локально: `docker run` api + console бутсять до env-validation step як expected. Migrations dir resolve-иться всередині distroless layer-у (verified: `dist-server/migrations/001_noop.sql` присутній).
- [x] [`docs/ops/docker-image-policy.md`](../../ops/docker-image-policy.md) написано (TL;DR + stage map + healthcheck rationale + Trivy gate + rollout + backout).
- [x] `.dockerignore` виправлено (`node_modules` → `**/node_modules`) — без цього nested host `tools/console/node_modules/dotenv/` потрапляв у build context і колізіював зі pnpm symlinks у container-i.

## Тести

- CI: Trivy scan green (no HIGH/CRITICAL).
- Manual: `docker build -f Dockerfile.api .` succeeds.
- Smoke: `docker-compose up` boots full stack.

## Rollout

1. PR-1: distroless + multi-stage.
2. PR-2: Trivy CI integration.
3. Production deploy через Railway image-update — staged rollout.

## Risks & mitigations

| Risk                                                         | Mitigation                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Distroless missing libstdc++ для native deps (sharp, bcrypt) | `:nodejs20-debian12` має glibc; verify build-time через CI smoke-test    |
| Multi-stage build slower вперше (no cached layers)           | Buildx cache mount у CI; first build slower, subsequent — incremental    |
| Trivy false-positive на known-good vendor packages           | `.trivyignore` з explicitly-justified exceptions + audit-trail у comment |

## Touchpoints (file:line)

- `Dockerfile.api:1-154` — повний rewrite
- `Dockerfile.console:1-97` — повний rewrite
- `docker/base.Dockerfile` — new
- `.github/workflows/docker-cve-scan.yml` — new
- `docs/ops/docker-image-policy.md` — new

## Refs

- [Distroless images](https://github.com/GoogleContainerTools/distroless)
- [Trivy GitHub Action](https://github.com/aquasecurity/trivy-action)
- [pnpm prune for production](https://pnpm.io/cli/prune)
