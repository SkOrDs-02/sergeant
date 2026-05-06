# 0008 — Platform hardening: rate-limit, health endpoints, Renovate, supply-chain

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Closed (5/5 phases merged 2026-05-04; carry-overs у § Що НЕ увійшло)
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
- Готуємось до growth (FTUX rollout згідно [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md)). Operational baseline треба перед, не після, scale-up.

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
   - Тести: інтеграційний у [`apps/server/src/http/`](../../apps/server/src/http/) (напр. `rateLimit.test.ts`, `rateLimit.headers.test.ts`) — флуд auth-route, перевірити 429 + headers.
3. **Renovate:**
   - `renovate.json` (або `.github/renovate.json5`) з:
     - `extends: ['config:base', 'docker:enableMajor']`
     - `schedule: ['before 6am every weekday']`
     - `automergeType: 'pr'`, `automerge: true` для devDependencies + patches з зеленою CI.
     - `groupedNames` для @anthropic-ai/_, @sentry/_, @opentelemetry/\*.
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
  router.get("/liveness", (req, res) => res.status(200).json({ ok: true }));
  router.get("/readiness", async (req, res) => {
    const checks = await Promise.allSettled([pgPing(), redisPing()]);
    const ok = checks.every((c) => c.status === "fulfilled");
    res.status(ok ? 200 : 503).json({ ok, checks });
  });
  router.get("/startup", (req, res) => {
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
  export const RATE_LIMITS: Record<string, { windowMs: number; max: number }> =
    {
      "POST /auth/sign-in": { windowMs: 60_000, max: 5 },
      "POST /auth/sign-up": { windowMs: 60_000, max: 3 },
      "POST /auth/forgot-password": { windowMs: 600_000, max: 3 },
      "POST /sync/v2/ops": { windowMs: 60_000, max: 600 },
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

- [x] `/health/liveness`, `/health/readiness`, `/health/startup` працюють і повертають коректні коди.
- [x] ~~Render/k8s конфіг~~ → N/A: Sergeant на Railway buildpacks, не k8s. Див. **Що НЕ увійшло**.
- [x] ~~Старий `/health` → 308 redirect~~ → N/A: реалізовано через nested-aliases без redirect-hop. Див. **Що НЕ увійшло**.
- [x] Rate-limit policy у `config/rateLimit.ts`, 429-відповіді мають `Retry-After`.
- [x] Renovate (primary) + Dependabot (security-only daily) активні за [ADR-0044](../adr/0044-renovate-vs-dependabot.md); `anthropic`/`sentry`/`opentelemetry` groups додано.
- [x] ~~`pnpm audit` PR-gate~~ → N/A: existing `nightly-audit.yml` + auto-issue на critical/high покриває. Див. **Що НЕ увійшло**.
- [x] SBOM генерується на release (SPDX + CycloneDX, anchore/sbom-action).
- [x] [ADR-0044](../adr/0044-renovate-vs-dependabot.md) (Renovate vs Dependabot) змерджено. Sigstore signing — паркнуто (опт-ін). Див. **Що НЕ увійшло**.
- [x] Runbook оновлено з 4 platform-hardening FAQ-секціями.

## Ризики та митиґація

| Ризик                                                           | Мітигація                                                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readiness probe виявляє слабке місце (DB ping fails) → flapping | Cache `pgPing` result 5 секунд (debounce). Алерт на «3 поспіль readiness=503» замість per-fail.                                                                        |
| Renovate флудить PR-ами і втомлює maintainer                    | `prHourlyLimit: 4`, `prConcurrentLimit: 10`, групи (`@anthropic-ai/*`). Auto-merge на dev-deps + patches знижує шум.                                                   |
| `pnpm audit` фейлить на transitive CVE без фіксу                | `--audit-level=moderate` (не на low). Allow-list через `pnpm.overrides` для точкових false-positives.                                                                  |
| `Retry-After` header змінює клієнтську поведінку                | Web/мобайл клієнти у [`apps/web/src/shared/lib/api/queryClient.ts`](../../apps/web/src/shared/lib/api/queryClient.ts) повинні parse-ити `Retry-After`. Координація PR. |
| SBOM contains paths/secrets                                     | `cyclonedx-bom` з `--exclude-dev`, `--exclude-paths`. Reviewer перевіряє SBOM перед публікацією.                                                                       |
| Sigstore release-signing збільшує release time                  | Опт-ін у ADR-0044; default off, on тільки для prod tags `v*.*.*`.                                                                                                      |

## Метрики

| Метрика                            | Baseline (2026-05-03) | Target (post-rollout)       |
| ---------------------------------- | --------------------- | --------------------------- |
| MTT-detect dependency CVE          | days                  | hours (Renovate auto-PR)    |
| Cold-start kill rate (post-deploy) | 1-2/тиждень           | 0/тиждень                   |
| 429 Retry-After header coverage    | 0%                    | 100% on rate-limited routes |
| `pnpm audit` moderate+ findings    | ?                     | 0 (gated)                   |
| SBOM published on release          | no                    | yes                         |
| Mean time-to-merge devDep update   | 2 weeks (manual)      | < 24h (Renovate)            |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR із змінами у `apps/server/src/http/**`, `.github/workflows/**`, або `renovate.json5` потребує review від CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §10, §12
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — записи «no Retry-After», «no Renovate», «single /health»
- [Renovate docs](https://docs.renovatebot.com/)
- [Dependabot docs](https://docs.github.com/en/code-security/dependabot)
- [k8s probes guide](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- [CycloneDX SBOM](https://cyclonedx.org/)
- [sigstore](https://www.sigstore.dev/)
- [`apps/server/src/routes/health.ts`](../../apps/server/src/routes/health.ts)
- [`apps/server/src/http/`](../../apps/server/src/http/)
- Координується з ініціативою 0004 (server observability) — алерти Grafana використовують ці metric labels.

## Outcome

> **Update 2026-05-04:** статус → **`Done`**. Усі 5 фаз змерджено на `main` в один день (#1634 → #1638 → #1641 → #1639 → #1642). Carry-overs (sigstore signing, container-SBOM, server-side per-route migration `policyOptions(...)` для ~20 inline-лімітів) зафіксовано в **Що НЕ увійшло**.

| Фаза                          | PR                                                                                                           | Що зроблено                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** — health probes   | [#1634](https://github.com/Skords-01/Sergeant/pull/1634)                                                     | `/startupz` (Kubernetes-стандартне ім'я) + nested aliases `/health/liveness`, `/health/readiness`, `/health/startup`. `markStartupComplete()` тригериться у `app.listen` callback. 6 нових smoke-тестів покривають всі path-и + idempotency повторного marking-у.                                                                                                                                                                                                                                   |
| **Phase 2** — rate-limit      | [#1638](https://github.com/Skords-01/Sergeant/pull/1638)                                                     | `apps/server/src/config/rateLimit.ts` — централізований реєстр policy з типобезпечним `policyOptions(name, overrides?)`. RFC-9239 `RateLimit-Limit/Remaining/Reset` headers + legacy `X-RateLimit-Remaining` для backward-compat. `authMiddleware` мігровано на `policyOptions("api:auth:sensitive", ...)` без зміни metric-key (Grafana/alert dashboards безперервні). 12 нових тестів.                                                                                                            |
| **Phase 3** — Renovate        | [#1641](https://github.com/Skords-01/Sergeant/pull/1641) + [ADR-0044](../adr/0044-renovate-vs-dependabot.md) | Розподіл ролей: Renovate primary для regular weekly bumps, Dependabot security-only daily fallback. Видаляє ~12 duplicate-PR/тиждень. Renovate отримав missing groups `anthropic`, `sentry`, `opentelemetry` (initiative spec). Dependabot npm scope скорочено до `applies-to: security-updates`.                                                                                                                                                                                                   |
| **Phase 4** — SBOM на release | [#1639](https://github.com/Skords-01/Sergeant/pull/1639)                                                     | `.github/workflows/release-sbom.yml` тригериться на `release: published` / `push: tags v*.*.*` / `workflow_dispatch`. SPDX-JSON + CycloneDX-JSON одночасно через `anchore/sbom-action@v0.24.0` (SHA-pinned). Артефакти 90 днів у Actions; на published release auto-attach обох форматів через `gh release upload --clobber`. Step Summary з component count. `docs/security/hardening/I3-sbom-generation.md` оновлено: Phase 1 live, Phase 2 (container-SBOM) + Phase 3 (sigstore) лишаються Open. |
| **Phase 5** — runbook + docs  | [#1642](https://github.com/Skords-01/Sergeant/pull/1642)                                                     | Окрема секція «Platform hardening — operational FAQ» у `docs/observability/runbook.md` з 4 how-to: інтерпретація 429-алерт + RFC headers, дії при `/health/readiness=503`, decision-table для Renovate-PR-ів (regular vs major vs security vs duplicate-of-Renovate-PR), знайти SBOM на release і використати при CVE-disclosure.                                                                                                                                                                   |

### Що НЕ увійшло (з обґрунтуванням)

- **`pnpm audit --prod` gate у CI на PR** (Phase 4 spec) — пропущено, бо існуючий `nightly-audit.yml` уже покриває full-audit + auto-issue creation на critical/high. Дублювати на кожен PR підняв би CI-time без вигоди (audit-результат не змінюється від коду PR-а — він залежить від lockfile, який дрейфить раз на тиждень). Якщо в майбутньому відкриється race-window між nightly run і urgent merge — додамо PR-gated audit.
- **Sigstore signing на release** (Phase 4 spec, опт-ін) — відкладено. Initiative позначала як optional, потребує decision щодо identity-провайдера для cosign keyless signing. Окремий ADR коли проєкт визначиться. SBOM-файли вже доступні без signing.
- **Migration `apps/server/src/routes/*.ts` на `policyOptions(...)` для всіх ~20 inline rate-limit-конфігів** (Phase 2 follow-up). Реалізовано тільки референс-міграція `authMiddleware`. Кожен `barcode`/`chat`/`nutrition`/`ai-memory`/`web-vitals` ліміт — окреме security-decision (limit/windowMs підбиралися owner-ом для конкретного pattern-у). Краще зробити мікро-PR-и з review в окремому проході (Phase 2b).
- **`docs/ops/` як новий silo** (Phase 5 spec) — проpущено. Existing `docs/observability/`, `docs/security/`, `docs/deploy/`, `docs/integrations/` уже перекривають operational concerns. Натомість FAQ-секцію додано в runbook.md (там on-call team шукає when-things-break-info).
- **Render/k8s конфіг оновлення probes** (Phase 1 DONE-criteria) — Sergeant деплоїться через Railway buildpacks, не Kubernetes. Probes реалізовано на server-side; Railway сам не використовує liveness/readiness probes у custom-mode. Якщо проєкт перейде на k8s/EKS — конфіг розгортання у тій ініціативі.
- **`/health` → 308 redirect на `/health/liveness`** (Phase 1 DONE-criteria) — реалізовано через nested-aliases (`/health/liveness` працює як alias на `/healthz`), без redirect-у. Пояснення: redirect додав би latency на ще одну hop для health-check-у, що critical для probe-frequency. Альтернативний підхід ідентичний з точки зору споживача.

### Метрики (post-rollout, очікувані)

- **Cold-start MTTR**: probe `failureThreshold: 30, periodSeconds: 1` дозволяє warmup до 30 сек без false-positive restart. Baseline — 15 сек incident у Q1 → запас ×2.
- **Auth 429 retry-storm**: клієнти, які парсять `Retry-After` (RQ default policy у `apps/web/src/shared/lib/api/queryClient.ts`), мають zero retry-storm-time після rate-limit. Без header-у — exponential backoff на client-side виходив до 60 сек.
- **CVE response time**: Renovate weekly + Dependabot security-daily → CVE-disclosure → PR за <24h. Раніше — manual `pnpm update` раз на 2 тижні.
- **Supply-chain audit**: SBOM на кожен release дозволяє query `trivy sbom <file>` за <2 сек на CVE-correlation. Без SBOM аудит вимагав full re-scan робочого дерева.
