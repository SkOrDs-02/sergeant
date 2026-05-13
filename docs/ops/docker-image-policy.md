# Docker image policy

> **Last validated:** 2026-05-13 by @Skords-01 / Devin (PR-30). **Next review:** 2026-08-11.
> **Status:** Active

Політика для runtime container-image-ів Sergeant: Hub API (`Dockerfile.api`) і Console / OpenClaw (`Dockerfile.console`). Описує rationale за distroless multi-stage build (PR-30 — `docs/initiatives/stack-pulse-2026-05/pr-30-dockerfile-cleanup-cve.md`), CVE-бюджет, healthcheck-семантику, і rollout-послідовність.

## TL;DR

1. **Runtime base:** `gcr.io/distroless/nodejs20-debian12:nonroot` — Node 20 + glibc, без shell, без package manager-ів, uid:gid `65532:65532`.
2. **Multi-stage:** `builder` (повна збірка) → `deps` (production-only deps + cleanup) → `runtime` (distroless).
3. **CVE budget:** Trivy gate на `HIGH/CRITICAL` у `.github/workflows/container-scan.yml` — `0` нових CVE allowed по `Dockerfile.api` (console scan додаємо follow-up PR).
4. **Healthcheck:** немає в Dockerfile — Railway моніторить через external HTTP probe (`/health` для API) або crashloop detection (для console). Distroless не має shell-у, тож `HEALTHCHECK CMD wget …` / `pgrep …` не виконуються.

## Чому distroless

Попередній alpine-based runtime (≤PR-30) намагався shrink-нути CVE surface через post-install cleanup:

```dockerfile
RUN find node_modules -maxdepth 3 -type d \
      \( -path 'node_modules/.pnpm/vite@*' \
         -o -path 'node_modules/.pnpm/vitest@*' \
         ... \) \
      -prune -exec rm -rf {} + \
 && rm -rf /usr/local/lib/node_modules/corepack \
           /usr/local/lib/node_modules/npm \
           ...
```

**Проблеми попереднього підходу:**

1. **Fragile** — кожна нова transitive deps з peer-bundle тягнула Go-binary `esbuild` / `vite`, і `find … -prune` доводилося розширювати manually.
2. **Inconsistent** — `Dockerfile.api` (154 рядків) і `Dockerfile.console` (97 рядків) мали різні cleanup-lists.
3. **Implicit CVE-shrink** — list of removed CVE-paths був у comments, не enforce-ило-ся CI-ем.
4. **Shell + corepack залишалися** — `/bin/sh`, `wget`, `npm`, `corepack` все ще присутні; attack surface не нульова.

**Distroless усуває проблеми by-design:**

- Немає shell-у → cleanup-патерни через `find` не потрібні.
- Немає `npm` / `pnpm` / `corepack` → 0 package-manager CVE.
- Немає `wget` / `curl` / `bash` → 0 BusyBox CVE.
- `nonroot` user (uid 65532) → CIS Docker Benchmark + OWASP Top-10 default.

Builder + deps stage-и залишаються на `node:20.20.2-alpine` — їм потрібен shell для `pnpm`. Cleanup CVE-noisy peers (vite/vitest/esbuild/rollup/tsx) робиться ТАМ, до того, як файли потрапляють у runtime. Trivy сканує тільки runtime layer-и.

## Stage map

### `Dockerfile.api` (Hub API, Express + grammy)

| Stage     | Base                                          | Покликання                                                                                                             |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `builder` | `node:20.20.2-alpine`                         | `pnpm install` (dev+prod), `pnpm --filter @sergeant/db-schema build`, `pnpm build` (esbuild → `dist-server/index.js`). |
| `deps`    | `node:20.20.2-alpine`                         | `pnpm install --prod --filter @sergeant/server...`. Cleanup CVE-noisy peers через `find … -prune`.                     |
| `runtime` | `gcr.io/distroless/nodejs20-debian12:nonroot` | Тільки `node_modules` (з deps) + `dist-server/` (з builder) + `docs/<read_strategy_docs allowlist>/`. NO HEALTHCHECK.  |

### `Dockerfile.console` (Telegram bot, long-poll)

| Stage     | Base                                          | Покликання                                                                          |
| --------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `builder` | `node:20.20.2-alpine`                         | `pnpm install` (dev+prod), `pnpm --filter @sergeant/console build` (tsc → `dist/`). |
| `deps`    | `node:20.20.2-alpine`                         | `pnpm install --prod --filter @sergeant/console...`. Cleanup CVE-noisy peers.       |
| `runtime` | `gcr.io/distroless/nodejs20-debian12:nonroot` | `node_modules` (з deps) + `dist/` (з builder). NO HEALTHCHECK.                      |

## Healthcheck політика

Distroless runtime НЕ містить shell-у і утиліт (`wget`, `curl`, `bash`, `pgrep`). HEALTHCHECK CMD-директиви виконуються Docker engine через `/bin/sh -c "..."` — у distroless це впаде з `exec: "sh": executable file not found`. Тому в обох Dockerfile-ах HEALTHCHECK навмисно опущено.

**Як здоров'я моніториться без HEALTHCHECK:**

- **Hub API**: Railway service-config має external HTTP probe на `https://<api-domain>/health` (вже існує — налаштовано через Railway dashboard за межами цього репо). Probe-fail → автоматичний restart container.
- **Console / OpenClaw**: Long-poll grammy-боти НЕ слухають HTTP. Railway моніторить, що main process не вийшов (crashloop detection); якщо `node dist/index.js` exit-нув, container restart-иться. Дополнительно сам Sentry SDK у `tools/console/src/index.ts` flag-ає uncaught exceptions як `crash`-events із release-тегом.

**Якщо у майбутньому потрібен containerized healthcheck**, варіанти:

1. **`node -e` self-check** — distroless має `node`, тож `HEALTHCHECK CMD ["/nodejs/bin/node", "-e", "require('http').get('http://localhost:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]` працює. Не використовуємо зараз, бо Railway external probe простіший.
2. **Bind-mount static `wget` binary з alpine** у runtime stage — антипатерн (відновлює CVE-surface, який distroless усуває).

## Trivy gate

CI workflow [`.github/workflows/container-scan.yml`](../../.github/workflows/container-scan.yml) сканує `Dockerfile.api` через `aquasecurity/trivy-action`. Gate: fail PR при наявності `HIGH` / `CRITICAL` CVE у новому шарі.

**Очікувані Trivy-метрики після PR-30:**

- `Dockerfile.api`: 0 HIGH/CRITICAL (порівняти з pre-PR baseline через CI artifacts).
- `Dockerfile.console`: Trivy scan ще не enabled у CI (follow-up PR розширить `container-scan.yml`).

**`.trivyignore`** — не використовуємо. Якщо в майбутньому з'явиться false-positive на known-good vendor package, рішення: (a) додати у `.trivyignore` з obligatory inline comment-justification і audit-trail, (b) preferred — upgrade-нути dep до patched версії.

## CVE-noisy peer cleanup (deps stage)

Cleanup для тих самих пакетів, що були у попередньому inline-pattern-i, але виконується у `deps` stage (де є shell), а не у runtime:

```dockerfile
RUN find node_modules -maxdepth 3 -type d \
      \( -path 'node_modules/.pnpm/vite@*' \
         -o -path 'node_modules/.pnpm/vitest@*' \
         -o -path 'node_modules/.pnpm/vite-node@*' \
         -o -path 'node_modules/.pnpm/@vitest+*' \
         -o -path 'node_modules/.pnpm/esbuild@*' \
         -o -path 'node_modules/.pnpm/@esbuild+*' \
         -o -path 'node_modules/.pnpm/tsx@*' \
         -o -path 'node_modules/.pnpm/rollup@*' \
         -o -path 'node_modules/.pnpm/@rollup+*' \) \
      -prune -exec rm -rf {} +
```

**Що видаляється і чому:**

- `vite` / `vite-node` / `@vitest+*` / `vitest` — peer-of-peer пакети `better-auth` / `@tanstack/react-start`. Bundle-ять Go-binary `esbuild`, який Trivy фейлить на CRITICAL у Go stdlib.
- `esbuild` / `@esbuild+*` — самі Go-binary артефакти.
- `tsx` — dev-only, runtime його не виконує.
- `rollup` / `@rollup+*` — peer Vite-у, аналогічна логіка.

`--frozen-lockfile` блокує перемикання `auto-install-peers` у `pnpm`, тому простіше прибрати їх постфактум, тримаючи lockfile незмінним. У distroless runtime ці пакети ще раз не з'являться — `pnpm` не існує у runtime image-i.

## Rollout

PR-30 — single PR з обома Dockerfile-ами разом, бо CVE-нова base layer + cleanup pattern мають deploy-итися як atomic change (інакше один сервіс на alpine, інший на distroless — divergent risk).

**Послідовність деплою:**

1. **Merge PR-30** → CI Trivy зеленіє для нового `Dockerfile.api`.
2. **Railway service `sergeant-api`** автоматично rebuild-ить через Railway image-update on merge. Перший rebuild slower (no cache); subsequent — incremental.
3. **Confirm у Railway logs**: `service started on port 3000` без healthcheck-warning-ів.
4. **Railway service `sergeant-openclaw`** (console) деплоїться окремо, але одночасно — спостереження за crashloop-detection-ом замість HEALTHCHECK.
5. **24h soak** — alertbot повинен не зашуміти на missing healthcheck (Railway external probe тримає API alive; for console — process-monitoring сам).
6. **Якщо incident** — rollback через Railway redeploy попереднього image-tag-у (Railway image-cache хоронить N останніх).

## Backout

Якщо distroless створює проблеми (наприклад, native module-binding fails з glibc у `pg-native` чи `bcrypt`), rollback:

1. Railway → previous deploy → одна кнопка.
2. Або revert PR-30 commits, push, новий image rebuild.

**Known-risk native deps (перевірено на PR-30 build):**

| Dep                 | Native?           | Distroless OK? |
| ------------------- | ----------------- | -------------- |
| `pg`                | No (pure-JS pool) | ✓              |
| `bcryptjs`          | No (pure-JS)      | ✓              |
| `@anthropic-ai/sdk` | No                | ✓              |
| `grammy`            | No                | ✓              |
| `voyageai`          | No                | ✓              |

Native-binding deps (наприклад `sharp`) — НЕ у поточному dependency tree. Якщо колись додадуться — потрібен `:debug` distroless variant з glibc symbol-resolution або повернення на alpine. Test-build перед merge.

## See also

- [`Dockerfile.api`](../../Dockerfile.api) — Hub API multi-stage build.
- [`Dockerfile.console`](../../Dockerfile.console) — Console / OpenClaw multi-stage build.
- [`.github/workflows/container-scan.yml`](../../.github/workflows/container-scan.yml) — Trivy CI gate.
- [`docs/initiatives/stack-pulse-2026-05/pr-30-dockerfile-cleanup-cve.md`](../initiatives/stack-pulse-2026-05/pr-30-dockerfile-cleanup-cve.md) — PR-30 design doc.
- [`docs/security/hardening/L13-docker-platform-pin.md`](../security/hardening/L13-docker-platform-pin.md) — `--platform=linux/amd64` pin policy.
- [Distroless images](https://github.com/GoogleContainerTools/distroless) — upstream README.
