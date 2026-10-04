# Log retention archive cron

> **Last touched:** 2026-10-03 by @claude (`sync_op_log` rejected-рядки в ретеншені). **Next review:** 2026-12-30.
> **Status:** Active.
> **Code:** [`apps/server/src/modules/logRetention/archivePoller.ts`](../../../apps/server/src/modules/logRetention/archivePoller.ts).

In-process cron that archives audit-trail rows older than
`LOG_RETENTION_DAYS` to a GCS bucket and then DELETEs them. Designed
for compliance — keep the live DB lean while preserving a long-tail
audit log we can spelunk.

## Tables under retention

| Таблиця                | Timestamp column | Що зберігає                                                                                                    |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `openclaw_invocations` | `invoked_at`     | OpenClaw agent виклики (cost, tool-calls, status) — ADR-0036                                                   |
| `tg_alert_acks`        | `posted_at`      | Telegram alert ACK history (P0–P3, escalation tiers) — ADR-0038                                                |
| `n8n_webhook_events`   | `received_at`    | n8n webhook replay history (PR-28) — also independently DELETE-d by `retentionPoller.ts`                       |
| `sync_op_log`          | `server_ts`      | **Лише `status = 'rejected'`**, TTL 30 днів (власний, не `LOG_RETENTION_DAYS`), без колонки `row` — див. нижче |

The table list is hard-coded in
`apps/server/src/modules/logRetention/archivePoller.ts`
(`DEFAULT_ARCHIVE_TABLES`). Adding a new table requires a code review —
not just a SQL migration.

### `sync_op_log`: лише відхилені оп-и

Відхилений sync-оп (`status = 'rejected'`) потрібен тільки для анти-реплею
(ідемпотентність за `idempotency_key`): pull і SSE читають виключно
`status = 'applied'`. Тому:

- `syncV2Push` для відхиленого опа пише в `row` мінімальне `{}` (колонка
  `NOT NULL`), а не повний payload (`data-48`, аудит 2026-10-01);
- поллер бере `sync_op_log` з предикатом `status = 'rejected'` (і в SELECT,
  і в DELETE) та TTL 30 днів - константа `SYNC_OP_LOG_REJECTED_RETENTION_DAYS`;
  в архів їдуть метадані без `row` (у старих відхилених рядків там повний
  payload до 256 КБ);
- `applied`-рядки **не видаляються**: це журнал, по якому курсором ходить
  pull. Їхній ретеншен (ADR-0065) - окрема робота;
- повтор відхиленого `idempotency_key` після TTL знову проходить apply.

Поллер працює лише з `LOG_ARCHIVE_ENABLED=true` і заданим
`GCS_LOG_ARCHIVE_BUCKET`; без цього рядки `sync_op_log` не чистяться (але й
нові відхилені більше не несуть payload).

## Env vars

| Env                            | Default           | Що робить                                                                                         |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------- |
| `LOG_ARCHIVE_ENABLED`          | `false`           | Master switch. Opt-in. Без `true` poller — no-op.                                                 |
| `LOG_RETENTION_DAYS`           | `30`              | Скільки днів зберігати rows у live DB перед archive+DELETE. `0` → poller не запускається.         |
| `LOG_ARCHIVE_POLL_INTERVAL_MS` | `3_600_000` (1 h) | Інтервал tick-у. `0` → off.                                                                       |
| `LOG_ARCHIVE_BATCH_SIZE`       | `1000`            | Скільки рядків брати у батч на таблицю на tick. Великі backlog-и дренуються через кілька tick-ів. |
| `GCS_LOG_ARCHIVE_BUCKET`       | _empty_           | Цільовий GCS бакет. Пусто → poller лоґує warning і пропускає upload-и (rows залишаються у DB).    |

Авторизація — стандартні Google App Default Credentials. На Coolify —
зазвичай `GOOGLE_APPLICATION_CREDENTIALS` указує на service-account JSON
у secret-file / env (той самий механізм, що FCM-клієнт у
`apps/server/src/push/fcmClient.ts`).

## Об'єктний шлях у GCS

```
gs://${GCS_LOG_ARCHIVE_BUCKET}/openclaw-archive/${YYYY-MM-DD}/${table}__${minId}-${maxId}.jsonl.gz
```

Приклад:

```
gs://sergeant-log-archive/openclaw-archive/2026-05-15/openclaw_invocations__19345-20344.jsonl.gz
```

Чому саме така схема:

- **Date prefix** дозволяє GCS lifecycle rule «delete objects older
  than 365 days» — без додаткового state у нашому коді.
- **ID range** у назві дає змогу швидко знайти конкретний row при
  audit-spelunking (без розпаковки cmd-line: `gsutil cp gs://...`,
  `zcat | jq 'select(.id=="…")'`).

## GCS lifecycle policy (recommend)

Налаштувати у бакеті, де лежить архів:

```jsonc
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 365 },
      },
    ],
  },
}
```

365 днів покривають compliance window. Якщо потрібен довший — bump
`age` у GCS bucket; код не змінюється.

## Failure modes

| Сценарій                                | Що відбувається                                                                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOG_ARCHIVE_ENABLED=false`             | Poller — no-op. Existing `WebhookEventsRetentionPoller` (PR-28) сам гасить `n8n_webhook_events`. Інші таблиці ростуть.                                          |
| `GCS_LOG_ARCHIVE_BUCKET` empty          | Poller лоґує warning при start-і, runOnce — no-op (rows у DB).                                                                                                  |
| `LOG_RETENTION_DAYS=0`                  | Poller stop-и при start-і («retention_zero»).                                                                                                                   |
| GCS upload failure (503, auth, network) | Sentry `level=warning` capture + `openclaw_log_archive_rows_total{outcome="upload_failed"}` +N. Rows у DB лишаються. Наступний tick перевиконає той самий батч. |
| Empty batch (no rows under TTL)         | `openclaw_log_archive_rows_total{outcome="noop"}` (інкремент на 0 — для liveness графу).                                                                        |
| Concurrent `runOnce`                    | Re-entry-guard повертає `{}` (без race-ів на той самий батч).                                                                                                   |

## Метрика

```
openclaw_log_archive_rows_total{table,outcome}
```

`outcome` ∈ `archived` | `upload_failed` | `noop`. Grafana-query для
готового бэклогу:

```promql
sum by (table) (rate(openclaw_log_archive_rows_total{outcome="archived"}[1h]))
```

Алерт-кандидат: `outcome="upload_failed"` rate > 0 протягом > 24 год →
GCS-bucket / auth misconfig.

## Co-existence with PR-28 webhook retention

Old `WebhookEventsRetentionPoller`
(`apps/server/src/modules/webhooks/retentionPoller.ts`) залишається у
проді як safety net. Коли archive вимкнено (default), webhook poller
гасить `n8n_webhook_events` сам — без архіву. Коли archive увімкнено,
обидва pollers активні; race нешкідливий (filter-предикат однаковий —
переможець видаляє рядок, переможений видаляє 0).

Інші таблиці (`openclaw_invocations`, `tg_alert_acks`, `sync_op_log`) — only під
archive poller-ом. Без opt-in вони ростуть.

## Run a single tick (operator)

Зараз endpoint-у для on-demand tick-у немає; найшвидший спосіб —
тимчасово знизити interval до 10 секунд через
`LOG_ARCHIVE_POLL_INTERVAL_MS=10000` і перезапустити сервер. Якщо
підпиратимемо on-demand admin-endpoint у майбутньому — додамо
`POST /api/internal/log-archive/run-once` у наступному PR-і.

## Місцевий smoke-test

```bash
LOG_ARCHIVE_ENABLED=true \
LOG_ARCHIVE_POLL_INTERVAL_MS=5000 \
LOG_RETENTION_DAYS=0 \                              # форс-no-op без TTL
GCS_LOG_ARCHIVE_BUCKET=test-bucket \
GOOGLE_APPLICATION_CREDENTIALS=~/gcs-sa.json \
pnpm dev:server
```

Стани (`log_archive_poller_started`, `log_archive_batch_done`,
`log_archive_upload_failed`) візьмеш через `pino-pretty` у stdout.
