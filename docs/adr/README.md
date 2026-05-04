# Architecture Decision Records (ADR) — реєстр рішень

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

> Архітектурні рішення Sergeant. Кожен ADR фіксує **рішення з контекстом і альтернативами**, щоб через рік не довелось гадати «чому ми тут зробили так, а не інакше».
>
> **Last reviewed: 2026-04-27 by @Skords-01.**

---

## Що таке ADR

ADR (Architecture Decision Record) — короткий документ, який фіксує **архітектурне рішення з контекстом і альтернативами**. ADR не описує how-to (це playbook) і не дублює широку специфікацію (це design doc). ADR відповідає на питання **«чому»**, не **«як»**.

Заводимо ADR коли рішення стосується архітектури, вибору технології, зовнішніх інтеграцій, або суттєво впливає на структуру коду / DX / operational процеси. Не заводимо для дрібних рефакторингів, bug-фіксів або стилістичних змін.

## Конвенція неймінгу

```
docs/adr/
├── README.md                    ← ви тут
├── TEMPLATE.md                  ← шаблон для нових ADR
├── 0001-monetization-architecture.md
├── 0002-tool-lifecycle.md
└── NNNN-kebab-case-title.md
```

- Формат: `NNNN-kebab-case-title.md` — 4-значний sequential номер, без пропусків (`0001`, `0002`, ...).
- Для нового ADR: скопіюй [`TEMPLATE.md`](./TEMPLATE.md), перейменуй у `NNNN-kebab-case-title.md`, заповни секції.
- ADR ніколи не видаляються — лише `deprecated`.

## Життєвий цикл

```
Proposed → Accepted → (Deprecated | Superseded by ADR-XXXX)
```

| Статус                   | Коли                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `Proposed`               | ADR створено, PR відкритий, рішення ще не затверджене.            |
| `Accepted`               | PR змерджено, рішення діє.                                        |
| `Deprecated`             | Рішення більше не актуальне (технологія відмовлена, тощо).        |
| `Superseded by ADR-NNNN` | Нове рішення замінює це; новий ADR лінкує `Supersedes: ADR-MMMM`. |

Зміна статусу — **окремим PR-ом** (щоб бачити чому і коли рішення було переглянуто).

> **Immutability:** ADR-и виключені з freshness-tracking-у через `excludeGlobs: ["docs/adr/**"]` і не оновлюються періодично. ADR — історичний запис рішення на момент його ухвалення. Якщо рішення змінилось — пиши **новий** ADR зі статусом `Accepted` і `Supersedes: ADR-NNNN`, а старий перепиши на `Superseded by ADR-NNNN`. Деталі: [`docs/governance/doc-freshness.md`](../governance/doc-freshness.md#свідомо-виключено).

## Як створити новий ADR

Рекомендований спосіб — Plop-генератор:

```bash
pnpm gen:adr
```

Він сам візьме наступний 4-значний номер (`nextAdrNumber()` у `plopfile.mjs`), попросить `kebab-case` title, human-readable H1 і список deciders, і створить `docs/adr/NNNN-<title>.md` із заповненим front-matter. Ручна копія `TEMPLATE.md` більше не потрібна.

Далі:

1. Заповни секції: Context and Problem Statement / Considered Options / Decision / Rationale / Consequences / Compliance.
2. Status = `Proposed` поки PR не змерджений.
3. При мерджі — `Accepted` + дата.
4. Лінкуй ADR з відповідних дизайн-документів (`docs/launch/06-*`, `docs/audits/*`).
5. Додай рядок у таблицю «Поточні ADR» нижче.

## Поточні ADR

| #    | Назва                                           | Статус   | Створено   | Контекст                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | Monetization architecture                       | proposed | 2026-04-27 | 11 рішень перед стартом monetization-MVP (provider, cache, trial, tax, cancel, ...)                                                                                                                                                                                                           |
| 0002 | AI tool lifecycle                               | accepted | 2026-04-27 | 4-фазний процес для Anthropic tools: Proposal → Safety → Rollout → KPIs.                                                                                                                                                                                                                      |
| 0003 | Refund and dispute handling                     | proposed | 2026-04-27 | Stripe refund/dispute flow + fraud_blocklist; 90-day window; повернення Pro-status.                                                                                                                                                                                                           |
| 0004 | CloudSync LWW conflict resolution               | accepted | 2026-04-27 | Last-Write-Wins на module-рівні + offline queue + Phase 4 tie-breaker.                                                                                                                                                                                                                        |
| 0005 | Anthropic model selection and prompt caching    | accepted | 2026-04-27 | Claude 3.5 Sonnet primary, Haiku fallback; prompt-cache strategy + cache-hit metrics.                                                                                                                                                                                                         |
| 0006 | RQ keys via centralized factory                 | accepted | 2026-04-27 | `queryKeys.ts` factories + ESLint rule `rq-keys-only-from-factory`.                                                                                                                                                                                                                           |
| 0007 | Tailwind opacity scale + WCAG-AA `-strong` tier | accepted | 2026-04-27 | Підтримуваний opacity-набір 5/10/15/...; saturated brand-fill behind `text-white` → `-strong` companion.                                                                                                                                                                                      |
| 0008 | Feature flags                                   | accepted | 2026-04-27 | Client-only registry поверх `typedStore`; немає сервер-сайд гейтінгу на MVP.                                                                                                                                                                                                                  |
| 0009 | Hosting split Railway + Vercel                  | accepted | 2026-04-27 | API + Postgres на Railway, web + edge-proxy на Vercel; single-origin cookie boundary.                                                                                                                                                                                                         |
| 0010 | Mobile dual-track (Capacitor+Expo)              | accepted | 2026-04-27 | Shell + RN паралельно, окремі bundle-ID, спільний API та domain-пакети.                                                                                                                                                                                                                       |
| 0011 | Local-first storage                             | accepted | 2026-04-27 | Клієнт — primary, сервер — LWW-реплікатор на module-рівні; offline queue.                                                                                                                                                                                                                     |
| 0012 | RLS as authz boundary                           | proposed | 2026-04-27 | Цільова модель RLS + `withUserContext`; поточно — app-enforced `WHERE user_id`.                                                                                                                                                                                                               |
| 0013 | DB migrations conventions                       | accepted | 2026-04-27 | Sequential `NNN_*.sql`, forward-only, two-phase DROP, idempotent, tests first.                                                                                                                                                                                                                |
| 0014 | bigint → number policy                          | accepted | 2026-04-27 | Серіалізатори коерсять `BIGINT` → JS `number`; snapshot-тести лочать contract.                                                                                                                                                                                                                |
| 0015 | Observability stack                             | accepted | 2026-04-27 | Pino (logs) + Prometheus (metrics) + Sentry (errors); SLO-first burn-rate alerts.                                                                                                                                                                                                             |
| 0016 | User deletion and PII handling                  | proposed | 2026-04-27 | GDPR delete-flow, fraud_blocklist retention, IP-cron 90-day window.                                                                                                                                                                                                                           |
| 0017 | Better Auth choice and session model            | accepted | 2026-04-27 | Better Auth (OSS, $0); cookie + bearer dual-channel; 30-day session; expo plugin.                                                                                                                                                                                                             |
| 0018 | API versioning policy (`/api/v1`)               | accepted | 2026-04-27 | `/api/v1/*` для domain endpoints; `/api/auth/*` без versioning; rewrite-middleware.                                                                                                                                                                                                           |
| 0019 | Push notifications                              | accepted | 2026-04-27 | Server-driven fan-out (web Push API + APNs + FCM); subscription lifecycle.                                                                                                                                                                                                                    |
| 0020 | Testing pyramid                                 | accepted | 2026-04-27 | Unit / integration / a11y / smoke-e2e — частки, owners, CI gating.                                                                                                                                                                                                                            |
| 0021 | Memory Bank                                     | accepted | 2026-04-27 | Local-first AI user-fact store; `key/value`-схема + Anthropic-tool integration.                                                                                                                                                                                                               |
| 0022 | Atomic SQL daily quotas                         | accepted | 2026-04-27 | `INSERT ... ON CONFLICT DO UPDATE WHERE` для idempotent quota counters.                                                                                                                                                                                                                       |
| 0023 | Turborepo as monorepo task runner               | accepted | 2026-04-27 | `turbo@2` поверх pnpm-workspace; task-граф у `turbo.json`; remote-cache opt-in через `TURBO_TOKEN`.                                                                                                                                                                                           |
| 0024 | Monorepo split — `apps/*` + `packages/*`        | accepted | 2026-04-27 | Деплоюються `apps/*`, перевикористовуються `packages/*`; `packages/*` ніколи не імпортує з `apps/*`.                                                                                                                                                                                          |
| 0025 | OpenAPI 3.1 spec — generated from zod-схем      | accepted | 2026-04-27 | `docs/api/openapi.json` згенеровано з canonical zod-схем; freshness-скрипт ловить drift у rule #3.                                                                                                                                                                                            |
| 0026 | n8n — джерело істини для воркфлоу               | accepted | 2026-04-27 | Git — джерело істини для n8n; JSON у `ops/n8n-workflows/` + manifest з owner / risk / secrets.                                                                                                                                                                                                |
| 0027 | Політика OpenClaw, Console та MCP               | accepted | 2026-04-27 | `apps/console` як internal admin; allowlist по Telegram user-id; вивід агента — untrusted.                                                                                                                                                                                                    |
| 0028 | pgvector + AI memory                            | accepted | 2026-05-01 | Voyage embeddings → `halfvec(1024)` у Postgres з HNSW + hash-партиціонуванням; vector-store-agnostic API.                                                                                                                                                                                     |
| 0030 | Telegram reporting channel structure            | accepted | 2026-05-02 | Single supergroup + Forum mode (8 канонічних топіків) + P0/P1/P2 escalation hierarchy + WF-98 fan-out.                                                                                                                                                                                        |
| 0031 | OpenClaw v0 — Telegram-only co-founder bot      | accepted | 2026-05-02 | Окремий @OpenClaw_sergeant_bot (DM-only, allowlist) з 7 read-only tools, strict memory isolation, $5/day cap.                                                                                                                                                                                 |
| 0032 | Console consolidated into OpenClaw              | accepted | 2026-05-02 | OpenClaw (ADR-0031) поглинає функції @sergeant_console_bot (ADR-0027); legacy console dormant до team-scale.                                                                                                                                                                                  |
| 0033 | OpenClaw multi-personas + `/council`            | accepted | 2026-05-02 | 5 personas (cofounder/ops/growth/eng/finance) + sequential `/council` round-table; persona-filtered toolsets.                                                                                                                                                                                 |
| 0034 | Visual regression testing                       | accepted | 2026-05-03 | Argos + Playwright з 56 screenshot-ів; non-blocking Argos status-check; формалізація вже-існуючої CI-конфіги.                                                                                                                                                                                 |
| 0035 | Distributed tracing — OpenTelemetry             | proposed | 2026-05-03 | OTel web→server, Honeycomb backend, sample 10%/5%; вимкнення Sentry browserTracing.                                                                                                                                                                                                           |
| 0036 | OpenClaw write-tools with approval flow         | accepted | 2026-05-03 | 5 write-tools (strategy doc PR / GH issue / TG topic post / n8n pause / Sentry mute) gated by inline-button approval.                                                                                                                                                                         |
| 0037 | OpenClaw write-audit persistence (Phase 4.5)    | accepted | 2026-05-03 | Append-only `openclaw_write_audit` table + `/audit` slash-command — persists approve/execute/reject lifecycle для post-mortems.                                                                                                                                                               |
| 0038 | Telegram alert acks + 15-min escalation         | accepted | 2026-05-03 | `tg_alert_acks` table + 4 internal endpoints (`/post`/`/ack`/`/pending`/`/escalate`) — foundation для Wave 3 §3.2 acknowledge-button + WF-103 escalation cron.                                                                                                                                |
| 0039 | Anthropic prompt-cache breakpoint policy        | accepted | 2026-05-04 | 2 `cache_control: ephemeral` breakpoints (`system[0]` + last `tool`) — кешуємо `SYSTEM_PREFIX` + tools registry; messages та per-user `system[1]` НЕ кешуються; 30%-floor для rollback. Закриває [Initiative 0005](../initiatives/0005-ai-cost-and-prompt-cache.md).                          |
| 0041 | OpenClaw Telegram delivery via webhook          | accepted | 2026-05-03 | Feature-flag-gated `node:http` webhook server у `apps/console` (за замовчуванням off → long-poll); знижує latency approval-кнопок з 2-3с до <500мс; one-step backout через `OPENCLAW_USE_WEBHOOK=false`.                                                                                      |
| 0042 | Password hashing strategy                       | proposed | 2026-05-03 | bcrypt 72-byte cap (clamp `MAX_PASSWORD_LENGTH=72`) + SHA-256 pre-hash + Argon2id рекомендація для майбутнього алгоритм-розширення. Закриває false-sense-of-security з 128-байтним лімітом. Phase 1 — immediate code change у env validation.                                                 |
| 0043 | CloudSync v1 sunset                             | accepted | 2026-05-04 | RFC 8594 `Sunset:` + `Deprecation: true` + RFC 8288 `Link: rel="successor-version"` headers на v1 routes (`/api/sync/*`); 6-фазний rollout-план; T₀ контролюється env var `CLOUDSYNC_V1_SUNSET_AT`. Реалізує [Initiative 0003 Phase 2](../initiatives/0003-sync-v2-rollout-and-v1-sunset.md). |
| 0044 | Renovate vs Dependabot роль-дільниця            | accepted | 2026-05-04 | Renovate primary для regular weekly bumps; Dependabot security-only daily fallback. Видаляє ~12 duplicate-PR/тиждень. Закриває [Initiative 0008 Phase 3](../initiatives/0008-platform-hardening.md).                                                                                          |
| 0045 | Hard Rules taxonomy                             | accepted | 2026-05-04 | Три-категорійна таксономія в реєстрі `hard-rules.json`: `blocker-invariant` / `lint-enforced-convention` / `active-initiative`. Розблоковує slim-down AGENTS.md (Initiative 0009 Phase 3.1) — design-конвенції винесено в окрему секцію без зміни enforcement.                                |

> **Note on next ADR:** наступний номер — **`0046`** (`0040` лишається gap).

> **Note on numbering 0016–0022 jump:** ADRs `0016`–`0022` — це retroactive batch, що був написаний паралельно з `0006`–`0012`. Через паралельне виконання Devin-сесій виникли колізії номерів `0003`–`0012`. Розв'язано через PR `docs(adr): resolve numbering collisions` — same-topic дублі (refund, anthropic, PII) видалено, late-comers перенумеровано в `0016`+.

> **Note on missing 0029:** Номер `0029` зарезервований під ADR, що не дійшов до merge — паралельні Devin-сесії на 2026-05-02 створили `0030` (Telegram reporting) і `0031` (OpenClaw v0) майже одночасно, а 0029-кандидат (proposed: per-source AI-memory ingestion gating) був згорнутий в ADR-0028 під час рев'ю замість окремого документа. ADR-и не нумеруються заднім числом, тому `0029` лишається як **відомий gap** — задокументований у `KNOWN_NUMBERING_GAPS` в `scripts/docs/check-adr-graph.mjs` і whitelisted у gap-rule.

> **Note on 0039 reuse:** Номер `0039` спочатку було зарезервовано (gap) під ADR-кандидат «OpenClaw proactive cron-rituals» — імплементацію не стартували; коли Wave 2 пишеться, номер береться наступний вільний (не `0039`). 2026-05-04 номер реусався під [ADR-0039 Anthropic prompt-cache breakpoint policy](./0039-anthropic-prompt-cache-policy.md) (закриття Initiative 0005); `0039` прибрано з `KNOWN_NUMBERING_GAPS`.

> **Note on missing 0040:** Номер `0040` згадувався у коментарях коду (`apps/console/src/openclaw/alerts-format.ts`) і roadmap §3.6 («strategic mode — `/plan` / `/analyze` / `/okr`») як планований ADR для Wave-3 HTML-mode broadcast formatting. Рішення зафіксовано **inline** у Wave-3 PR-ах (#1473 / #1480 / #1503 / #1508) — окремий ADR-файл не дійшов. `0040` лишається **відомим gap** і whitelisted у `KNOWN_NUMBERING_GAPS`. Наступний вільний номер — **`0046`** (`pnpm gen:adr` обчислює `max + 1` через `nextAdrNumber()` у `plopfile.mjs`, тож автоматично пропустить пусті номери).

> **Graph integrity:** Парсинг метаданих ADR (`Status:` / `Supersedes:`, з підтримкою англо- та україномовних назв полів — див. ADR-0026/0027) і перевірка індексу + бідіректіонального supersede-зв'язку автоматизовані: `node scripts/docs/check-adr-graph.mjs` (CI gate в `docs-automation.yml`).
