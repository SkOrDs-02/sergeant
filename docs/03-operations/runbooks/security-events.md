# Security Events — Операційний Playbook

> **Last validated:** 2026-06-09 by @claude. **Next review:** 2026-09-07.
> **Status:** Active

## Загальна архітектура

Пайплайн security events (`apps/server/src/obs/securityEvents.ts`) генерує
типізовані, rate-limited сигнали щоразу, коли API-сервер виявляє аномальний або
security-релевантний стан. Сигнали:

1. Логуються через Pino на відповідному рівні (таблиця нижче).
2. Пушаться у Telegram (`SERGEANT_OPS_CHAT_ID`) через `SERGEANT_ALERT_BOT_TOKEN`.

Rate limit: **макс. 10 подій на тип події на 60-секундне вікно** — подавлені
події фіксуються у `security_event_rate_limited` Pino warn-ах.

---

## Довідник подій

### `mono_webhook_bad_payload`

**Severity:** `high`
**Рівень Pino:** `error`

Monobank webhook POST не пройшов Zod-валідацію до будь-якого запису в БД.
Payload вважається ненадійним; масив `issues` логується (сирий payload не
ехується).

**Можливі причини:**

- Monobank змінив схему webhook (breaking change upstream).
- Зловмисник пробує endpoint із деформованими payload-а��и.
- Баг інтеграції у стороньому webhook-форвардері.

**Реакція:**

1. Перевірити поле `issues` у Pino-лозі для визначення проблемних Zod-шляхів.
2. Якщо changelog Monobank API підтверджує зміну схеми — оновити
   `WebhookPayloadSchema` у `modules/mono/webhook.ts`.
3. Якщо rate сталий (>50/хв з одного IP) — розглянути додавання IP-rate-limit
   на `POST /api/mono/webhook` у конфігурації rate-limit-у.
4. Корелювати з `mono_webhook_received_total{status="bad_payload"}` у
   Grafana dashboard `mono-webhook`.

---

### `auth_session_ua_drift`

**Severity:** `medium`
**��івень Pino:** `warn`

Виявлено зсув fingerprint сесії: user-agent або IP-префікс змінився між
збереженим fingerprint-ом сесії та поточним запитом (H3 hardening).

**Важливо:** Одиничний drift-event **не є** доказом компрометації. Користувачі
легітимно змінюють мережі (мобільна → WiFi) і оновлюють браузери. Ця подія —
forensics-сигнал, не автоматичне блокув��ння.

**Можливі причини:**

- Користувач змінив мережу (домашня → мобільна).
- Браузер або ОС оновились, змінивши UA-рядок.
- Спільне використання облікових даних / крадіжка сесії (сталий патерн з
  різних IP).
- Ротація VPN або проксі.

**Реакція:**

1. Одинична подія: спостерігати, але не діяти. Зафіксувати `userIdHash` для
   кореляції.
2. Сталий патерн (один `userIdHash`, багато різних IP-префіксів за хвилини):
   ескалювати. Розглянути примусову повторну автентифікацію через адмін-панель
   або через `DELETE FROM session WHERE user_id = ?` у БД.
3. Сталий патерн по багатьох `userIdHash`-значеннях: можлива інфраструктурна
   проблема (load balancer видаляє `X-Forwarded-For`, clock skew). Перевірити
   інфру.

---

### `prompt_injection_attempt`

**Severity:** `high`
**Р��вень Pino:** `error`

Блок `tool_result`, повернутий до chat-ендпоінту, містив маркер
prompt-injection (наприклад «ignore previous instructions», `<system>`,
«act as evil AI»). Контент все одно був переданий моделі всередині конверта
`<tool_output>` (M8 hardening), що інструктує модель трактувати його як дані.

**Можливі причини:**

- Компрометований upstream: поле `description` Mono webhook, відповідь n8n
  webhook або відповідь GitHub API містять injected-текст.
- Зловмисник сформував шкідливу відповідь tool (для цього потрібно скомпрометувати
  шлях виконання tool або підʼязаний акаунт користувача).
- Хибне спрацювання: легітимний текст збігся з широким патерном (наприклад
  витяг із блогпосту про AI-безпеку, що містить «ignore previous instructions»).

**Реакція:**

1. Перевірити мітку `tool` у лозі для ідентифікації tool, що спрацював.
2. Якщо `tool=unknown` — отримано сирий блок `tool_result`; перевірити клієнт
   на пошкодження стану.
3. Перевірити upstream-джерело для цього tool (Mono API, n8n-workflow, GitHub).
4. Якщо патерн є хибним спрацьовуванням — переглянути `PROMPT_INJECTION_PATTERNS`
   у `modules/chat/toolOutputWrapping.ts` і звузити regex, якщо безпечно.
5. Якщо сталий: розглянути тимчасове вимкнення відповідного tool через
   runtime kill-switch або видалення з `TOOLS` у `modules/chat/tools.ts`.

---

### `transcribe_usd_cap_hit`

**Severity:** `medium`
**Рівень Pino:** `warn`

Користувач досяг щоденного USD-cap на ендпоінті `/api/transcribe` (H9
hardening). Запит відхилено з HTTP 402.

**Можливі причини:**

- Легітимне велике навантаження (користувач транскрибував багато довгих
  аудіофайлів).
- Ав��оматизовані зловживання: бот повторно надсилає аудіо для вичерпання
  щоденного ліміту (DoS-атака на квоту користувача або cost amplification).

**Реакція:**

1. Cap налаштовується через `TRANSCRIBE_USD_CAP_PER_USER_PER_DAY_USD` env.
   Перевірити значення `bucket` і `cap_micros` у лозі.
2. Для розблокування конкретного користувача: вручну скинути рядок cap:
   ```sql
   DELETE FROM transcribe_usd_usage
   WHERE subject_key = '<subject>' AND usage_day = CURRENT_DATE;
   ```
3. Якщо один користувач щодня досягає cap через легітимне використання —
   підняти cap або звʼязатися щодо патернів використання.
4. Якщо кілька користувачів одночасно досягають cap (масові зловживання) —
   посилити rate-limit на `/api/transcribe` у конфігурації та оповістити Ops.

---

### `chat_tool_cap_hit`

**Severity:** `high` (client_request) / `medium` (anthropic_response)
**Рівень Pino:** `error` (high) / `warn` (medium)

Перевищено ліміт ітерацій tool (`MAX_TOOL_ITERATIONS = 8`). Запит відхилено
з HTTP 422 (M7 hardening).

**`boundary=client_request`** — клієнт надіслав більше `MAX_TOOL_ITERATIONS`
блоків `tool_result` в одному запиті. Це або:

- Маніпульований / деформований client payload (найімовірніше — зловживання).
- Баг на стороні клієнта, де вивід виконання tool був продубльований.

**`boundary=anthropic_response`** — модель Anthropic повернула більше
`MAX_TOOL_ITERATIONS` блоків `tool_use` в одній відповіді (runaway model loop).

**Реакція:**

1. `boundary=client_request` (high severity):
   - Перевірити значення `observed` відносно `MAX_TOOL_ITERATIONS` щоб оцінити
     перевищення.
   - Якщо сталий від одного користувача: перевірити на автоматизацію / scripted
     abuse.
   - Якщо від кількох користувачів після оновлення клієнта: ймовірно
     client-side bug; координувати з mobile/web-командою для виправлення
     tool-execution loop.
2. `boundary=anthropic_response` (medium severity):
   - Зазвичай тимчасова поведінка моделі. Моніторити rate.
   - Якщо сталий: переглянути недавні зміни prompt/tool definition, що можуть
     змушувати модель пропонувати надмірні паралельні tool-виклики.

---

## Тимчасове вимкнення алертів

Встановити `SECURITY_EVENTS_MUTED=1` у Railway-середовищі сервера для
придушення Telegram-push для всіх security events без впливу на Pino-логування
або Prometheus-метрики. Корисно під час load-тестів, запланованого технічного
обслуговування або під час розслідування патерну хибних спрацьовувань з
великим обсягом.

**Вимкнути:**

```
railway variables set SECURITY_EVENTS_MUTED=1 --service api
```

**Увімкнути:**

```
railway variables set SECURITY_EVENTS_MUTED=0 --service api
```

Або видалити змінну повністю — emitter трактує будь-яке значення, відмінне від
`"1"`, як «не вимкнено».

---

## Prometheus-запити

```promql
# Rate security events за типом (вікно 5 хв)
sum by (event) (rate(security_event_rate_limited[5m]))

# Кореляція: rate поганих payload-ів vs. загальний rate mono webhook
rate(mono_webhook_received_total{status="bad_payload"}[5m])
  / rate(mono_webhook_received_total[5m])

# Спрацювання tool cap за boundary (M7)
rate(chat_tool_iteration_cap_hit_total[5m]) by (boundary)

# Rate спроб prompt injection за tool (M8)
rate(chat_prompt_injection_attempt_total[5m]) by (tool)

# події cap transcribe
rate(transcribe_usd_cap_events_total{outcome="cap_hit"}[1h])
```
