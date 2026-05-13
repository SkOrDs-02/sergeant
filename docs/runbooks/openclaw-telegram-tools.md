# OpenClaw Telegram tools — `read_telegram_topic_history`

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Operational runbook для LLM tool-у `read_telegram_topic_history` (PR-35,
Pain P8 з [`docs/planning/pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md)).
Покриває (a) як перевірити stack-and-config, (b) що означають структуровані
помилки в response, (c) як degrade-аєш-degrade-аєш при flood-control /
forbidden Telegram-у.

## Що робить інструмент

LLM-агент (OpenClaw cofounder-bot) викликає `read_telegram_topic_history`
з аргументами `{ topic, since?, limit? }` через HTTP route
`POST /api/internal/openclaw/telegram`. Backed by:

1. **`tg_topic_archive`** (migration 047) — primary historical source.
   Populated by n8n `/alerts/post` webhook + OpenClaw `post_to_topic`
   write-tool. **Manual sends from human accounts не потрапляють** у
   архів — лімітація by design.
2. **Telegram Bot API `getChat` probe** — валідує bot access, surface-ить
   `403 forbidden` / `429 rate-limit` як структуровану помилку
   (`response.error = { code, message, retryAfter? }`) замість 5xx-у.
3. **Optional Bot API `getUpdates` merge** — коли
   `OPENCLAW_TELEGRAM_FETCH_UPDATES=true` (webhook-mode bots only),
   останні `limit` повідомлень з топіка merge-аються з архівом перед
   поверненням LLM-у.

Реалізація: <code>apps/server/src/modules/openclaw/tools.ts ::
readTelegramTopicHistory</code>. Тонкий wrapper Telegram Bot API живе у
[`apps/server/src/modules/telegram/bot-client.ts`](../../apps/server/src/modules/telegram/bot-client.ts).

## Env vars (всі мають бути set перед on-call)

| Env var                           | Role                                                                                                             | Default | Required                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- | ----------------------- |
| `SERGEANT_ALERT_BOT_TOKEN`        | Bot API token (shared з `postToTopic` write-tool).                                                               | _empty_ | Так (інакше архів-only) |
| `SERGEANT_OPS_CHAT_ID`            | Supergroup chat id (negative integer string, e.g. `-1001234567890`).                                             | _empty_ | Так                     |
| `TELEGRAM_TOPIC_OPS`              | `message_thread_id` для топіка `ops`.                                                                            | _empty_ | Опц.                    |
| `TELEGRAM_TOPIC_ENGINEERING`      | `message_thread_id` для топіка `engineering`.                                                                    | _empty_ | Опц.                    |
| `TELEGRAM_TOPIC_GROWTH`           | `message_thread_id` для топіка `growth`.                                                                         | _empty_ | Опц.                    |
| `TELEGRAM_TOPIC_HISTORY_LIMIT`    | Default `limit` коли caller не передає (clamped 1..100).                                                         | `100`   | Опц.                    |
| `OPENCLAW_TELEGRAM_FETCH_UPDATES` | `true`/`1` → merge live `getUpdates` у responses. **Тільки** для webhook-mode bots; long-poll → залишай `false`. | `false` | Опц.                    |

> Тип `boolFromEnv`: `"true"|"1"` → true, інше → default. Стрічка
> `"false"` теж false (не як `z.coerce.boolean()`).

## Shape response-у

```jsonc
{
  "topic": "ops",
  "topicId": 42, // resolved з TELEGRAM_TOPIC_<KEY>, null якщо unmapped
  "origin": "archive" | "bot_api" | "merged",
  "messages": [
    {
      "id": 100,
      "from": "@skords" | "n8n" | null,
      "text": "deploy started",
      "date": "2026-05-13T10:00:00.000Z",
      "replyToMessageId": 99,
      "source": "alert" | "post_to_topic" | "bot_api"
    }
  ],
  "note": "tg_topic_archive returned no rows..." // тільки коли empty + no error
  "error": {
    "code": "rate_limit" | "forbidden" | "api_error",
    "message": "Forbidden: bot was kicked from the supergroup chat",
    "retryAfter": 30 // тільки для rate_limit
  }
}
```

## Decode structured errors

| `error.code`       | HTTP cause                  | Action                                                                                                                                                                                                         |
| ------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forbidden`        | `getChat` → 401/403         | Bot був видалений з чату / ніколи не приєднаний / wrong token. Перевір `SERGEANT_ALERT_BOT_TOKEN` (rotate-ai-secrets playbook); peek у Telegram-у, чи бот ще в чаті; за потреби — `/promote` йому права admin. |
| `rate_limit`       | `getChat` → 429             | Telegram flood control. `error.retryAfter` (seconds) — мінімум перед наступним call-ом. Архівні дані повертаються — LLM показує що має. Не retry-ай <30s.                                                      |
| `api_error`        | Будь-яка інша Bot API error | Network / unknown 4xx-5xx. Перевір `apps/server` logs (модуль `openclaw`/`http`) на details. Часто — temporary; retry після 30-60s.                                                                            |
| `note` (без error) | Empty result                | `tg_topic_archive` порожній на цей топік+window. Норма для топіків з low activity. Hint LLM-у: «нічого не відбулося».                                                                                          |

## Smoke-test без LLM (curl)

```bash
INTERNAL_API_KEY="$(railway variables --service api | grep INTERNAL_API_KEY | cut -d= -f2-)"
API_BASE="https://api.sergeant.app"

curl -sS "$API_BASE/api/internal/openclaw/telegram" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: $INTERNAL_API_KEY" \
  -d '{"topic":"ops","limit":5}' | jq '.'
```

Expected: JSON з полями вище. Якщо `error.code=forbidden` — bot пропав з
чату. Якщо HTTP 4xx — input validation; перевір `topic` (`ops` /
`engineering` / `growth` / `digest` / `incidents` / `revenue` / `meta`).

## When to escalate

- `forbidden` тримається >5min після bot-rejoin → перевір token rotation
  ([`docs/playbooks/rotate-secrets.md`](../playbooks/rotate-secrets.md)).
- `rate_limit` повторюється з `retryAfter > 300s` → flood-wait
  ескалював; зменш частоту calls (OpenClaw `OPENCLAW_MAX_ITERATIONS`).
- `tg_topic_archive` empty для топіка з guaranteed traffic (e.g. n8n
  alerts publish-ять у `ops` щохвилини, а response empty) → перевір
  n8n workflow execution та `recordAlertPost` route logs.

## Cross-links

- ADR-0031 §5 — original `read_telegram_topic_history` spec.
- PR-35 у [`docs/planning/pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md) — рішення про Bot API probe + structured errors.
- Tool-set overview: [`tools/console/src/agents/openclaw.ts`](../../tools/console/src/agents/openclaw.ts).
- Server tests: [`apps/server/src/modules/openclaw/read-telegram-topic-history.test.ts`](../../apps/server/src/modules/openclaw/read-telegram-topic-history.test.ts), [`apps/server/src/modules/telegram/bot-client.test.ts`](../../apps/server/src/modules/telegram/bot-client.test.ts).
- Adjacent write-tool: `postToTopic` (`apps/server/src/modules/openclaw/write-tools.ts`).
