# Сканування container-image — Trivy

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

## Огляд

Workflow [`.github/workflows/container-scan.yml`](../../.github/workflows/container-scan.yml)
збирає `hub-api` образ з [`Dockerfile.api`](../../Dockerfile.api) і сканує його
[Trivy](https://aquasecurity.github.io/trivy/) на CVE рівнів **CRITICAL/HIGH**.

Це окремий шар від [nightly-audit](./nightly-audit.md), який сканує лише
**lockfile-залежності** (pnpm audit, OSV-Scanner, Snyk). Trivy дивиться на
**рантайм-image**: alpine OS-пакети, файли в final-stage, потенційні misconfig.

### Тригери

| Подія               | Коли запускається                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pull_request`      | PR торкається `Dockerfile.api`, `.dockerignore`, `pnpm-lock.yaml`, серверних апов/пакетів, або самого workflow. |
| `push` to `main`    | Кожен merge на main.                                                                                            |
| `schedule`          | Щоденно о **04:00 UTC** (через годину після `nightly-audit`).                                                   |
| `workflow_dispatch` | Ручний запуск через Actions UI.                                                                                 |
|                     |                                                                                                                 |

### Результат

- **GitHub Code Scanning** — SARIF завантажується з `category: trivy-image`,
  тренди видно в `Security > Code Scanning > Trivy image`.
- **Артефакт `trivy-image-sarif`** — `trivy-image.sarif` (retention 30 днів)
  для офлайн-аналізу.
- **Job summary** — короткий зведений блок у Actions UI.

### Severity gate

- Job **fail**-ить на `CRITICAL` або `HIGH` (`exit-code: 1`).
- `ignore-unfixed: true` — CVE без доступного патчу не блокують merge; такі
  випадки залишаються видимими в SARIF-trend і розглядаються разом
  з nightly-audit triage (див. [`./nightly-audit.md`](./nightly-audit.md) і
  [`./vulnerability-sla.md`](./vulnerability-sla.md)).

## Що робити, коли job впав

### 1. Подивись Trivy SARIF

В Actions run-і скачай артефакт `trivy-image-sarif` або відкрий
**Security > Code Scanning** і відфільтруй по category `trivy-image`.

### 2. Triage за SLA

Той самий SLA, що й для nightly-audit — див. таблицю у
[`./vulnerability-sla.md`](./vulnerability-sla.md).

| Severity     | SLA       |
| ------------ | --------- |
| **Critical** | 24 години |
| **High**     | 14 днів   |

### 3. Якщо фікс зараз неможливий

1. Задокументуй виняток у [`./audit-exceptions.md`](./audit-exceptions.md)
   з обґрунтуванням і `removeBy` датою.
2. Якщо це CVE без патчу (наприклад, base-image поки немає виправленого
   тегу) — додай у `.trivyignore` з коментарем + посиланням на upstream
   issue. Ignore-and-revisit, не silent-suppress.
3. Розглянь варіант оновити base image (`node:20.20.2-alpine` → новіший
   minor) у Dockerfile.api.
4. Якщо CVE прийшла від dev-тулчейну (`vite`, `vitest`, `esbuild`, `tsx`,
   `rollup`), яка просочилась у runtime через optional-peer-и
   (`pnpm install --prod` авто-ставить peer-и за замовчуванням) — приберіть
   ці модулі post-install у Dockerfile.api замість того, щоб тягти бамп
   у lockfile (приклад: PR #1196). Подібно — bundled `npm` / `corepack`
   у `node:*-alpine` ловлять CVE на `cross-spawn` / `glob` / `minimatch` /
   `tar`; якщо runtime не використовує жоден із цих менеджерів,
   видаляйте `/usr/local/lib/node_modules/{npm,corepack}` та супутні
   symlink-и одним `RUN rm -rf` під root, до зміни на non-root юзера.

### 4. Перевір, що nightly-audit і container-scan не дублюють виняток

Лежать вони в одному файлі `audit-exceptions.md` — просто не плодь
дві окремі лінії для одного CVE.

## Platform invariant

`hub-api:scan` **завжди** будується для `linux/amd64` — це Railway runtime
arch (closes hardening card
[L13](./hardening/L13-docker-platform-pin.md)).

- `Dockerfile.api` — `FROM --platform=linux/amd64 node:20.20.2-alpine` на
  обох stage-ах (builder + runtime).
- `.github/workflows/container-scan.yml` — `platforms: linux/amd64` у
  `docker/build-push-action` + `Confirm scanned image is linux/amd64`
  guard step (`docker image inspect` arch-check), який валить job якщо
  loaded image не `linux/amd64`.

Без цього invariant дев на Apple Silicon локально отримує arm64-image,
Trivy сканує arm64-шар, а Railway деплоїть amd64 — drift проходить
повз nightly-audit і виявляється тільки коли arm64 lockfile-version
розходиться з amd64. Не міняй це без оновлення обох сторін
(Dockerfile + workflow) і відповідного запису в
[`./audit-exceptions.md`](./audit-exceptions.md).

## Як локально відтворити

```bash
# 1. Build image (явно amd64 — інакше локально на Apple Silicon отримаєш
# arm64-image, що не збігається з тим, що сканується в CI / деплоїться
# на Railway).
docker buildx build --platform linux/amd64 -f Dockerfile.api -t hub-api:scan .

# 2. Перевір arch (defense-in-depth, як у workflow).
docker image inspect hub-api:scan --format '{{.Os}}/{{.Architecture}}'
# Очікуване: linux/amd64

# 3. Install Trivy locally (один раз)
brew install trivy   # або см. https://aquasecurity.github.io/trivy/

# 4. Scan
trivy image \
  --severity CRITICAL,HIGH \
  --ignore-unfixed \
  --vuln-type os,library \
  hub-api:scan
```

Якщо локально CVE є, а в CI немає (або навпаки) — найімовірніша причина
розбіжна версія Trivy DB. Запусти `trivy image --download-db-only`
перед сканом.

## Зв'язані документи

- [`./nightly-audit.md`](./nightly-audit.md) — dependency-only сканування.
- [`./vulnerability-sla.md`](./vulnerability-sla.md) — SLA per severity.
- [`./audit-exceptions.md`](./audit-exceptions.md) — задокументовані винятки.
- [`Dockerfile.api`](../../Dockerfile.api) — образ, який сканується.
