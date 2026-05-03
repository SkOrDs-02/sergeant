# 0008 — Platform hardening: rate-limit, health endpoints, Renovate, supply-chain

> **Status:** Proposed
> **Priority:** P1 (Sprint 2)
> **Owner:** `@Skords-01`
> **ETA:** 1 week
> **Sources:** Design Review 2026-05-03 §10 (Security/Platform), §12 (CI/Ops), [`docs/tech-debt/backend.md`](../tech-debt/backend.md)

## TL;DR

`apps/server` має базову rate-limit на auth-flow і health endpoint, але **бракує**:

1. Окремих liveness / readiness / startup probes (зараз один `/health` що завжди відповідає 200, навіть якщо БД лежить).
2. `Retry-After` header у 429-відповідях + per-route rate-limit policy у конфігу (зараз hardcoded у middleware).
3. Renovate / Dependabot (зараз manual `pnpm update` раз на 2 тижні; критичні CVE можуть жити днями).
4. Supply-chain hardening: GitHub Actions всі pin-нуті по SHA вже, але немає `pnpm audit --prod` gate, немає sigstore signing, немає SBOM на release.

Ця ініціатива — **operational baseline**. Невеликі дельти, але підвищують availability і security-posture одразу.

## Чому зараз

- 2026 Q1 був інцидент з повільним стартом (15 сек cold-start) — readiness probe = liveness ⟹ k8s/Render killing pod posttarted, на старті. Окремий startup probe фіксить це разовою конфігурацією.
- Auth-flow атакували brute-force (~ 200 req/sec за 5 хв) — rate-limit спрацював, але без `Retry-After` клієнти retry-ять у тугому циклі. Кращий UX — `Retry-After: 60`.
- За 2026-04 був CVE у `@anthropic-ai/sdk` (medium); ми його взяли на третій день після disclosure. Renovate / Dependabot би в auto-PR за годину.
- Supply-chain: ми вже pin-нули actions по SHA, але **тільки під час** Q4 2025 incident response. Немає policy. `pnpm audit` running-у в CI нема.
- Готуємось до growth (FTUX rollout згідно [`docs/launch/ftux-sprint-plan.md`](../launch/ftux-sprint-plan.md)). Operational baseline треба перед, не після, scale-up.

## Скоуп

**In:**

1. **Health endpoints розкласти на 3:**
   - `/health/liveness` — process alive (200 if event-loop responsive).
   - `/health/readiness` — DB/Redis ping ОК, dependencies здорові (200/503).
   - `/health/startup` — initial migrations/warmup завершено (200/503; `failureThreshold: 30` у k8s).
2. **Rate-limit:**
   - Перенести limit-конфіг у [`apps/server/src/config/rateLimit.ts`](../../apps/server/src/config/) (per-route map).
   - Додати `Retry-After` header у 429.
   - `RateLimit-*` headers (X-RateLimit-Limit / Remaining / Reset) — RFC 6585.
   - Тести: інтеграційний у [`apps/server/src/__tests__/`](../../apps/server/src/__tests__/) — флуд auth-route, перевірити 429 + headers.
3. **Renovate:**
   - `renovate.json` (або `.github/renovate.json5`) з:
     - `extends: ['config:base', 'docker:enableMajor']`
     - `schedule: ['before 6am every weekday']`
     - `automergeType: 'pr'`, `automerge: true` для devDependencies + patches з зеленою CI.
     - `groupedNames` для @anthropic-ai/*, @sentry/*, @opentelemetry/*.
     - `lockFileMaintenance` weekly.
   - Альтернатива — Dependabot (decision у фазі 1 ADR).
4. **Supply-chain:**
   - `.github/workflows/security-audit.yml` з `pnpm audit --prod --audit-level=moderate` (fails CI if any).
   - Додати `permissions: { contents: read }` у workflow definitions.
   - SBOM generation (`syft` або `cyclonedx`) на release (workflow `release-sbom.yml`).
   - **Опт-ін:** sigstore signing release artifacts (опційно, у ADR-decision).

**Out:**

- WAF / Cloudflare configuration changes — це окрема ініціатива.
- Secret scanning policy — вже є GitHub secret scanning.
- Penetration testing — окрема, periodic.
- Зміни Better Auth core — окрема ініціатива.

## План змін

### Фаза 1 — health probes (1 PR)

**PR `feat-server-health-probes`:**

- `apps/server/src/routes/health.ts`:
  ```ts
  router.get('/liveness', (req, res) => res.status(200).json({ ok: true }));
  router.get('/readiness', async (req, res) => {
    const checks = await Promise.allSettled([pgPing(), redisPing()]);
    const ok = checks.every((c) => c.status === 'fulfilled');
    res.status(ok ? 200 : 503).json({ ok, checks });
  });
  router.get('/startup', (req, res) => {
    const ok = appState.initialMigrationsDone && appState.warmupDone;
    res.status(ok ? 200 : 503).json({ ok });
  });
  ```
- В `apps/server/src/index.ts` `appState` lifecycle hooks.
- Старий `/health` → 308 redirect на `/health/liveness` (deprecated 30 днів, потім видалити).
- Render/k8s конфіг (deploy/render.yaml або similar): liveness=`/health/liveness`, readiness=`/health/readiness`, startup=`/health/startup` з `failureThreshold: 30, periodSeconds: 1`.

### Фаза 2 — rate-limit policy refactor (1 PR)

**PR `feat-rate-limit-policy`:**

- `apps/server/src/config/rateLimit.ts`:
  ```ts
  export const RATE_LIMITS: Record<string, { windowMs: number; max: number }> = {
    'POST /auth/sign-in': { windowMs: 60_000, max: 5 },
    'POST /auth/sign-up': { windowMs: 60_000, max: 3 },
    'POST /auth/forgot-password': { windowMs: 600_000, max: 3 },
    'POST /sync/v2/ops': { windowMs: 60_000, max: 600 },
    // ...
  } as const;
  ```
- Middleware читає policy + видає `Retry-After`, `X-RateLimit-*`.
- Інтеграційний тест.

### Фаза 3 — Renovate config (1 PR)

**PR `chore-renovate-config`:**

- `renovate.json5` як описано вище.
- Activate Renovate GitHub App у репо.
- README-замітка у [`docs/ops/renovate.md`](../ops/) — як обробляти Renovate PR-и (auto-merge dev-deps; manual review для major / @anthropic / Better Auth).
- Decision ADR-0043 — Renovate vs Dependabot.

### Фаза 4 — supply-chain audit gate + SBOM (1 PR)

**PR `ci-supply-chain-hardening`:**

- `.github/workflows/security-audit.yml` — `pnpm audit --prod --audit-level=moderate` на PR + nightly.
- `.github/workflows/release-sbom.yml` — `cyclonedx-bom` на release tag, attaches SBOM до GH Release artifacts.
- `permissions: { contents: read }` як baseline у всіх workflows.
- ADR-0044 — sigstore signing decision.

### Фаза 5 — runbook + docs (1 PR)

**PR `docs-platform-hardening-runbook`:**

- [`docs/observability/runbook.md`](../observability/runbook.md) — додати секції:
  - «Як інтерпретувати 429 алерт у Grafana»
  - «Що робити, якщо readiness probe FAIL»
  - «Як обробити Renovate PR із breaking change»
  - «Що таке SBOM і де його шукати на release»
- README у [`docs/ops/`](../ops/) — індекс операційних документів.

## Критерії DONE

- [ ] `/health/liveness`, `/health/readiness`, `/health/startup` працюють і повертають коректні коди.
- [ ] Render/k8s конфіг оновлено на нові probes (`failureThreshold` для startup).
- [ ] Старий `/health` → 308 redirect (буде видалено через 30 днів).
- [ ] Rate-limit policy у `config/rateLimit.ts`, 429-відповіді мають `Retry-After`.
- [ ] Renovate / Dependabot активний; перші 5 PR-ів пройшли (auto-merge або manual).
- [ ] `pnpm audit` gate у CI зеленіє; нема відомих moderate/high CVE.
- [ ] SBOM генерується на release (artifact видно у GH Release).
- [ ] ADR-0043 (Renovate vs Dependabot) і ADR-0044 (sigstore) змерджено.
- [ ] Runbook оновлено з новими секціями.

## Ризики та митиґація

| Ризик                                                          | Мітигація                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Readiness probe виявляє слабке місце (DB ping fails) → flapping | Cache `pgPing` result 5 секунд (debounce). Алерт на «3 поспіль readiness=503» замість per-fail.                  |
| Renovate флудить PR-ами і втомлює maintainer                   | `prHourlyLimit: 4`, `prConcurrentLimit: 10`, групи (`@anthropic-ai/*`). Auto-merge на dev-deps + patches знижує шум. |
| `pnpm audit` фейлить на transitive CVE без фіксу                 | `--audit-level=moderate` (не на low). Allow-list через `pnpm.overrides` для точкових false-positives.            |
| `Retry-After` header змінює клієнтську поведінку                | Web/мобайл клієнти у [`apps/web/src/shared/lib/api/queryClient.ts`](../../apps/web/src/shared/lib/api/queryClient.ts) повинні parse-ити `Retry-After`. Координація PR. |
| SBOM contains paths/secrets                                    | `cyclonedx-bom` з `--exclude-dev`, `--exclude-paths`. Reviewer перевіряє SBOM перед публікацією.                 |
| Sigstore release-signing збільшує release time                 | Опт-ін у ADR-0044; default off, on тільки для prod tags `v*.*.*`.                                                |

## Метрики

| Метрика                                                  | Baseline (2026-05-03) | Target (post-rollout)        |
| -------------------------------------------------------- | --------------------- | ---------------------------- |
| MTT-detect dependency CVE                                | days                  | hours (Renovate auto-PR)     |
| Cold-start kill rate (post-deploy)                       | 1-2/тиждень           | 0/тиждень                    |
| 429 Retry-After header coverage                          | 0%                    | 100% on rate-limited routes  |
| `pnpm audit` moderate+ findings                          | ?                     | 0 (gated)                    |
| SBOM published on release                                | no                    | yes                          |
| Mean time-to-merge devDep update                         | 2 weeks (manual)      | < 24h (Renovate)             |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/server/src/middleware/**`, `.github/workflows/**`, або `renovate.json5` потребує review від CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §10, §12
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — записи «no Retry-After», «no Renovate», «single /health»
- [Renovate docs](https://docs.renovatebot.com/)
- [Dependabot docs](https://docs.github.com/en/code-security/dependabot)
- [k8s probes guide](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [CycloneDX SBOM](https://cyclonedx.org/)
- [sigstore](https://www.sigstore.dev/)
- [`apps/server/src/routes/health.ts`](../../apps/server/src/routes/health.ts)
- [`apps/server/src/middleware/`](../../apps/server/src/middleware/)
- Координується з ініціативою 0004 (server observability) — алерти Grafana використовують ці metric labels.

## Outcome

_Заповнюється після завершення._
