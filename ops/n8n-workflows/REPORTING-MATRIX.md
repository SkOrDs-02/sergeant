# n8n Reporting Matrix

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active. Live since 2026-05-02 — supergroup `Sergeant Ops` (chat
> id `-1003924852082`) у Forum mode, 7 канонічних топіків створені, кожен
> workflow JSON шле через `={{ $env.TELEGRAM_TOPIC_* }}` expression на
> правильний `message_thread_id` (див. розділ "Telegram topic env vars"
> нижче). Канонічні Ukrainian-topic-назви: `🔴 Інциденти`, `💰 Виторг`,
> `⚙️ Контрол-план`, `🟡 Опс`, `🛠️ Інженерія`, `🚀 Зростання`,
> `📊 Дайджести`. У кожному топіку pinned-меседж описує область
> відповідальності.

Single source of truth for **who hears what, where, how often, and what to do
when** for every active n8n workflow. Канал-, цикл-, escalation- та власник-
маппінг живе тут; deep-dive логіка кожного workflow — у `manifest.json` і у
розділі `## Workflow-и — деталі` файлу [`../README.md`](../README.md).

Цей документ узгоджує **три-level приріст**:

1. **Інстанс** — один Telegram supergroup (`Sergeant Ops`) у Forum mode.
2. **Тема (topic)** — категорія відповідальності (revenue / incidents / …).
3. **Workflow (n8n)** — продьюсер повідомлення з конкретного триггера.

Архітектурне обґрунтування — в
[`../../docs/observability/telegram-control-plane.md`](../../docs/observability/telegram-control-plane.md)
та
[ADR-0030](../../docs/adr/0030-telegram-reporting-channel-structure.md).

## Priority levels

Кожен workflow має `riskTier` у `manifest.json` (P0..P3). Ці значення
напряму мапляться на escalation policy:

| Tier   | Що це                                                                         | Telegram delivery       | Escalation                                                                  |
| ------ | ----------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| **P0** | Прямий impact на ревенью, продакшн-доступність, або сам control plane (n8n).  | Sound + push, no silent | WF-98 fan-out: Telegram + email (`OPS_ALERT_EMAIL`). Re-poke через 15хв ⁽¹⁾ |
| **P1** | Operational health: бекапи, security аудит, hygiene блокери (stale PRs, DB).  | Sound + push            | Telegram only. Daily digest unacked > 24h ⁽¹⁾                               |
| **P2** | Інформаційні дайджести: growth, метрики, тижневі фінсводки, user-facing push. | Silent (no sound)       | Telegram only. Weekly digest, без re-poke                                   |
| **P3** | Зарезервовано на майбутнє: pure logging без notification.                     | —                       | —                                                                           |

⁽¹⁾ Re-poke / digest — на час написання роблеться **руками** (читати канал).
Auto-ack workflow — у roadmap, див. розділ "Future" нижче.

## Channel layout

Один supergroup `Sergeant Ops` у режимі **Forum** з фіксованими топіками. Bot
`Sergeant_alert_bot` — admin (post messages + manage topics). User-facing
push-ноти (WF-07/09/10) **не йдуть в supergroup**, а летять окремо до
кінцевих юзерів через `/api/push/send`.

| Topic (UI label)       | Env var                      | Audience                  | Default tier | Призначення                                                                   |
| ---------------------- | ---------------------------- | ------------------------- | ------------ | ----------------------------------------------------------------------------- |
| 🔴 **Інциденти**       | `TELEGRAM_TOPIC_INCIDENTS`   | on-call (зараз = founder) | P0           | Production breakage: 5xx сплески, deploy fail, security audit failure         |
| 💰 **Виторг**          | `TELEGRAM_TOPIC_REVENUE`     | founder                   | P0           | Subscription create/fail, бюджет перевищений, mono enrichment alerts          |
| ⚙️ **Контрол-план**    | `TELEGRAM_TOPIC_META`        | on-call                   | P0           | n8n control plane: WF-98 dead-letters, WF-99 heartbeat, intra-pipeline errors |
| 🟡 **Опс**             | `TELEGRAM_TOPIC_OPS`         | founder                   | P1           | Бекапи, deploy success, DB health, Railway-side housekeeping                  |
| 🛠️ **Інженерія**       | `TELEGRAM_TOPIC_ENGINEERING` | founder                   | P1           | Renovate PRs (review-needed), stale PRs, repo hygiene                         |
| 🚀 **Зростання**       | `TELEGRAM_TOPIC_GROWTH`      | growth lead (=founder)    | P2           | PostHog daily, growth funnel, acquisition channels                            |
| 📊 **Дайджести**       | `TELEGRAM_TOPIC_DIGEST`      | founder                   | P2           | Тижневі/місячні фінансові, продуктові, операційні дайджести                   |
| 📤 **(DM, not topic)** | _(N/A — `/api/push/send`)_   | end users                 | P2           | User-facing push: WF-07 ранковий брифінг, WF-09 streak, WF-10 борги           |

## Workflow → topic matrix

Цей розділ — **canonical mapping**. Зміна workflow без оновлення цієї таблиці
ламає [Hard Rule #15](../../AGENTS.md#15-read-governance-before-coding-update-docs-alongside-code-internal-docs-in-ukrainian).

| WF     | File                                  | Topic              | Tier   | Cadence                      | Owner    | Escalation if `error`                  |
| ------ | ------------------------------------- | ------------------ | ------ | ---------------------------- | -------- | -------------------------------------- |
| **01** | `01-billing-pipeline.json`            | `#revenue`         | **P0** | Stripe webhook               | ops      | WF-98 → `#meta` + email                |
| **02** | `02-failed-payment-recovery.json`     | `#revenue`         | **P0** | Stripe webhook               | ops      | WF-98 → `#meta` + email                |
| **03** | `03-sentry-alert-routing.json`        | `#incidents`       | **P1** | Sentry webhook               | ops      | WF-98 → `#meta` + email                |
| **04** | `04-daily-backup-verification.json`   | `#ops`             | **P1** | Cron 03:00 UTC               | ops      | WF-98 → `#meta` (no email)             |
| **05** | `05-renovate-pr-auto-handler.json`    | `#engineering`     | **P1** | GitHub webhook               | devex    | WF-98 → `#meta` (no email)             |
| **06** | `06-mono-webhook-enrichment.json`     | `#revenue`         | **P1** | Mono webhook                 | finyk    | WF-98 → `#meta` (no email)             |
| **07** | `07-morning-briefing-push.json`       | DM (push)          | **P2** | Cron 07:30 Kyiv              | product  | WF-98 → `#meta` (no email)             |
| **08** | `08-weekly-financial-digest.json`     | `#digest`          | **P2** | Cron Sun 20:00 Kyv           | finyk    | WF-98 → `#meta` (no email)             |
| **09** | `09-habit-streak-alert.json`          | DM (push)          | **P2** | Cron 21:00 Kyiv              | product  | WF-98 → `#meta` (no email)             |
| **10** | `10-debt-receivable-reminder.json`    | DM (push) + `#ops` | **P2** | Cron 10:00 Kyiv              | finyk    | WF-98 → `#meta` (no email)             |
| **15** | `15-railway-deployment-notify.json`   | `#ops` ⁽²⁾         | **P2** | Railway webhook              | ops      | WF-98 → `#meta` (no email)             |
| **16** | `16-posthog-daily-metrics.json`       | `#growth`          | **P2** | Cron 09:00 Kyiv              | growth   | WF-98 → `#meta` (no email)             |
| **17** | `17-github-pr-stale-alert.json`       | `#engineering`     | **P2** | Cron Mo–Fr 10:00             | devex    | WF-98 → `#meta` (no email)             |
| **18** | `18-nightly-security-audit.json`      | `#incidents` ⁽³⁾   | **P1** | Cron 04:00 UTC               | security | WF-98 → `#meta` + email                |
| **19** | `19-db-health-report.json`            | `#ops`             | **P1** | Cron Mon 07:00               | ops      | WF-98 → `#meta` (no email)             |
| **20** | `20-agent-dispatcher.json`            | `#engineering`     | **P1** | Console/OpenClaw webhook ⁽⁴⁾ | agents   | WF-98 → `#meta` (no email)             |
| **30** | `30-ai-memory-daily-digest.json`      | `#digest`          | **P2** | Cron 09:05 Kyiv              | ops      | WF-98 → `#meta` (no email)             |
| **60** | `60-growth-funnel-snapshot.json`      | `#growth`          | **P2** | Cron 02:30 Kyiv              | growth   | WF-98 → `#meta` (no email)             |
| **63** | `63-growth-acquisition-snapshot.json` | `#growth`          | **P2** | Cron 02:35 Kyiv              | growth   | WF-98 → `#meta` (no email)             |
| **98** | `98-error-handler.json`               | `#meta`            | **P0** | n8n error trigger            | ops      | _none_ (anti-loop, no `errorWorkflow`) |
| **99** | `99-heartbeat.json`                   | `#meta`            | **P0** | Cron \*/3h                   | ops      | Email fallback (Resend)                |

⁽²⁾ Якщо deploy `failed` — WF-15 шле в `#incidents` (через тернарне
expression у `message_thread_id`: `{{ $json.ok ? $env.TELEGRAM_TOPIC_OPS :
$env.TELEGRAM_TOPIC_INCIDENTS }}`). Вкажи обидва топіки в env vars,
оновлення робити там, не у matrix.

⁽³⁾ WF-18 шле в `#incidents` тільки коли GitHub Actions audit job має `conclusion=failure`. Success runs мовчать.

⁽⁴⁾ WF-20 приймає hybrid agent-network envelope і від
`source="telegram-console"`, і від `source="openclaw"`. Envelope містить
`taskId`, `actor`, `intent`, `statusCallback`, `artifacts` і маршрутизується у
specialist lane. Поточні OpenClaw Phase 4 write-tools не виконуються через
WF-20: dispatcher може повернути `proposedWriteTool`, але side effect іде
ADR-0036 path через console-side approval і `/api/internal/openclaw/write/*`.
Поле `source` — лише audit/routing metadata; mutating actions завжди потребують
explicit Telegram approval. CI/test/check задачі маршрутизуються в specialist
lane `qa-release`.

## Escalation flow (hierarchy of pain)

```
        ┌──────────────────┐
        │  WF-* triggers   │
        │  (cron/webhook)  │
        └────────┬─────────┘
                 │ success
                 ▼
   ┌──────────────────────────┐
   │ Topic-targeted message   │  ← P0–P2: 1–N people see it
   │ in `Sergeant Ops` super- │
   │ group                    │
   └──────────────────────────┘
                 │ error in workflow
                 ▼
   ┌──────────────────────────┐
   │ WF-98 error-handler      │  ← P0 fan-out
   │ → Postgres `n8n_errors`  │
   │ → Telegram `#meta`       │
   │ → Resend email (P0 only) │
   └────────┬─────────────────┘
            │ heartbeat lost > 6h
            ▼
   ┌──────────────────────────┐
   │ WF-99 heartbeat          │  ← P0 always
   │ → Telegram `#meta`       │
   │ → Resend email           │
   └──────────────────────────┘
```

## Hard rules

1. **Кожен новий workflow → запис у цьому файлі ДО merge.** PR без оновлення matrix не проходить ревью (Hard Rule #15: docs alongside code).
2. **Workflow тігерається в Telegram → один topic.** Не cross-post.
3. **Workflow user-facing push (WF-07/09/10) → ніколи не світить персональні дані юзера в supergroup.** Тільки агрегати у `#ops` summary.
4. **Зміна `riskTier` у `manifest.json` → одночасна зміна tier у цій таблиці.** Ці два значення повинні бути ідентичні; mismatch ловить `pnpm ops:n8n:validate` після майбутнього розширення (див. roadmap нижче).
5. **WF-98 error workflow → жодного `errorWorkflow` посилання.** Anti-loop інваріант. Якщо нова правка це ламає — виправляти негайно (відомий regression-spot, перевірити PR [#1294](https://github.com/Skords-01/Sergeant/pull/1294)).

## Operating procedure

### При додаванні нового workflow

1. Скопіюй секцію в matrix зразу як піднімаєш PR з JSON.
2. Topic — обери з 8 існуючих. Не створюй новий topic без оновлення цього файлу + ADR-0030.
3. Tier — узгоджений з owner модуля (див. [`AGENTS.md` § Module ownership map](../../AGENTS.md#module-ownership-map)).
4. Owner — формат збігається з полем `manifest.json.owner`.
5. Cadence — точний cron string або тип webhook.
6. Escalation: за замовчуванням `WF-98 → #meta`. Email-fallback тільки для P0.

### При зміні існуючого workflow

- Якщо змінюється `riskTier`, `cadence`, або topic → onour матрицю.
- Якщо змінюється тільки content/копірайт меседжа → оновлювати matrix не треба.
- Якщо нова env var → `manifest.json.requiredEnv` + `ops/.env.ops.example` + `ops/README.md` (env var table).

### При retiring workflow

1. Видалити рядок з matrix.
2. Перевести запис у `manifest.json` на `status: "draft"` ДО реального видалення JSON.
3. Перевірити, що жоден інший workflow не посилається на нього як на `errorWorkflow`.

## Future (roadmap, не блокери)

Цей розділ збирає очевидні наступні кроки. **Жоден з них не зашкоджує
поточному setup-у** — це поступове підвищення прозорості та автоматизації.

- **Machine-readable mapping.** Додати поля `telegramTopic` + `audienceTier` у
  `manifest.schema.json` + cross-check у `pnpm ops:n8n:validate`. Поки —
  matrix власноруч узгоджена, але не валідована автоматично.
- **Acknowledge button.** WF-98 dead-letter повідомлення у `#meta` має містити
  inline-button `Acknowledge` → bot endpoint → запис у Postgres
  `n8n_errors.acknowledged_at`. Розблоковує auto-digest "unacked alerts".
- **HubChat slash commands.** `/n8n status`, `/n8n recent-errors`, `/n8n ack
<id>` — доступні з Telegram через існуючу HubChat інтеграцію (див.
  [`docs/superpowers/`](../../docs/superpowers/)).
- **Per-user push tracking.** WF-07/09/10 поки що логують тільки агрегати; для
  P2-grade engagement metrics — додати `push_send_log` таблицю + WF-\* запис на
  send/dispatch result.
- **Migration trigger reminders.** Як тільки виконується одна з умов з
  [`docs/observability/telegram-control-plane.md`](../../docs/observability/telegram-control-plane.md)
  ("When to migrate"), піднімати ADR-0031 на повноцінний control plane (Slack
  - on-call rotations).
- **Hybrid agent specialist lanes.** WF-20 уже є validation/router foundation
  для `source="openclaw"` і `source="telegram-console"`. Наступний automation
  крок — додати реальні lane workflows: `qa-release` генерує CI/PR report,
  `repo-architect` створює GitHub issue або review report, `n8n-automation`
  готує workflow proposal, `security` повертає audit report, а n8n шле final
  callback назад у OpenClaw DM через `statusCallback`.

## Related

- [`../README.md`](../README.md) — operational README з env vars і compose-стеком.
- [`../../docs/observability/telegram-control-plane.md`](../../docs/observability/telegram-control-plane.md) — архітектурний аналіз: чи Telegram = правильний контрол-план.
- [`../../docs/adr/0030-telegram-reporting-channel-structure.md`](../../docs/adr/0030-telegram-reporting-channel-structure.md) — формальне рішення.
- [`../../docs/adr/0026-n8n-workflow-source-of-truth.md`](../../docs/adr/0026-n8n-workflow-source-of-truth.md) — Git-as-truth для n8n.
- [`../../docs/playbooks/modify-n8n-workflow.md`](../../docs/playbooks/modify-n8n-workflow.md) — playbook на додавання/зміну workflow.
- [`../../docs/observability/runbook.md`](../../docs/observability/runbook.md) — incident runbook (що робити, коли спрацював алерт).
