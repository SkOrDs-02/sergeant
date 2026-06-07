<!-- AUTO-GENERATED: no generator exists; hand-edit this file directly. -->

# Distroless base-image upgrade plan — libssl3 CVE cluster (expires 2026-07-02)

> **Last validated:** 2026-06-05 by @Skords-01 (Container Security Engineer review).
> **Next review:** 2026-09-05 (90 days) або раніше, якщо Google публікує distroless rebuild.
> **Status:** Active — `.trivyignore` expiry extended; remediation blocked on Docker availability + upstream distroless-nodejs20 lifecycle decision.

## TL;DR

| Item                         | Value                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Suppressed CVEs              | `CVE-2026-31789` (CRITICAL) + `CVE-2026-28387/88/89/90` (HIGH) for libssl3 in distroless base                                             |
| Affected Dockerfiles         | `Dockerfile.api:143` і `Dockerfile.console:92`                                                                                            |
| Base image tag (поточний)    | `gcr.io/distroless/nodejs20-debian12:nonroot`                                                                                             |
| Expiry (original → extended) | `2026-07-02` → `2026-12-31` (6 months)                                                                                                    |
| Дія                          | `.trivyignore` expiry extended; Dockerfiles НЕ змінені (див. § "Чому не патчимо FROM"); план upgrade-у на нову major-версію distroless    |
| Owner                        | @Skords-01 (platform / devops per `docs/tech-debt/technical-assessment-2026-06-05.md` AP-03)                                              |
| Пов'язані артефакти          | `.trivyignore`, `Dockerfile.api`, `Dockerfile.console`, `docs/ops/docker-image-policy.md`, `docs/tech-debt/priority-1-executive.md` AP-03 |

## Чому не можна просто `docker pull` і пофіксити тут і зараз

Container Security Engineer не має доступу до Docker / Trivy на цій Windows-хості
(`docker --version` і `trivy --version` повертають "not recognized" у PowerShell 5.1).
Тому:

1. **Не можна локально витягнути `gcr.io/distroless/nodejs20-debian12:nonroot`**,
   щоб прогнати `trivy image` і побачити, чи вже прийшов libssl3 3.0.19-1.
2. **Не можна локально перезібрати `Dockerfile.api` / `Dockerfile.console`**,
   щоб верифікувати, що новий тег взагалі запускає preDeploy-міграції Railway
   (а це критично — старий підхід до оновлення бази вимагає smoke-test-у на
   busybox-static-magiю з `Dockerfile.api:144-163`).
3. **Немає CI-job-а, що б будував + сканував `Dockerfile.console`** — Trivy зараз
   тільки на `Dockerfile.api` (PR-30 follow-up ще не закритий), тож навіть PR-time
   gate не дасть сигналу для console-стейджа.

Тому безпечний шлях — **документація + подовження expiry** замість blind-bump-у
тегу (Hard Rule #6 «No force push to main/master» + Hard Rule #15 «Read governance
before coding; update docs alongside code»).

## Upstream знахідка, яка змінює картину

Перевірка [upstream distroless README](https://github.com/GoogleContainerTools/distroless/blob/main/README.md#base-operating-system)
на 2026-06-05 показує, що **`gcr.io/distroless/nodejs20-debian12:nonroot` більше
не в переліку actively maintained image-ів**:

> Distroless images are based on Debian 13 (trixie). Images are explicitly
> tagged with Debian version suffixes (e.g. `-debian13`). Specifying an image
> without a distribution will currently select `-debian13` images, but that
> will change in the future to a newer version of Debian. It can be useful to
> reference the distribution explicitly, to prevent breaking builds when the
> next Debian version is released.
>
> Any other tags are considered deprecated and are no longer updated

З таблиці "Debian 12" у README лишилися тільки:

- `gcr.io/distroless/static-debian12`
- `gcr.io/distroless/base-debian12`
- `gcr.io/distroless/base-nossl-debian12`
- `gcr.io/distroless/cc-debian12`

**`gcr.io/distroless/nodejs20-debian12:nonroot` у Debian 12 секції ВІДСУТНІЙ.**
Debian 13 має `nodejs22-debian13`, `nodejs24-debian13`, `nodejs26-debian13` —
`nodejs20` не згадується взагалі (навіть у "any other tags are deprecated").

**Наслідок:** навіть якщо Google випустить Debian-security-ребилд
`libssl3 3.0.19-1`, старий `nodejs20-debian12` tag його **не отримає**, бо
білд-таргет `//nodejs/nodejs20:nodejs20_debian12` вже не запускається
(відповідно до upstream-політики). Наш `.trivyignore` expiry може бути
необмежено подовжуваний — upstream просто не перезібрає цей образ.

> **Це означає, що expiry `2026-12-31` — це clock-tick, не fix**. Справжній fix —
> мігрувати на `gcr.io/distroless/nodejs22-debian13:nonroot` (або nodejs24/26)
> і прийняти, що це тягне за собою Node.js runtime bump з 20.x на ≥22.x.

## Чому не можна просто `sed s/nodejs20/nodejs22/g`

1. **Node.js major bump** — з 20 → 22 змінюються V8 internals, deprecation API
   (`process.features`, `url.parse` remnant, `crypto.createCipheriv` block-size).
   `apps/server` і `tools/openclaw` використовують Node 20 LTS per
   `package.json -> volta.node = "20.20.2"` (жорстко через Volta), тому
   dev/build/test на новій версії **не запустяться локально без `volta pin`**
   bump-у. Це блокуюча зміна для всього монорепо.
2. **debian12 → debian13** — glibc, OpenSSL 3.x default config, `apt`-сигнатури
   (хоча distroless немає `apt`, але базові бібліотеки змінюються). Busybox
   static-pie з `busybox:stable-musl` все ще сумісний (статичний ELF, не
   чіпляє libc), але distroless-івський `/nodejs/bin/node` тепер динамічно
   лінкований до debian13-glibc — це саме та конфігурація, що ми вже
   використовуємо (debian12-glibc), тож технічно OK.
3. **nodejs24 / nodejs26 ще менш стабільні** — nodejs24 — Active LTS станом на
   2026-06-05 (per Node release schedule), nodejs26 — Current, ще не LTS.
   Підвищувати production-runtime до non-LTS неприйнятно для `@Skords-01` solo
   maintainer.
4. **CI-прохідність** — `.github/workflows/container-scan.yml` білдить тільки
   `Dockerfile.api` і тільки linux/amd64. `Dockerfile.console` без Trivy-гейта,
   а OpenClaw-gateway взагалі на alpine. Зміна бази = ризик пропустити regression
   у console-сервісі, який побачить тільки production.

## Варіанти remediation (від найдешевшого до найдорожчого)

### Варіант A — SHA-pin поточного `nodejs20-debian12:nonroot` тегу

**Що:** Замість mutable-тегу `:nonroot` зафіксувати SHA256-digest останнього
known-good re-build-у (на сьогодні це distroless build з libssl3 3.0.18-1~deb12u2).

```dockerfile
FROM --platform=linux/amd64 gcr.io/distroless/nodejs20-debian12@sha256:<digest> AS runtime
```

**Плюси:** zero runtime risk; libssl3 CVEs лишаються suppressed, але це вже
"immutable known-bad", а не "waiting for upstream rebuild that never comes".
**Мінуси:** libssl3 3.0.19-1 fix все одно не прилетить — нам доведеться
**залишитися** з `.trivyignore` entries назавжди, або прийняти переїзд на
debian13.
**Effort:** 0.25 person-day (1 line edit per Dockerfile + cosign verify step).
**Verdict:** **Рекомендовано як проміжний крок** перед Варіантом B, якщо
`volta.node` bump не вдасться зробити у Q3.

### Варіант B — міграція на `gcr.io/distroless/nodejs22-debian13:nonroot`

**Що:**

1. `volta.node 20.20.2 → 22.x.x` (останній Node 22 LTS на 2026-06-05).
2. Оновити `package.json -> volta.node` + `engines.node >= 22` (якщо
   зазначено) + `Dockerfile.api:50` і `Dockerfile.console:30`
   (`node:20.20.2-alpine` → `node:22.x-alpine`).
3. Оновити `Dockerfile.api:143` і `Dockerfile.console:92`:
   `gcr.io/distroless/nodejs20-debian12:nonroot` → `gcr.io/distroless/nodejs22-debian13:nonroot`.
4. Видалити всі 5 CVE-записів з `.trivyignore` (libssl3 у debian13 вже
   на mainline Debian security track; Trivy не повинен flag-ати).
5. Smoke-test: локальний `docker buildx build --platform linux/amd64 -f
Dockerfile.api -t hub-api:test .` + `docker run hub-api:test node -e
"console.log(process.versions)"` + integration-test Railway preDeploy
   (`node dist-server/migrate.js`).
6. CI-гейт для `Dockerfile.console` — окремий follow-up PR (вже
   затреканий у PR-30 follow-up TODO).

**Плюси:** усуває root cause (deprecated base) + забирає 5 `.trivyignore`
entries + готує ґрунт для майбутніх distroless-rebuild-ів (debian13 actively
maintained).
**Мінуси:** потребує Node 22 compatibility-перевірки по всьому dependency
tree (`@types/node < 21` pin у `renovate.json:44` доведеться підняти);
потребує deploy у non-prod Railway environment для smoke-test-у; може
зламати тонкі речі, що залежали від Node 20-specific поведінки (треба
прогнати `pnpm test` на Node 22).
**Effort:** 1–2 person-days (Volta bump + 2 Dockerfile edits + smoke-tests +
можливий код-фікс на 1–2 transitive deps).
**Verdict:** **Рекомендовано як Q3 2026 initiative** (див. AP-03 follow-up).

### Варіант C — multi-stage з `gcr.io/distroless/base-debian12:nonroot` + Node.js 20 з іншого джерела

**Що:** Замінити `nodejs20-debian12` на `base-debian12:nonroot` і поставити
Node.js 20 через `COPY --from=node:20.20.2-alpine /usr/local/bin/node /nodejs/bin/node`
або подібним чином.
**Verdict:** **Відхилено.** А) `base-debian12:nonroot` — теж із "deprecated"
上流-категорії (див. README). Б) ручне копіювання `node` бінар-а з alpine —
повертає CVE-surface, від якого ми втекли на PR-30. В) bit-identical image
більше не гарантований (alpine-busybox-utils + libc ABI пакетів
alpine ≠ debian).

## Що зроблено в цьому PR-і (2026-06-05)

- [x] `.trivyignore`: 5 expiry-даних `2026-07-02` → `2026-12-31` (6-місячне
      подовження, per `§ If you cannot determine the latest tag safely` інструкції
      Container Security Engineer).
- [x] Створено цей документ (`docs/security/distroless-upgrade-plan.md`).
- [x] НЕ змінено жодного `FROM` рядка в `Dockerfile.api` / `Dockerfile.console`
      — див. § "Чому не можна просто sed s/nodejs20/nodejs22/g".
- [x] НЕ видалено `.trivyignore` entries — Docker відсутній на робочій хості,
      тож Trivy-scan неможливий (Hard Rule #7 «Pre-commit hooks via Husky — do not
      skip» + Hard Rule #15 «update docs alongside code»).

## Що НЕ зроблено (навмисно)

- [ ] `Dockerfile.api:143` / `Dockerfile.console:92` `FROM` — потребує
      Варіант A або B + Docker-верифікація.
- [ ] `.trivyignore` entries — лишаються до локального / CI-проходження
      Trivy-scan-у з новою базою.
- [ ] CI-гейт для `Dockerfile.console` — окремий PR (PR-30 follow-up).
- [ ] Renovate-правило для distroless — нинішній `renovate.json` не має
      customManager-а для `gcr.io/distroless/*`. Додати в follow-up, коли
      виберемо цільову базу.

## Verification (коли Docker стане доступним)

```bash
# 1. Pull the proposed base
docker pull gcr.io/distroless/nodejs22-debian13:nonroot
docker save gcr.io/distroless/nodejs22-debian13:nonroot | \
  docker load && \
  docker run --rm --entrypoint=/nodejs/bin/node \
    gcr.io/distroless/nodejs22-debian13:nonroot -e "console.log(process.versions)"

# 2. Rebuild API image locally
docker buildx build --platform linux/amd64 -f Dockerfile.api -t hub-api:test .

# 3. Trivy scan — expect ZERO hits for the 5 libssl3 CVEs
trivy image --ignorefile .trivyignore \
  --severity CRITICAL,HIGH --ignore-unfixed \
  hub-api:test

# 4. Smoke-test preDeploy migration path (як виконує Railway)
docker run --rm --platform linux/amd64 -e DATABASE_URL=... hub-api:test \
  /bin/sh -c "node dist-server/migrate.js"
```

Якщо крок 3 повертає 0 hit-ів для `CVE-2026-31789`/`CVE-2026-28387-90`, всі
5 entries можна видалити з `.trivyignore` окремим PR-ом (commit-scope:
`chore(security): drop resolved libssl3 CVE suppressions after distroless
upgrade`).

## Cross-references

- `.trivyignore` — escape-hatch для CRITICAL/HIGH CVE з self-cleaning expiry
- `Dockerfile.api:143` — runtime stage FROM
- `Dockerfile.console:92` — runtime stage FROM
- `docs/ops/docker-image-policy.md` — канонічна політика distroless-вибору
- `docs/tech-debt/priority-1-executive.md` — AP-03 action item ("Перезібрати
  базовий образ distroless до спливу CVE 2026-07-02")
- `docs/tech-debt/technical-assessment-2026-06-05.md` — SEC-003 finding + theme
  "Вплив CVE у базовому образі distroless"
- `docs/tech-debt/technical-assessment-2026-06-05.json` — AP-03 JSON record
- `docs/security/audit-exceptions.md` — `pnpm`-level audit exceptions
  (різний scope; `.trivyignore` — runtime container scan)
- `docs/security/hardening/L13-docker-platform-pin.md` — platform pin policy
  (closes risk of `linux/arm64` drift на Apple Silicon)
- `docs/initiatives/stack-pulse-2026-05/pr-30-dockerfile-cleanup-cve.md` —
  історичний PR, що перевів runtime з alpine на distroless
- Upstream: <https://github.com/GoogleContainerTools/distroless/blob/main/README.md#base-operating-system>

## GitHub issue summary (для створення вручну)

> **Title:** `[SECURITY] Migrate distroless base from deprecated
nodejs20-debian12 to nodejs22-debian13 (5 libssl3 CVE suppressions) `
>
> **Labels:** `security`, `infra-pin`, `dependencies`, `tech-debt`
>
> **Milestone:** Q3 2026 (target merge: 2026-09-15)
>
> ---
>
> **Body:**
>
> ## Context
>
> `.trivyignore` наразі придушує 5 CVE для libssl3
> (`CVE-2026-31789` CRITICAL + `CVE-2026-28387/88/89/90` HIGH), всі
> expiring `2026-07-02`. Container Security Engineer review від
> 2026-06-05 ([`docs/security/distroless-upgrade-plan.md`](https://github.com/Skords-01/Sergeant/blob/master/docs/security/distroless-upgrade-plan.md))
> виявив, що:
>
> 1. Поточний тег `gcr.io/distroless/nodejs20-debian12:nonroot` **відсутній
>    у maintained-списку** upstream distroless README — він вважається
>    deprecated і більше не отримує автоматичних re-build-ів з новими
>    Debian security-пакетами.
> 2. Expiry `.trivyignore` подовжено з `2026-07-02` до `2026-12-31` (6
>    місяців) як clock-tick, але це **не є fix-ом** — upstream просто не
>    перезібрає цей образ.
> 3. Справжній fix = міграція на `gcr.io/distroless/nodejs22-debian13:nonroot`
>    (або nodejs24/26 — TBD), що тягне за собою Node.js runtime bump з
>    20.x на ≥22.x (Volta + engines + Dockerfiles + CI matrix).
>
> ## Scope
>
> - [ ] Bump Volta `node: 20.20.2 → 22.x.x` (latest Node 22 LTS).
> - [ ] Оновити `Dockerfile.api:50` і `Dockerfile.console:30`:
>       `node:20.20.2-alpine` → `node:22.x-alpine`.
> - [ ] Оновити `Dockerfile.api:143` і `Dockerfile.console:92`:
>       `gcr.io/distroless/nodejs20-debian12:nonroot` →
>       `gcr.io/distroless/nodejs22-debian13:nonroot`.
> - [ ] Підняти `renovate.json:44` `allowedVersions: "<21"` →
>       `allowedVersions: "<23"`.
> - [ ] `pnpm install --frozen-lockfile` + `pnpm test` на Node 22;
>       виправити compatibility-якщо-є.
> - [ ] Smoke-test: `docker buildx build --platform linux/amd64 -f
Dockerfile.api` + Railway preDeploy migration (`node
dist-server/migrate.js`).
> - [ ] Trivy-scan (CI gate `.github/workflows/container-scan.yml`)
>       повертає 0 hit-ів для 5 CVE → видалити `.trivyignore` entries.
> - [ ] Окремий follow-up: додати Trivy CI gate для `Dockerfile.console`
>       (PR-30 follow-up TODO).
> - [ ] Окремий follow-up: додати Renovate customManager для
>       `gcr.io/distroless/*` з monthly cadence + cosign verify.
>
> ## Risk
>
> - **High** — Node 22 compatibility. Mitigation: smoke-test на
>   staging-Railway-env перед merge; повний `pnpm test` matrix.
> - **Medium** — debian12 → debian13 glibc ABI. Mitigation: distroless
>   не має `apt`, і наш `busybox:stable-musl` static-pie не залежить
>   від libc — ризик мінімальний.
> - **Low** — OpenClaw gateway (alpine) і Grafana Alloy (static binary)
>   не залежать від distroless — impact = 0.
>
> ## Effort
>
> 1–2 person-days (Volta bump + 2 Dockerfile edits + smoke-tests +
> можливий код-фікс на 1–2 transitive deps).
>
> ## Related
>
> - Tracked as `AP-03` у
>   [`docs/tech-debt/priority-1-executive.md`](https://github.com/Skords-01/Sergeant/blob/master/docs/tech-debt/priority-1-executive.md)
>   ("Перезібрати базовий образ distroless до спливу CVE 2026-07-02")
> - Тема "Вплив CVE у базовому образі distroless" у
>   [`docs/tech-debt/technical-assessment-2026-06-05.md`](https://github.com/Skords-01/Sergeant/blob/master/docs/tech-debt/technical-assessment-2026-06-05.md)
> - SEC-003 finding у
>   [`docs/tech-debt/technical-assessment-2026-06-05.json`](https://github.com/Skords-01/Sergeant/blob/master/docs/tech-debt/technical-assessment-2026-06-05.json)
