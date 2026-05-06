# STRIDE threat model

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Закриває [I6 — Document the STRIDE threat model per module](./hardening/I6-threat-model.md).

Цей документ — **карта загроз**, проти якої лежать 50+ hardening-карток у
[`./hardening/`](./hardening/README.md). Картки — це _findings_ з конкретним
fix-ом; threat-model — _чому_ кожен fix має бути там, де він є.
Кожен новий finding мусить покликатися на відповідний STRIDE-рядок одного
з модулів нижче.

## STRIDE — нагадування

| Літера | Загроза                | Контр-controls (типові)                                       |
| ------ | ---------------------- | ------------------------------------------------------------- |
| S      | Spoofing               | Auth (Better Auth), session-binding, CSRF, signed webhooks    |
| T      | Tampering              | Integrity (Helmet, CSP, CSRF, signed payloads, DB-constraint) |
| R      | Repudiation            | Audit-log (Pino + Sentry), webhook idempotency keys           |
| I      | Information disclosure | TLS, encryption-at-rest, PII-hash, CSP / COEP / Permissions   |
| D      | Denial of service      | Rate-limit, USD-cap, Helmet, request-size cap                 |
| E      | Elevation of privilege | RBAC (founder/+1), allowlist, ownership checks                |

CVSS v3.1 — у [`./vulnerability-sla.md`](./vulnerability-sla.md). Severity
для нової картки = STRIDE-impact × ймовірність × surface exposure (один
рядок таблиці модуля = одна _surface_).

## Системний контекст

Sergeant — multi-tenant фінансовий + здоров'я-трекер. Trust-зони:

1. **Public Internet** — anonymous SPA users, security-researchers,
   abuse traffic.
2. **Authenticated user** — користувач з Better-Auth-сесією, доступ до
   власних даних (RBAC-enforced ownership).
3. **Founder + 1** — privileged операції (DB-restore, secret rotation,
   OpenClaw `/grant`, console allowlist). Інвентар у
   [`./access-matrix.md`](./access-matrix.md).
4. **External APIs** — Mono (webhook + REST), Anthropic, Groq,
   PostHog, Sentry, OpenFoodFacts. Кожен — окрема trust-zone з
   власним блокером компрометації (див. `secret-ownership-register.md`).
5. **Storage** — Postgres (Railway), SQLite (mobile-shell + apps/web
   IndexedDB-fallback). Encryption-at-rest у Railway = LUKS, у мобілі
   = OS keychain (H1).

Дані рухаються Public → SPA/Mobile → Hub API (Express) → Postgres +
зовнішні API. Console/OpenClaw — окремий ingress (Telegram bot) з
fail-closed allowlist (M15). Mono — webhook ingress з HMAC підписом
(перевірка у `apps/server/src/modules/mono/webhook.ts`).

## Модулі

Кожен підрозділ нижче — окрема **STRIDE-таблиця** для модуля. Колонки:

- **Surface** — конкретний шлях/handler/файл (одна STRIDE-комірка = одна
  attack surface).
- **Загроза (STRIDE)** — найбільш релевантна категорія для цієї surface.
- **Existing controls** — links на implemented mitigation-и (картки,
  тести, ADR).
- **Residual risk** — те, що ще лишається після controls; зазвичай
  трекається як Open hardening-картка.

> Якщо контроль ще не shipped — клітинка `Existing controls` посилається
> на Open-картку, а `Residual risk` повторює її ID. Це робить
> threat-model **живим документом**: коли картка закривається, її ID
> зникає з обох колонок.

### 1. Server (Express + Better Auth)

Ingress: `apps/server/src/index.ts` → Express → Better Auth →
`apps/server/src/modules/*`. Trust boundary: Public ↔ Authenticated.

| Surface                                               | STRIDE | Existing controls                                                                                                                                        | Residual risk                                                                                         |
| ----------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Login + sessions (Better Auth)                        | S      | Better Auth password-hash; UA-drift detection; session revoke-on-password-change ([H3](./hardening/H3-session-revoke-and-binding.md), Closed)            | Anonymous CGNAT abuse — partially covered by per-IP fallback rate-limit; secondary cap = M9 Open      |
| `/api/mono/webhook`                                   | S/T    | HMAC signature verify; replay-window via timestamp; idempotency key; bad-payload metric                                                                  | Internal `/api/push/send` IP allowlist ([M14](./hardening/M14-internal-push-ip-allowlist.md), Closed) |
| State-changing routes (`POST`/`PUT`/`PATCH`/`DELETE`) | T      | CSRF token check ([M10](./hardening/M10-csrf-token-check.md), Closed); Better-Auth same-site cookie                                                      | None — covered by M10                                                                                 |
| `/api/csp-report` (CSP violation reports)             | I/D    | Body-cap, allowlist of report-uri, structured Sentry pipeline                                                                                            | None — closed scope                                                                                   |
| Health probes (`/healthz`, `/readyz`)                 | I      | ≤ 32-byte payloads, no `commit`/`sha`/`version`/`build` keys ([L7](./hardening/L7-health-endpoint-info-leak.md), Closed)                                 | None                                                                                                  |
| Rate-limit (`apps/server/src/http/rateLimit.ts`)      | D      | Per-user bucket; per-IP fallback; structured `429` payload                                                                                               | Mass-account abuse scales linearly ([M9](./hardening/M9-per-ip-secondary-rate-limit.md), Open)        |
| `transcribe` / `chat` AI endpoints                    | D/E    | USD-cap per user ([H9](./hardening/H9-transcribe-usd-cap.md), Closed); chat tool-iteration cap ([M7](./hardening/M7-chat-tool-iteration-cap.md), Closed) | OpenClaw daily $5 cap with per-call cap ([M18](./hardening/M18-openclaw-per-call-usd-cap.md), Closed) |
| DB ownership checks (`apps/server/src/modules/*`)     | E      | `userId` filter on every query; snapshot tests lock shapes; bigint→number coercion (Hard rule #1)                                                        | None — invariant + lint                                                                               |
| `pg` driver `bigint` leakage                          | I/T    | Hard rule #1 + serializer review                                                                                                                         | None                                                                                                  |
| Logs (Pino)                                           | I/R    | `userId` hashed before log ([L10](./hardening/L10-user-id-hash-in-logs.md), Closed); structured Sentry forward                                           | Push security events to OpenClaw ([I7](./hardening/I7-security-events-openclaw.md), Open)             |
| `trust proxy` config                                  | S      | Parameterised via env ([M2](./hardening/M2-trust-proxy-parameterize.md), Closed)                                                                         | None                                                                                                  |

### 2. Web (Vite SPA, `apps/web`)

Ingress: deployed Vercel static site → `apps/web/index.html` → React
bundle. Trust boundary: Public ↔ SPA-rendered DOM.

| Surface                               | STRIDE | Existing controls                                                                                                                                       | Residual risk                                                                 |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Production response headers           | I/T    | `vercel.json` SSOT ([H7](./hardening/H7-vercel-config-drift.md), Closed); `check-vercel-config.sh` drift guard                                          | None                                                                          |
| `Content-Security-Policy-Report-Only` | I/T    | C2 baseline + Sentry/PostHog allowlist ([L11](./hardening/L11-csp-monitoring-allowlist.md), Closed); `cspMonitoringAllowlist.test.ts`                   | Promote to enforce-mode after 2-week soak (tracked in C2 retrospective)       |
| `Permissions-Policy`                  | I      | Disabled APIs locked by `permissionsPolicyHeader.test.ts` ([L2](./hardening/L2-permissions-policy-broader.md), Closed)                                  | None                                                                          |
| `<meta name="referrer">`              | I      | Defense-in-depth fallback ([L3](./hardening/L3-meta-referrer.md), Closed)                                                                               | None                                                                          |
| `<html lang>` lock                    | I      | `indexHtmlLang.test.ts` regression test ([L4](./hardening/L4-html-lang-attribute.md), Closed)                                                           | None                                                                          |
| HubChat tool handlers                 | T/E    | Pure functions; localStorage only via `ls`/`lsSet`; happy + error path tests per handler                                                                | Per-handler ownership audit on each new tool def                              |
| Local-first storage (MMKV-web / IDB)  | I      | No raw secrets in IndexedDB; `hashToken()` mandatory before query keys (Hard rule #2); `noReplacementChar.test.ts` + `sergeantDb.ts` migration coverage | localStorage is best-effort confidentiality; sensitive data lives server-side |
| Web-vitals ingest                     | D/I    | Body-cap, allowlist, UA normalise ([M12](./hardening/M12-web-vitals-hardening.md), Closed)                                                              | None                                                                          |

### 3. Mobile shell (Capacitor wrapper)

Ingress: `apps/mobile-shell` → wraps `apps/web` build → Capacitor →
native iOS/Android. Trust boundary: SPA ↔ native bridge.

| Surface                               | STRIDE | Existing controls                                                                                                                           | Residual risk                                                                                |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Bearer-token storage                  | S/I    | OS keychain (Capacitor SecureStorage) ([H1](./hardening/H1-mobile-bearer-storage.md), Closed)                                               | None — keychain is OS invariant                                                              |
| Cleartext HTTP (`exp://` / `http://`) | I      | Capacitor `cleartext: false`; iOS `NSAppTransportSecurity = false`; Android `usesCleartextTraffic="false"`                                  | iOS Info.plist audit + CI guard ([L12](./hardening/L12-ios-app-transport-security.md), Open) |
| Deep-link surface                     | E/T    | Query/fragment sanitised ([M19](./hardening/M19-mobile-deeplink-sanitize.md), Closed); apple-app-site-association + assetlinks.json publish | None                                                                                         |
| Back-button on unsaved state          | T      | Confirmation dialog ([M20](./hardening/M20-mobile-back-button-confirm.md), Closed)                                                          | None                                                                                         |
| Trusted origins                       | S      | `exp://` removed from production trusted origins ([H5](./hardening/H5-trusted-origins-exp-scheme.md), Closed)                               | None                                                                                         |

### 4. Console / OpenClaw (Telegram bot, `tools/console`)

Ingress: Telegram → grammy → `tools/console/src/*`. Trust boundary:
Telegram authenticated user ↔ founder-only allowlist.

| Surface                      | STRIDE | Existing controls                                                                                                                                               | Residual risk                                                                   |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Telegram allowlist           | S/E    | `CONSOLE_BOT_TOKEN` allowlist fail-closed ([M15](./hardening/M15-console-allowlist-fail-closed.md), Closed); `/grant` requires founder                          | None                                                                            |
| Repo-root traversal          | T      | `OPENCLAW_REPO_ROOT` path-traversal guard ([L8](./hardening/L8-openclaw-repo-root-traversal.md), Closed); `safeJoin.ts` allowlist mapping                       | None                                                                            |
| Telegram message rendering   | I/T    | `parse_mode: "MarkdownV2"` ([M16](./hardening/M16-telegram-markdown-v2.md), Closed) — escapes user-supplied tokens                                              | None                                                                            |
| Per-user / global rate-limit | D      | Per-user bucket ([M17](./hardening/M17-console-global-rate-cap.md), Closed); global cap added                                                                   | None                                                                            |
| Anthropic per-call USD cap   | D      | Per-call cap ([M18](./hardening/M18-openclaw-per-call-usd-cap.md), Closed); daily $5 budget guard                                                               | None                                                                            |
| Security-event push          | R      | Sentry / Pino metrics: `auth.session.ua_drift`, `prompt_injection_attempt`, `transcribe.usd_cap_hit`, `chat.tool_iteration_cap_hit`, `mono_webhook_bad_payload` | OpenClaw push pipeline ([I7](./hardening/I7-security-events-openclaw.md), Open) |

### 5. Mono integration (`apps/server/src/modules/mono/*`)

Ingress: Mono webhook (HMAC-signed) + Mono REST API (Bearer-token).
Trust boundary: External Mono SaaS ↔ Hub API.

| Surface                      | STRIDE | Existing controls                                                                                                                                     | Residual risk                                     |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Webhook signature verify     | S/T    | HMAC-SHA256 with `MONO_WEBHOOK_SECRET`; constant-time compare; bad-payload metric                                                                     | None                                              |
| Webhook idempotency          | T/R    | `recordSync*` idempotency key + de-dup query                                                                                                          | None                                              |
| OAuth/Bearer token storage   | S/I    | `*_TOKEN_ENC_KEY` AES-GCM at rest; key-rotation phase 1 ([H4](./hardening/H4-encryption-key-rotation.md), Closed); ownership register pinned          | Phase 2 (KMS-managed key) tracked in H4 follow-up |
| Mono transactions JSON shape | T/I    | `pg` `bigint` → `number` coercion (Hard rule #1); `merchantCategory` MCC normalisation; snapshot tests in `apps/server/src/modules/mono/read.test.ts` | None                                              |
| MCC/MCC-bucket bucketization | I      | `apps/server/src/modules/mono/mcc.ts` — typed allowlist; PII-free                                                                                     | None                                              |

### 6. Data store (Postgres + SQLite)

Postgres: Railway-managed, encryption-at-rest. SQLite: mobile-shell +
SPA fallback, OS-level. Trust boundary: app-tier ↔ persistence-tier.

| Surface                            | STRIDE | Existing controls                                                                                                                                     | Residual risk                                                                       |
| ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| SQL injection                      | T/I    | `pg` parameterized queries; `eslint-plugin-security` non-literal-fs/sql lint ([M11](./hardening/M11-eslint-plugin-security.md), Closed); CodeQL taint | None — defence-in-depth                                                             |
| Migration drift                    | T      | Sequential `NNN_*.sql`; two-phase DROP (Hard rule #4); pre-deploy `pnpm db:migrate`                                                                   | None                                                                                |
| Encryption-at-rest (Postgres)      | I      | Railway LUKS; `*_TOKEN_ENC_KEY` AES-GCM for Mono / OAuth tokens                                                                                       | KMS-managed key rotation phase 2 (H4)                                               |
| Encryption-at-rest (SQLite mobile) | I      | OS keychain for bearer-token (H1); IndexedDB best-effort                                                                                              | localStorage / IndexedDB confidentiality is best-effort — no PII stored client-side |
| Backup / restore                   | I/D    | Disaster-recovery RPO/RTO targets ([`./disaster-recovery.md`](./disaster-recovery.md)); `db-backup-verify.yml` workflow                               | Restore drill cadence (covered by RPO doc)                                          |
| `pgvector` extension               | T      | Pinned `pgvector/pgvector:pg16` image; migration `025_ai_memories_pgvector.sql` `CREATE EXTENSION IF NOT EXISTS vector`                               | None — image pin is the contract                                                    |
| Ownership leakage between tenants  | I/E    | Every query filters by `userId`; snapshot tests; CodeQL ownership taint                                                                               | Periodic external pentest ([I8](./hardening/I8-periodic-external-pentest.md), Open) |

## Cross-cutting controls

Деякі mitigation-и не належать одному модулю — це системний рівень
поверх усіх вище.

| Control                                  | Layer                            | Trigger                                                                                                | Linked cards                                                                                       |
| ---------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| CodeQL SAST                              | TS source taint-flow             | PR + push to `main` + Mon 06:00 UTC                                                                    | [I1](./hardening/I1-codeql-workflow.md) Closed                                                     |
| Trivy container scan                     | API image (alpine + npm runtime) | PR + push + daily 04:00 UTC                                                                            | [`./container-scan.md`](./container-scan.md), [L13](./hardening/L13-docker-platform-pin.md) Closed |
| Nightly OSV-Scanner / pnpm audit         | Lockfile SCA                     | nightly 03:00 UTC                                                                                      | [`./nightly-audit.md`](./nightly-audit.md), [H2](./hardening/H2-dependabot.md) Closed              |
| GitHub Secret-scanning + push protection | Repo                             | Every push                                                                                             | [`./README.md` § Secret scanning policy](./README.md)                                              |
| CI gitleaks job                          | Repo                             | Every PR + push to `main`                                                                              | [`./README.md` § Secret scanning policy](./README.md)                                              |
| Pre-commit secret detection              | Local commit                     | Husky + `lint-staged`                                                                                  | [I5](./hardening/I5-pre-commit-secret-detection.md) Open — gitleaks pre-commit not yet wired       |
| `security.txt`                           | Public discovery                 | Static `apps/web/public/.well-known/security.txt`; expiry guard `scripts/check-security-txt-expiry.sh` | [I4](./hardening/I4-security-txt.md) Closed                                                        |
| SBOM generation                          | Container build                  | Container-scan workflow                                                                                | [I3](./hardening/I3-sbom-generation.md) Open                                                       |
| External pentest                         | Whole-stack                      | 6-12 month cycle                                                                                       | [I8](./hardening/I8-periodic-external-pentest.md) Open                                             |

## Acceptance — як підтримувати цей документ

1. **Кожна нова hardening-картка** мусить мати у `## Cross-references`
   посилання на конкретний модуль/рядок із цього файла. Якщо немає
   відповідної surface — спочатку додай рядок сюди (PR), потім
   реєструй картку.
2. **Закриття картки** прибирає її ID з колонки `Residual risk`. Якщо
   картка _відкривала_ нову surface — рядок таблиці лишається; колонка
   `Existing controls` оновлюється на новий контроль.
3. **Audit findings** ([`../audits/`](../audits/) — окремий цикл,
   snapshot-аудити) транслюються у hardening-картки → ті крос-референсять
   threat-model. Audit-документ сам у threat-model не лінкується (це
   тимчасові звіти, threat-model — живий контракт).
4. **Зовнішній пентест** ([I8](./hardening/I8-periodic-external-pentest.md))
   приймає цей файл як вхідний brief. Vendor findings → hardening-картки
   → threat-model rows.

## Cross-references

- [`./README.md`](./README.md) — репо-overview політики безпеки.
- [`./hardening/README.md`](./hardening/README.md) — повний backlog
  (Critical → Informational).
- [`./access-policy.md`](./access-policy.md) — RBAC для founder+1 та
  privileged операцій.
- [`./access-matrix.md`](./access-matrix.md) — інвентар привілейованих
  surface-ів.
- [`./vulnerability-sla.md`](./vulnerability-sla.md) — CVSS + SLA per
  severity.
- [`./pii-handling.md`](./pii-handling.md) — конкретні правила
  обробки PII (логування, експорт, видалення).
